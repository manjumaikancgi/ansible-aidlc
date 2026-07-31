const state = {
  bastions: [],
  environments: [],
  deploymentId: null,
  events: null,
  startedAt: null,
};

const els = {
  bastionSelect: document.querySelector("#bastion-select"),
  environmentSelect: document.querySelector("#environment-select"),
  imageTag: document.querySelector("#image-tag"),
  deployButton: document.querySelector("#deploy-button"),
  cancelButton: document.querySelector("#cancel-button"),
  clearLogButton: document.querySelector("#clear-log-button"),
  stageList: document.querySelector("#stage-list"),
  logOutput: document.querySelector("#log-output"),
  commandOutput: document.querySelector("#command-output"),
  runId: document.querySelector("#run-id"),
  runStatus: document.querySelector("#run-status"),
  runTarget: document.querySelector("#run-target"),
  stageClock: document.querySelector("#stage-clock"),
  selectionMode: document.querySelector("#selection-mode"),
  bastionHost: document.querySelector("#bastion-host"),
  bastionConnection: document.querySelector("#bastion-connection"),
  sourceStrategy: document.querySelector("#source-strategy"),
  azureLoginMode: document.querySelector("#azure-login-mode"),
};

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!response.ok) {
    let detail = response.statusText;
    try {
      const body = await response.json();
      detail = body.error || detail;
    } catch {
      detail = response.statusText;
    }
    throw new Error(detail);
  }
  return response.json();
}

function option(label, value) {
  const item = document.createElement("option");
  item.value = value;
  item.textContent = label;
  return item;
}

function renderSelectors() {
  els.bastionSelect.replaceChildren(
    ...state.bastions.map((item) => option(item.name, item.id)),
  );
  els.environmentSelect.replaceChildren(
    ...state.environments.map((item) => option(item.name, item.id)),
  );
  updateSelectionDetails();
}

function selectedBastion() {
  return state.bastions.find((item) => item.id === els.bastionSelect.value);
}

function selectedEnvironment() {
  return state.environments.find((item) => item.id === els.environmentSelect.value);
}

function updateSelectionDetails() {
  const bastion = selectedBastion();
  const environment = selectedEnvironment();
  els.bastionHost.textContent = bastion?.host || "-";
  els.bastionConnection.textContent = bastion?.connection || "-";
  els.sourceStrategy.textContent = bastion?.sourceStrategy || "-";
  els.azureLoginMode.textContent = bastion?.azureLoginMode || "-";
  els.runTarget.textContent =
    bastion && environment ? `${bastion.name} / ${environment.name}` : "Unselected";
}

function renderStages(stages = []) {
  if (!stages.length) {
    const defaults = [
      "Queued",
      "Preflight",
      "Bootstrap",
      "Source",
      "Azure Auth",
      "Deploy",
      "Revision",
      "Verify",
      "Summary",
    ].map((label, index) => ({ id: label.toLowerCase().replaceAll(" ", "-"), label, state: index === 0 ? "active" : "pending" }));
    stages = defaults;
  }
  els.stageList.replaceChildren(
    ...stages.map((stage, index) => {
      const li = document.createElement("li");
      li.className = `stage-item ${stage.state}`;

      const number = document.createElement("span");
      number.className = "stage-index";
      number.textContent = String(index + 1);

      const label = document.createElement("span");
      label.className = "stage-label";
      label.textContent = stage.label;

      const status = document.createElement("span");
      status.className = "stage-state";
      status.textContent = stage.state;

      li.append(number, label, status);
      return li;
    }),
  );
}

function appendLog(line) {
  els.logOutput.textContent += `${line}\n`;
  els.logOutput.scrollTop = els.logOutput.scrollHeight;
}

function formatCommand(command = []) {
  return command
    .map((part) => {
      if (/^[A-Za-z0-9_./:=@-]+$/.test(part)) {
        return part;
      }
      return `"${part.replaceAll('"', '\\"')}"`;
    })
    .join(" ");
}

function renderDeployment(snapshot) {
  state.deploymentId = snapshot.id;
  state.startedAt = snapshot.startedAt ? new Date(snapshot.startedAt * 1000) : null;
  els.runId.textContent = snapshot.id || "Idle";
  els.runStatus.textContent = snapshot.status || "Ready";
  els.selectionMode.textContent = snapshot.currentStage || "No run";
  els.commandOutput.textContent = formatCommand(snapshot.command || []);
  renderStages(snapshot.stages);
  els.cancelButton.disabled = !["queued", "running"].includes(snapshot.status);
  els.deployButton.disabled = ["queued", "running"].includes(snapshot.status);
}

function connectEvents(id) {
  if (state.events) {
    state.events.close();
  }
  state.events = new EventSource(`/api/deployments/${id}/events`);
  state.events.addEventListener("state", (event) => {
    renderDeployment(JSON.parse(event.data));
  });
  state.events.addEventListener("log", (event) => {
    appendLog(JSON.parse(event.data).line);
  });
  state.events.addEventListener("done", (event) => {
    renderDeployment(JSON.parse(event.data));
  });
  state.events.addEventListener("close", () => {
    state.events.close();
  });
}

async function deploy() {
  const bastionId = els.bastionSelect.value;
  const environmentId = els.environmentSelect.value;
  const imageTag = els.imageTag.value.trim();
  els.logOutput.textContent = "";
  els.deployButton.disabled = true;
  els.cancelButton.disabled = false;
  try {
    const deployment = await api("/api/deployments", {
      method: "POST",
      body: JSON.stringify({ bastionId, environmentId, imageTag }),
    });
    renderDeployment(deployment);
    connectEvents(deployment.id);
  } catch (error) {
    appendLog(`ERROR: ${error.message}`);
    els.deployButton.disabled = false;
    els.cancelButton.disabled = true;
  }
}

async function cancelDeployment() {
  if (!state.deploymentId) {
    return;
  }
  els.cancelButton.disabled = true;
  try {
    const deployment = await api(`/api/deployments/${state.deploymentId}/cancel`, {
      method: "POST",
      body: JSON.stringify({}),
    });
    renderDeployment(deployment);
  } catch (error) {
    appendLog(`ERROR: ${error.message}`);
  }
}

function updateClock() {
  if (!state.startedAt) {
    els.stageClock.textContent = "Waiting";
    return;
  }
  const elapsed = Math.max(0, Date.now() - state.startedAt.getTime());
  const minutes = Math.floor(elapsed / 60000);
  const seconds = Math.floor((elapsed % 60000) / 1000);
  els.stageClock.textContent = `${minutes}m ${String(seconds).padStart(2, "0")}s`;
}

async function init() {
  renderStages();
  const [bastions, environments] = await Promise.all([
    api("/api/bastions"),
    api("/api/environments"),
  ]);
  state.bastions = bastions.bastions;
  state.environments = environments.environments;
  renderSelectors();
}

els.deployButton.addEventListener("click", deploy);
els.cancelButton.addEventListener("click", cancelDeployment);
els.clearLogButton.addEventListener("click", () => {
  els.logOutput.textContent = "";
});
els.bastionSelect.addEventListener("change", updateSelectionDetails);
els.environmentSelect.addEventListener("change", updateSelectionDetails);
setInterval(updateClock, 1000);

init().catch((error) => {
  appendLog(`ERROR: ${error.message}`);
  els.deployButton.disabled = true;
});
