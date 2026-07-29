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
