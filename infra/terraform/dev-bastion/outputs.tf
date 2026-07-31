output "bastion_public_ip" {
  description = "Public IP address for SSH access to the dev bastion."
  value       = azurerm_public_ip.bastion.ip_address
}

output "bastion_private_ip" {
  description = "Private IP address assigned to the dev bastion NIC."
  value       = azurerm_network_interface.bastion.private_ip_address
}

output "bastion_username" {
  description = "Linux SSH username."
  value       = var.admin_username
}

output "bastion_managed_identity_principal_id" {
  description = "Principal ID for the bastion system-assigned managed identity."
  value       = azurerm_linux_virtual_machine.bastion.identity[0].principal_id
}

output "ssh_command" {
  description = "SSH command using the configured private-key path."
  value       = "ssh -i ${var.ansible_ssh_private_key_file} ${var.admin_username}@${azurerm_public_ip.bastion.ip_address}"
}

output "deployment_console_bastion_json" {
  description = "JSON object that can replace the dev-bastion entry in config/bastions/bastions.json."
  value = jsonencode({
    id                           = "dev-bastion"
    name                         = "Dev Azure bastion"
    ansible_host                 = azurerm_public_ip.bastion.ip_address
    ansible_user                 = var.admin_username
    ansible_ssh_private_key_file = var.ansible_ssh_private_key_file
    vars = {
      gs_source_strategy                       = "copy"
      gs_local_app_repo_path                   = var.local_app_repo_path
      gs_app_repo_path                         = "/home/${var.admin_username}/gs-pov-harness-agent"
      gs_app_repo_url                          = "git@github.com:manjumaikancgi/gs-pov-harness-agent.git"
      gs_app_repo_version                      = "feature/agent-harness-no-foundry"
      gs_rsync_timeout_seconds                 = 900
      gs_rsync_connect_timeout_seconds         = 30
      gs_rsync_delete_remote                   = true
      gs_rsync_verbose_changes                 = false
      gs_rsync_bwlimit_kbps                    = 0
      gs_bootstrap_bastion                     = true
      gs_bootstrap_become                      = true
      gs_azure_login_mode                      = "managed_identity"
      gs_bastion_managed_identity_principal_id = azurerm_linux_virtual_machine.bastion.identity[0].principal_id
    }
  })
}

output "ansible_inventory_yaml" {
  description = "Inventory snippet for running the deployment playbook against this bastion."
  value       = <<-EOT
  all:
    children:
      deployment_controller:
        hosts:
          dev-bastion:
            ansible_host: ${azurerm_public_ip.bastion.ip_address}
            ansible_user: ${var.admin_username}
            ansible_ssh_private_key_file: ${var.ansible_ssh_private_key_file}
  EOT
}
