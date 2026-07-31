data "azurerm_resource_group" "target" {
  name = var.resource_group_name
}

data "azurerm_virtual_network" "existing" {
  count               = var.create_virtual_network ? 0 : 1
  name                = var.virtual_network_name
  resource_group_name = coalesce(var.virtual_network_resource_group_name, var.resource_group_name)
}

data "azurerm_subnet" "existing" {
  count                = var.create_virtual_network ? 0 : 1
  name                 = var.subnet_name
  virtual_network_name = data.azurerm_virtual_network.existing[0].name
  resource_group_name  = data.azurerm_virtual_network.existing[0].resource_group_name
}

locals {
  location = coalesce(var.location, data.azurerm_resource_group.target.location)
  common_tags = merge(
    {
      application = "GS-MFA"
      component   = "deployment-bastion"
      environment = var.environment_name
      managed_by  = "terraform"
      workload    = var.workload_name
    },
    var.tags
  )
  subnet_id                    = var.create_virtual_network ? azurerm_subnet.bastion[0].id : data.azurerm_subnet.existing[0].id
  private_ip_allocation_method = var.private_ip_address == null ? "Dynamic" : "Static"
}

resource "azurerm_virtual_network" "bastion" {
  count               = var.create_virtual_network ? 1 : 0
  name                = var.virtual_network_name
  location            = local.location
  resource_group_name = data.azurerm_resource_group.target.name
  address_space       = var.virtual_network_address_space
  tags                = local.common_tags
}

resource "azurerm_subnet" "bastion" {
  count                = var.create_virtual_network ? 1 : 0
  name                 = var.subnet_name
  resource_group_name  = data.azurerm_resource_group.target.name
  virtual_network_name = azurerm_virtual_network.bastion[0].name
  address_prefixes     = var.subnet_address_prefixes
}

resource "azurerm_network_security_group" "bastion" {
  name                = "nsg-${var.name_prefix}"
  location            = local.location
  resource_group_name = data.azurerm_resource_group.target.name
  tags                = local.common_tags
}

resource "azurerm_network_security_rule" "ssh" {
  name                        = "allow-ssh"
  priority                    = 100
  direction                   = "Inbound"
  access                      = "Allow"
  protocol                    = "Tcp"
  source_port_range           = "*"
  destination_port_range      = "22"
  source_address_prefixes     = var.allowed_ssh_cidrs
  destination_address_prefix  = "*"
  resource_group_name         = data.azurerm_resource_group.target.name
  network_security_group_name = azurerm_network_security_group.bastion.name
}

resource "azurerm_network_security_rule" "console" {
  count                       = var.enable_console_ingress && length(var.allowed_console_cidrs) > 0 ? 1 : 0
  name                        = "allow-deployment-console"
  priority                    = 110
  direction                   = "Inbound"
  access                      = "Allow"
  protocol                    = "Tcp"
  source_port_range           = "*"
  destination_port_range      = tostring(var.console_port)
  source_address_prefixes     = var.allowed_console_cidrs
  destination_address_prefix  = "*"
  resource_group_name         = data.azurerm_resource_group.target.name
  network_security_group_name = azurerm_network_security_group.bastion.name
}

resource "azurerm_subnet_network_security_group_association" "bastion" {
  subnet_id                 = local.subnet_id
  network_security_group_id = azurerm_network_security_group.bastion.id
}

resource "azurerm_public_ip" "bastion" {
  name                = "pip-${var.name_prefix}"
  location            = local.location
  resource_group_name = data.azurerm_resource_group.target.name
  allocation_method   = "Static"
  sku                 = "Standard"
  tags                = local.common_tags
}

resource "azurerm_network_interface" "bastion" {
  name                = "nic-${var.name_prefix}"
  location            = local.location
  resource_group_name = data.azurerm_resource_group.target.name
  tags                = local.common_tags

  ip_configuration {
    name                          = "primary"
    subnet_id                     = local.subnet_id
    private_ip_address_allocation = local.private_ip_allocation_method
    private_ip_address            = var.private_ip_address
    public_ip_address_id          = azurerm_public_ip.bastion.id
  }
}

resource "azurerm_linux_virtual_machine" "bastion" {
  name                            = "vm-${var.name_prefix}"
  location                        = local.location
  resource_group_name             = data.azurerm_resource_group.target.name
  size                            = var.vm_size
  admin_username                  = var.admin_username
  disable_password_authentication = true
  network_interface_ids           = [azurerm_network_interface.bastion.id]
  custom_data = base64encode(templatefile("${path.module}/cloud-init.yml.tftpl", {
    admin_username  = var.admin_username
    install_ansible = var.install_ansible
  }))
  tags = local.common_tags

  admin_ssh_key {
    username   = var.admin_username
    public_key = trimspace(var.ssh_public_key)
  }

  identity {
    type = "SystemAssigned"
  }

  os_disk {
    name                 = "osdisk-${var.name_prefix}"
    caching              = "ReadWrite"
    storage_account_type = "Premium_LRS"
    disk_size_gb         = var.os_disk_size_gb
  }

  source_image_reference {
    publisher = "Canonical"
    offer     = "0001-com-ubuntu-server-jammy"
    sku       = "22_04-lts-gen2"
    version   = "latest"
  }

  boot_diagnostics {}
}

resource "azurerm_role_assignment" "resource_group_contributor" {
  count                = var.assign_resource_group_contributor ? 1 : 0
  scope                = data.azurerm_resource_group.target.id
  role_definition_name = "Contributor"
  principal_id         = azurerm_linux_virtual_machine.bastion.identity[0].principal_id
}
