variable "subscription_id" {
  description = "Azure subscription ID. Leave null to use the active Azure CLI or ARM_SUBSCRIPTION_ID context."
  type        = string
  default     = null
}

variable "resource_group_name" {
  description = "Existing Azure resource group where the dev bastion will be deployed."
  type        = string
  default     = "RG_300000000078783_Telstra_CDE_and_CMS_PSM"
}

variable "location" {
  description = "Azure region for bastion resources. Leave null to use the resource group location."
  type        = string
  default     = null
}

variable "environment_name" {
  description = "Environment tag/name for the bastion."
  type        = string
  default     = "dev"
}

variable "workload_name" {
  description = "Workload name used in tags and generated names."
  type        = string
  default     = "gs-mfa"
}

variable "name_prefix" {
  description = "Name prefix for bastion resources."
  type        = string
  default     = "gs-mfa-dev-bastion"
}

variable "admin_username" {
  description = "Linux admin username for SSH and Ansible."
  type        = string
  default     = "azureuser"
}

variable "ssh_public_key" {
  description = "SSH public key text allowed to log in as admin_username."
  type        = string
  sensitive   = true

  validation {
    condition     = length(trimspace(var.ssh_public_key)) > 0
    error_message = "ssh_public_key must be supplied."
  }
}

variable "ansible_ssh_private_key_file" {
  description = "Local private key path to include in the deployment console config output."
  type        = string
  default     = "~/.ssh/id_rsa"
}

variable "local_app_repo_path" {
  description = "Local control-machine checkout path to include in deployment console config when using copy source strategy."
  type        = string
  default     = "/Users/manju.krishnappa/workspace/cgi/cgi_github/gs-pov-harness-agent"
}

variable "vm_size" {
  description = "Azure VM size for the dev bastion."
  type        = string
  default     = "Standard_B2s"
}

variable "os_disk_size_gb" {
  description = "OS disk size in GiB."
  type        = number
  default     = 64
}

variable "allowed_ssh_cidrs" {
  description = "CIDR ranges allowed to SSH to the bastion. Restrict this before use outside a sandbox."
  type        = list(string)
  default     = ["0.0.0.0/0"]
}

variable "enable_console_ingress" {
  description = "Open the deployment console port directly. Prefer SSH tunneling unless this is explicitly needed."
  type        = bool
  default     = false
}

variable "allowed_console_cidrs" {
  description = "CIDR ranges allowed to reach the deployment console port when enable_console_ingress is true."
  type        = list(string)
  default     = []
}

variable "console_port" {
  description = "Deployment console TCP port."
  type        = number
  default     = 8765
}

variable "create_virtual_network" {
  description = "Create a new VNet/subnet for the bastion. Set false to use an existing subnet."
  type        = bool
  default     = true
}

variable "virtual_network_name" {
  description = "VNet name to create or use."
  type        = string
  default     = "vnet-gs-mfa-dev-bastion"
}

variable "virtual_network_resource_group_name" {
  description = "Resource group of an existing VNet when create_virtual_network is false. Defaults to resource_group_name."
  type        = string
  default     = null
}

variable "virtual_network_address_space" {
  description = "Address space used when creating the VNet."
  type        = list(string)
  default     = ["10.42.0.0/24"]
}

variable "subnet_name" {
  description = "Subnet name to create or use."
  type        = string
  default     = "snet-bastion"
}

variable "subnet_address_prefixes" {
  description = "Subnet prefixes used when creating the subnet."
  type        = list(string)
  default     = ["10.42.0.0/27"]
}

variable "private_ip_address" {
  description = "Optional static private IP for the bastion NIC. Leave null for dynamic."
  type        = string
  default     = null
}

variable "install_ansible" {
  description = "Install Ansible on the bastion via cloud-init."
  type        = bool
  default     = true
}

variable "assign_resource_group_contributor" {
  description = "Assign Contributor on resource_group_name to the bastion managed identity. Disable if role assignment permissions are unavailable."
  type        = bool
  default     = false
}

variable "tags" {
  description = "Additional tags for resources."
  type        = map(string)
  default     = {}
}
