# Dev Bastion Terraform

This stack deploys a Linux VM that can act as the Good Shepherd dev deployment
bastion for the Ansible playbook and deployment console.

It creates:

- Ubuntu 22.04 Linux VM with SSH key authentication only.
- Static public IP.
- Network security group allowing SSH from configured CIDRs.
- Optional deployment-console ingress on port `8765`.
- New VNet/subnet, or attachment to an existing subnet.
- System-assigned managed identity.
- Optional Contributor assignment on the target resource group.

## Deploy

```bash
cd infra/terraform/dev-bastion
cp terraform.tfvars.example terraform.tfvars
```

Edit `terraform.tfvars`, at minimum:

- `ssh_public_key`
- `allowed_ssh_cidrs`
- `resource_group_name`
- `location`

Then run:

```bash
terraform init
terraform plan
terraform apply
```

## Managed Identity Access

The deployment playbook can use:

```yaml
gs_azure_login_mode: managed_identity
```

For that to work, the VM managed identity needs permissions to update the target
Azure resources. You can set:

```hcl
assign_resource_group_contributor = true
```

If your Terraform caller cannot create role assignments, leave that false and
assign RBAC manually using the `bastion_managed_identity_principal_id` output.

An Azure Owner or User Access Administrator can grant the resource-group access
manually:

```bash
az role assignment create \
  --assignee-object-id "$(terraform output -raw bastion_managed_identity_principal_id)" \
  --assignee-principal-type ServicePrincipal \
  --role Contributor \
  --scope "$(az group show --name RG_300000000078783_Telstra_CDE_and_CMS_PSM --query id -o tsv)"
```

After that grant propagates, the deployment playbook can authenticate on the
bastion with `az login --identity`.

## Deployment Console Config

After apply, get the config snippet:

```bash
terraform output -raw deployment_console_bastion_json
```

Use that JSON object to update the `dev-bastion` entry in:

```text
config/bastions/bastions.json
```

The generated console config uses `gs_source_strategy=copy`, which stages the
local app checkout from the Ansible control machine. This avoids requiring a
GitHub deploy key on the bastion. Switch it to `git` only after adding suitable
GitHub credentials to the bastion or enabling SSH agent forwarding.

The console should usually be reached through an SSH tunnel:

```bash
ssh -L 8765:127.0.0.1:8765 azureuser@<bastion-public-ip>
```

Then run the console on the bastion and browse locally to:

```text
http://127.0.0.1:8765
```
