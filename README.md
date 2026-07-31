# AI-DLC Workflow with Ansible at the Centre

This workflow places **Ansible** at the execution layer of an AI-driven development lifecycle.

## What the flow does

1. A business need or change request enters the workflow.
2. AI helps turn that request into:
   - acceptance criteria
   - target state
   - task breakdown
   - draft playbook or role structure
3. Ansible becomes the central automation engine:
   - inventory defines the targets
   - roles hold reusable logic
   - playbooks orchestrate the change
   - variables and templates carry environment-specific values
4. Human review approves the design and any risky changes.
5. Validation runs before deployment:
   - `ansible-lint`
   - syntax checks
   - Molecule tests
   - assertions against the expected state
6. The approved playbook runs in an ephemeral or lower environment first.
7. Deployment promotes the same Ansible logic through dev, test, stage, and production.
8. Post-deploy verification checks service health and configuration drift.
9. Failures and feedback loop back into the next AI-assisted improvement cycle.

## Why Ansible sits at the centre

Ansible is the control point because it is the tool that actually changes systems in a repeatable way. AI helps generate, refine, and explain the workflow, but Ansible is what makes the change real and auditable.

## Core components

- **AI assistant**: converts intent into tasks, suggests modules, drafts docs, and spots risk.
- **Ansible inventory**: defines hosts, groups, and environments.
- **Ansible roles**: reusable building blocks for app, OS, middleware, and compliance logic.
- **Ansible playbooks**: the execution sequence.
- **Validation layer**: linting, syntax check, and Molecule.
- **CI/CD pipeline**: runs tests and promotes approved changes.
- **Operational checks**: verifies success after deployment.

## Suggested lifecycle

### 1. Discover
Capture the goal, constraints, and target environment.

### 2. Design
Use AI to draft the workflow, role structure, and required variables.

### 3. Build
Generate or refine playbooks and roles.

### 4. Review
Have a human confirm the logic, security, and assumptions.

### 5. Test
Run lint, syntax checks, and Molecule scenarios.

### 6. Deploy
Execute Ansible in controlled environments, then promote.

### 7. Verify
Confirm the target state and service health.

### 8. Learn
Feed results, failures, and diffs back into the next iteration.

## Example control points

- Block unsafe shell usage unless a native module is not available.
- Require idempotency checks before production promotion.
- Store secrets outside playbooks.
- Treat test failures as feedback for both the playbook and the AI prompt.

## Simple narrative

**AI proposes.  
Ansible applies.  
Tests prove.  
Humans approve.  
Operations observe.  
Feedback improves the next run.**

## GS POV Harness Agent Azure Deployment

This repository includes an Ansible playbook that deploys the application in
`/Users/manju.krishnappa/workspace/cgi/cgi_github/gs-pov-harness-agent` to Azure
and verifies the live application. The deployment commands can run from a Linux
bastion host instead of the local workstation.

The default deployment mode is an app-only update to an existing Azure Container
Apps environment. It delegates the Azure image build, Container App update,
database schema/seed call, and script-level smoke tests to the target repo's
existing `infra/scripts/deploy_containerapp_image.sh`, then performs independent
Ansible verification against the deployed URL.

### Prerequisites

- A Linux deployment controller or bastion reachable by Ansible SSH.
- `ansible-playbook` available on the machine where you start the playbook.
- Sudo on the bastion when `gs_bootstrap_bastion=true`.
- Azure identity available on the bastion through existing `az login`, managed
  identity, or service principal variables.
- `terraform` only when running `gs_deployment_mode=terraform`.

If the deployed app protects `/api/admin/seed`, run Ansible with
`ADMIN_SEED_TOKEN` in the environment; the target deployment script reads it
directly.

### Bastion inventory

Create an inventory from the example and set the bastion address/user:

```bash
cp inventory/bastion.yml.example inventory/bastion.yml
```

The playbook runs against the `deployment_controller` group. The bastion is
bootstrapped with `curl`, `git`, `jq`, Azure CLI, the Azure Container Apps CLI
extension, and Terraform when requested. Debian/Ubuntu and Red Hat family hosts
are supported by package modules.

The app source can be staged on the bastion in one of three ways:

- `gs_source_strategy=existing`: use a checkout already present on the bastion.
- `gs_source_strategy=git`: clone/update `gs_app_repo_url` on the bastion.
- `gs_source_strategy=copy`: copy the local checkout from the Ansible control
  machine to the bastion.

For `gs_source_strategy=git`, the bastion needs network access to the repository
and either an SSH key or HTTPS credential that can read it.
The checked-in dev bastion console config uses `copy` so it does not require a
GitHub deploy key on the bastion.
That copy path uses `rsync` over SSH and excludes generated folders such as
`.git`, `node_modules`, `.venv`, logs, local state, and Terraform state.
If a corporate network drops sustained SSH uploads, set
`gs_rsync_bwlimit_kbps`, for example `-e gs_rsync_bwlimit_kbps=2048`.

### App-only deployment from bastion

With the bastion using an already logged-in Azure CLI session:

```bash
ansible-playbook -i inventory/bastion.yml playbooks/deploy_gs_pov_harness_agent.yml \
  -e gs_source_strategy=git \
  -e gs_app_repo_path=/home/azureuser/gs-pov-harness-agent \
  -e gs_app_repo_url=git@github.com:manjumaikancgi/gs-pov-harness-agent.git \
  -e gs_app_repo_version=feature/agent-harness-no-foundry
```

With a bastion managed identity:

```bash
ansible-playbook -i inventory/bastion.yml playbooks/deploy_gs_pov_harness_agent.yml \
  -e @config/environments/dev.json
```

The `dev-bastion` host variables use `gs_source_strategy=copy`, so the local
application checkout is staged to the bastion with `rsync` and no GitHub deploy
key is needed on the VM.

With service principal environment variables:

```bash
AZURE_TENANT_ID=<tenant-id> \
AZURE_CLIENT_ID=<client-id> \
AZURE_CLIENT_SECRET=<client-secret> \
ansible-playbook -i inventory/bastion.yml playbooks/deploy_gs_pov_harness_agent.yml \
  -e gs_azure_login_mode=service_principal \
  -e gs_source_strategy=git
```

When using the deployment console, start `deployment_console/server.py` with
those same service-principal variables in its environment.

Common Azure overrides:

```bash
ansible-playbook -i inventory/bastion.yml playbooks/deploy_gs_pov_harness_agent.yml \
  -e gs_azure_resource_group=RG_300000000078783_Telstra_CDE_and_CMS_PSM \
  -e gs_azure_environment_tag=dev \
  -e gs_image_tag=660f6e7
```

Use explicit Azure resource names when tag discovery is ambiguous:

```bash
ansible-playbook -i inventory/bastion.yml playbooks/deploy_gs_pov_harness_agent.yml \
  -e gs_container_app_name=ca-gs-mfa-dev-0x5wzz \
  -e gs_acr_name=acrgsmfadev0x5wzz \
  -e gs_postgres_server_name=psql-gs-mfa-dev-0x5wzz
```

### Terraform deployment

Terraform mode provisions or updates the Azure stack under the app repo's
`infra/terraform` directory, builds the container image in the generated ACR,
applies the image to the Container App, and then verifies the application.

Before running Terraform mode, ensure
`{{ gs_app_repo_path }}/infra/terraform/terraform.tfvars` exists on the bastion
and contains the target resource group, subscription, and Microsoft Entra
PostgreSQL administrator settings. You can also send it from the control machine
with `-e gs_terraform_tfvars_local_src=/path/to/terraform.tfvars`, or provide
inline content with `gs_terraform_tfvars_content`.

```bash
ansible-playbook -i inventory/bastion.yml playbooks/deploy_gs_pov_harness_agent.yml \
  -e gs_deployment_mode=terraform \
  -e gs_install_terraform=true
```

### Verification

The playbook checks the latest Azure Container App revision and then verifies:

- `/`
- `/api/health`
- `/api/health/db`
- `/api/clients?limit=1`

Override `gs_verification_endpoints`, `gs_verification_retries`, or
`gs_verification_delay_seconds` for environment-specific checks.

## Deployment Console

The repository also includes a small frontend/backend console for triggering the
Good Shepherd Azure deployment playbook and watching Ansible stages live.

Run it from this repository:

```bash
python3 deployment_console/server.py --host 127.0.0.1 --port 8765
```

Open:

```text
http://127.0.0.1:8765
```

Configuration files:

- `config/bastions/bastions.json`: bastions shown in the UI dropdown.
- `config/environments/dev.json`: dev deployment variables.
- `config/environments/staging.json`: staging deployment variables.

Each UI run writes a generated inventory, merged extra-vars, and Ansible log
under `.runs/<run-id>/`. The backend launches:

```bash
ansible-playbook -i .runs/<run-id>/inventory.json \
  playbooks/deploy_gs_pov_harness_agent.yml \
  -e @.runs/<run-id>/extra_vars.json
```

## Dev Bastion Infrastructure

Terraform code for the dev deployment bastion lives in:

```text
infra/terraform/dev-bastion
```

It deploys an Ubuntu Linux VM with SSH key auth, a static public IP, NSG rules,
a system-assigned managed identity, cloud-init baseline packages, and optional
Contributor RBAC on the target resource group.

```bash
cd infra/terraform/dev-bastion
cp terraform.tfvars.example terraform.tfvars
```

Edit `terraform.tfvars`, especially:

- `ssh_public_key`
- `allowed_ssh_cidrs`
- `resource_group_name`
- `assign_resource_group_contributor`

Then run:

```bash
terraform init
terraform plan
terraform apply
```

After apply, update the console bastion dropdown with:

```bash
terraform output -raw deployment_console_bastion_json
```
