import fs from "node:fs/promises";
import path from "node:path";
import { Presentation, PresentationFile } from "@oai/artifact-tool";

const ROOT = "/Users/manju.krishnappa/workspace/cgi/cgi_github/ansible-aidlc";
const OUT_DIR = path.join(ROOT, ".deck_build", "aidl_ansible_gs", "rendered");
const FINAL_PPTX = path.join(ROOT, "artifacts", "GS_AIDL_Ansible_Delivery_CI.pptx");

const C = {
  canvas: "#FFFFFF",
  ink: "#000000",
  muted: "#4B5563",
  rule: "#B8BCC4",
  panel: "#EDEDED",
  panel2: "#F6F7F9",
  accent: "#3D8DFF",
  accentSoft: "#EAF5FB",
};

function addText(slide, text, left, top, width, height, style = {}) {
  const box = slide.shapes.add({
    geometry: "textbox",
    position: { left, top, width, height },
    fill: "none",
    line: { style: "solid", fill: "none", width: 0 },
  });
  box.text = text;
  box.text.style = {
    fontSize: 20,
    color: C.ink,
    typeface: "Helvetica Neue",
    ...style,
  };
  return box;
}

function addPanel(slide, left, top, width, height, fill = C.panel2, line = C.rule) {
  return slide.shapes.add({
    geometry: "rect",
    position: { left, top, width, height },
    fill,
    line: { style: "solid", fill: line, width: 1 },
  });
}

function addRule(slide, left, top, width, color = C.rule, weight = 1) {
  return slide.shapes.add({
    geometry: "line",
    position: { left, top, width, height: 0 },
    fill: "none",
    line: { style: "solid", fill: color, width: weight },
  });
}

function addFooter(slide, number) {
  addText(slide, String(number), 1184, 659, 55, 26, {
    fontSize: 13,
    alignment: "right",
    color: C.ink,
  });
}

function addNotes(slide, lines, sources) {
  slide.speakerNotes.textFrame.setText(
    [
      ...lines,
      "",
      "[Sources]",
      ...sources.map((source) => `- ${source}`),
    ].join("\n"),
  );
  slide.speakerNotes.setVisible(true);
}

function addBulletList(slide, items, left, top, width, gap = 52) {
  items.forEach((item, index) => {
    const y = top + index * gap;
    slide.shapes.add({
      geometry: "ellipse",
      position: { left, top: y + 7, width: 10, height: 10 },
      fill: C.accent,
      line: { style: "solid", fill: C.accent, width: 0 },
    });
    addText(slide, item, left + 26, y, width - 26, Math.max(42, gap - 10), {
      fontSize: 21,
      color: C.ink,
    });
  });
}

function addStage(slide, label, detail, left, top, width) {
  const panel = addPanel(slide, left, top, width, 116, C.canvas, C.rule);
  addText(slide, label, left + 18, top + 16, width - 36, 30, {
    fontSize: 22,
    bold: true,
  });
  addText(slide, detail, left + 18, top + 52, width - 36, 48, {
    fontSize: 16,
    color: C.muted,
  });
  return panel;
}

function addArchNode(slide, title, lines, left, top, width, height, fill = C.canvas) {
  addPanel(slide, left, top, width, height, fill, C.rule);
  addText(slide, title, left + 18, top + 20, width - 36, 34, {
    fontSize: 24,
    bold: true,
  });
  addText(slide, lines.join("\n"), left + 18, top + 76, width - 36, height - 92, {
    fontSize: 17,
    color: C.muted,
  });
}

function addCiRow(slide, row, top, fill) {
  const left = 54;
  const widths = [190, 340, 360, 250];
  let x = left;
  widths.forEach((width, index) => {
    addPanel(slide, x, top, width, 78, fill, C.rule);
    addText(slide, row[index], x + 14, top + 14, width - 28, 48, {
      fontSize: index === 0 ? 18 : 16,
      bold: index === 0,
      color: index === 0 ? C.ink : C.muted,
    });
    x += width;
  });
}

async function writeBlob(filePath, blob) {
  await fs.writeFile(filePath, new Uint8Array(await blob.arrayBuffer()));
}

async function main() {
  await fs.mkdir(OUT_DIR, { recursive: true });
  await fs.mkdir(path.dirname(FINAL_PPTX), { recursive: true });

  const presentation = Presentation.create({
    slideSize: { width: 1280, height: 720 },
  });

  // Slide 1
  {
    const slide = presentation.slides.add();
    slide.background.fill = C.canvas;
    addText(slide, "AIDL + Ansible on Good Shepherd", 41, 46, 720, 72, {
      fontSize: 52,
      bold: true,
    });
    addText(
      slide,
      "Using AI-assisted delivery with Ansible as the execution layer for repeatable Azure releases.",
      41,
      188,
      570,
      150,
      { fontSize: 29, color: C.ink },
    );
    addText(
      slide,
      "AI proposes. Ansible applies. Tests prove. Humans approve. Operations observe.",
      41,
      535,
      560,
      70,
      { fontSize: 22, color: C.muted },
    );

    addPanel(slide, 682, 65, 520, 548, C.accentSoft, C.rule);
    const steps = ["Discover", "Design", "Build", "Deploy", "Verify", "Learn"];
    steps.forEach((step, index) => {
      const y = 106 + index * 78;
      slide.shapes.add({
        geometry: "ellipse",
        position: { left: 724, top: y + 5, width: 28, height: 28 },
        fill: index === 3 ? C.accent : C.canvas,
        line: { style: "solid", fill: C.accent, width: 2 },
      });
      addText(slide, step, 774, y, 250, 38, {
        fontSize: 27,
        bold: index === 3,
        color: C.ink,
      });
      if (index < steps.length - 1) {
        addRule(slide, 738, y + 44, 1, C.accent, 2).position = {
          left: 738,
          top: y + 44,
          width: 0,
          height: 42,
        };
      }
    });
    addText(slide, "Good Shepherd Azure delivery path", 724, 555, 420, 36, {
      fontSize: 18,
      color: C.muted,
    });
    addFooter(slide, 1);
    addNotes(
      slide,
      [
        "Open by positioning AIDL as the lifecycle and Ansible as the control point.",
        "Emphasize that the GS project already contains the pieces for an auditable release path.",
      ],
      [
        "README.md, 'AI-DLC Workflow with Ansible at the Centre', lines 1-42.",
        "README.md, 'Simple narrative', lines 75-82.",
        "README.md, 'GS POV Harness Agent Azure Deployment', lines 85-91.",
      ],
    );
  }

  // Slide 2
  {
    const slide = presentation.slides.add();
    slide.background.fill = C.canvas;
    addText(slide, "AIDL turns intent into controlled delivery work", 41, 42, 1110, 76, {
      fontSize: 40,
      bold: true,
    });
    addRule(slide, 41, 138, 1110);

    addText(slide, "AIDL contribution", 72, 184, 500, 36, {
      fontSize: 28,
      bold: true,
    });
    addBulletList(
      slide,
      [
        "Converts business change into acceptance criteria and target state.",
        "Drafts task breakdowns, playbook structure, and environment variables.",
        "Surfaces review points for risky changes, secrets, and production promotion.",
      ],
      74,
      246,
      500,
      78,
    );

    addText(slide, "GS project expression", 680, 184, 500, 36, {
      fontSize: 28,
      bold: true,
    });
    addBulletList(
      slide,
      [
        "A single deployment playbook handles preflight, source staging, Azure auth, deploy, and verify.",
        "Dev and staging JSON files make environment promotion explicit.",
        "The console lets teams choose a bastion and watch live Ansible stages.",
      ],
      682,
      246,
      510,
      78,
    );
    addFooter(slide, 2);
    addNotes(
      slide,
      [
        "Use this slide to connect the AI-DLC concept to concrete GS repository assets.",
        "The key message is that AIDL is useful when its output becomes versioned, reviewable automation.",
      ],
      [
        "README.md, 'What the flow does', lines 5-24.",
        "README.md, 'Deployment Console', lines 229-259.",
        "config/environments/dev.json and config/environments/staging.json.",
      ],
    );
  }

  // Slide 3
  {
    const slide = presentation.slides.add();
    slide.background.fill = C.canvas;
    addText(slide, "Ansible makes the GS release path repeatable", 41, 42, 1110, 76, {
      fontSize: 40,
      bold: true,
    });
    addText(
      slide,
      "The same playbook runs from a Linux bastion, stages code, authenticates to Azure, deploys, and verifies the live app.",
      41,
      122,
      980,
      46,
      { fontSize: 23, color: C.muted },
    );

    const y = 250;
    const panels = [
      ["Preflight", "Validate settings and bootstrap bastion packages."],
      ["Source", "Use copy, git, or existing checkout strategy."],
      ["Azure auth", "Use existing login, managed identity, or service principal."],
      ["Deploy", "Run app-only update or Terraform-backed stack flow."],
      ["Verify", "Check Container App revision and application endpoints."],
    ];
    panels.forEach((item, index) => addStage(slide, item[0], item[1], 52 + index * 238, y, 200));
    for (let index = 0; index < panels.length - 1; index += 1) {
      slide.shapes.add({
        geometry: "rightArrow",
        position: { left: 257 + index * 238, top: y + 50, width: 26, height: 16 },
        fill: C.accent,
        line: { style: "solid", fill: C.accent, width: 0 },
      });
    }

    addPanel(slide, 110, 482, 1058, 86, C.accentSoft, C.rule);
    addText(
      slide,
      "Delivery benefit: one automation contract can be run by a person, the UI console, or a CI/CD runner.",
      134,
      506,
      1000,
      40,
      { fontSize: 25, bold: true },
    );
    addFooter(slide, 3);
    addNotes(
      slide,
      [
        "Walk left to right as the operational delivery path.",
        "Call out that source staging was intentionally designed to avoid requiring GitHub keys on the bastion.",
      ],
      [
        "README.md, GS deployment prerequisites and source strategies, lines 100-137.",
        "playbooks/deploy_gs_pov_harness_agent.yml task sequence: preflight, source sync, Azure login, deploy, verify.",
        "README.md, Terraform failure skip behavior, lines 197-204.",
      ],
    );
  }

  // Slide 4
  {
    const slide = presentation.slides.add();
    slide.background.fill = C.canvas;
    addText(slide, "Workflow architecture keeps control close to delivery", 41, 42, 1110, 76, {
      fontSize: 40,
      bold: true,
    });
    addText(
      slide,
      "AIDL shapes the work; CI chooses the gate; Ansible executes from the bastion; Azure returns verification evidence.",
      41,
      122,
      1060,
      46,
      { fontSize: 23, color: C.muted },
    );

    const top = 220;
    const nodeW = 248;
    const nodeH = 218;
    const xs = [52, 348, 644, 940];
    addArchNode(slide, "AIDL + Git", ["Intent", "Acceptance criteria", "Playbook changes", "Environment vars"], xs[0], top, nodeW, nodeH, C.panel2);
    addArchNode(slide, "CI/CD runner", ["Syntax and lint", "Env selection", "Trigger playbook", "Store evidence"], xs[1], top, nodeW, nodeH, C.canvas);
    addArchNode(slide, "Linux bastion", ["Ansible controller", "Source sync", "Azure CLI auth", "Deployment logs"], xs[2], top, nodeW, nodeH, C.accentSoft);
    addArchNode(slide, "Azure platform", ["ACR image build", "Container App", "PostgreSQL", "Health endpoints"], xs[3], top, nodeW, nodeH, C.canvas);

    for (let index = 0; index < xs.length - 1; index += 1) {
      slide.shapes.add({
        geometry: "rightArrow",
        position: { left: xs[index] + nodeW + 10, top: top + 95, width: 28, height: 18 },
        fill: C.accent,
        line: { style: "solid", fill: C.accent, width: 0 },
      });
    }

    addPanel(slide, 116, 514, 930, 82, C.panel2, C.rule);
    addText(
      slide,
      "Feedback loop: deployment output, failed stages, endpoint checks, and review decisions feed the next AIDL iteration.",
      144,
      538,
      850,
      48,
      { fontSize: 23, bold: true },
    );
    slide.shapes.add({
      geometry: "leftArrow",
      position: { left: 1058, top: 544, width: 62, height: 22 },
      fill: C.accent,
      line: { style: "solid", fill: C.accent, width: 0 },
    });

    addFooter(slide, 4);
    addNotes(
      slide,
      [
        "Use this as the architecture slide: it shows where AIDL, CI, Ansible, the bastion, and Azure each own part of delivery.",
        "The important design choice is that Ansible remains the execution contract, whether triggered by a person, the UI, or CI.",
      ],
      [
        "README.md, 'Core components', lines 30-42.",
        "README.md, 'Deployment Console', lines 229-259.",
        "README.md, 'Dev Bastion Infrastructure', lines 264-300.",
        "playbooks/deploy_gs_pov_harness_agent.yml task sequence and Azure verification tasks.",
      ],
    );
  }

  // Slide 5
  {
    const slide = presentation.slides.add();
    slide.background.fill = C.canvas;
    addText(slide, "In CI, Ansible becomes the promotion contract", 41, 42, 1110, 76, {
      fontSize: 40,
      bold: true,
    });
    addText(
      slide,
      "AIDL improves the work entering the pipeline; Ansible standardizes what the pipeline actually does.",
      41,
      122,
      980,
      46,
      { fontSize: 23, color: C.muted },
    );

    addCiRow(slide, ["CI moment", "AIDL contribution", "Ansible control", "Delivery outcome"], 198, C.accentSoft);
    addCiRow(
      slide,
      ["Pull request", "Generate criteria, risks, and test ideas.", "Run syntax, lint, and idempotency checks.", "Automatable review gate."],
      276,
      C.canvas,
    );
    addCiRow(
      slide,
      ["Dev deploy", "Translate change intent into vars and runbook updates.", "Run playbook against dev bastion and dev env file.", "Fast, repeatable validation."],
      354,
      C.panel2,
    );
    addCiRow(
      slide,
      ["Stage promote", "Summarize changes and unresolved risks.", "Reuse same playbook with staging variables.", "Same logic, new target."],
      432,
      C.canvas,
    );
    addCiRow(
      slide,
      ["Release gate", "Explain failure signals and next fixes.", "Verify endpoints and Container App revision health.", "Evidence-backed approval."],
      510,
      C.panel2,
    );
    addFooter(slide, 5);
    addNotes(
      slide,
      [
        "This slide is the CI/CD operating answer: let AIDL shape the inputs and Ansible enforce the delivery contract.",
        "Emphasize that dev/staging config files make promotion explicit without changing the playbook logic.",
      ],
      [
        "README.md, 'Core components', lines 30-42.",
        "README.md, validation and CI/CD flow, lines 15-23 and 38-41.",
        "config/environments/dev.json and config/environments/staging.json.",
      ],
    );
  }

  // Slide 6
  {
    const slide = presentation.slides.add();
    slide.background.fill = C.canvas;
    addText(slide, "Use the pattern as a delivery operating model", 41, 42, 1110, 76, {
      fontSize: 40,
      bold: true,
    });

    addPanel(slide, 70, 165, 360, 355, C.panel2, C.rule);
    addText(slide, "Standardize", 98, 198, 300, 34, { fontSize: 29, bold: true });
    addBulletList(
      slide,
      [
        "Keep one playbook path across environments.",
        "Treat env files and inventory as release inputs.",
        "Make bastion source strategy explicit.",
      ],
      100,
      260,
      288,
      70,
    );

    addPanel(slide, 460, 165, 360, 355, C.canvas, C.rule);
    addText(slide, "Govern", 488, 198, 300, 34, { fontSize: 29, bold: true });
    addBulletList(
      slide,
      [
        "Approve RBAC, secrets, and risky infra.",
        "Let CI run validation before promotion.",
        "Keep identity paths clear.",
      ],
      490,
      260,
      288,
      70,
    );

    addPanel(slide, 850, 165, 360, 355, C.accentSoft, C.rule);
    addText(slide, "Learn", 878, 198, 300, 34, { fontSize: 29, bold: true });
    addBulletList(
      slide,
      [
        "Feed deployment logs back into AIDL prompts.",
        "Convert recurring fixes into playbook updates.",
        "Use verification as delivery evidence.",
      ],
      880,
      260,
      288,
      70,
    );

    addText(
      slide,
      "Practical next step: wire CI to run syntax/lint on PRs, deploy to dev on merge, and promote with the same Ansible playbook plus environment-specific vars.",
      70,
      590,
      1040,
      58,
      { fontSize: 24, bold: true },
    );
    addFooter(slide, 6);
    addNotes(
      slide,
      [
        "Close by making the recommendation practical: keep AI-assisted planning, Ansible execution, and CI evidence connected.",
        "This is not a separate process; it is a disciplined way to use the assets already in the GS automation repo.",
      ],
      [
        "README.md, 'Suggested lifecycle', lines 44-72.",
        "README.md, 'Example control points', lines 67-73.",
        "README.md, deployment console and bastion infrastructure sections, lines 229-300.",
      ],
    );
  }

  await fs.writeFile(
    path.join(ROOT, ".deck_build", "aidl_ansible_gs", "source-notes.txt"),
    [
      "Deck sources are local repository files only.",
      "Primary source: README.md in ansible-aidlc.",
      "Supporting source: playbooks/deploy_gs_pov_harness_agent.yml.",
      "Supporting source: config/environments/dev.json and staging.json.",
      "Supporting source: deployment_console/server.py and infra/terraform/dev-bastion.",
    ].join("\n"),
  );

  for (const [index, slide] of presentation.slides.items.entries()) {
    const stem = `slide-${String(index + 1).padStart(2, "0")}`;
    await writeBlob(path.join(OUT_DIR, `${stem}.png`), await presentation.export({ slide, format: "png", scale: 1 }));
    await fs.writeFile(path.join(OUT_DIR, `${stem}.layout.json`), await (await slide.export({ format: "layout" })).text());
  }
  await writeBlob(path.join(OUT_DIR, "montage.webp"), await presentation.export({ format: "webp", montage: true, scale: 1 }));
  await (await PresentationFile.exportPptx(presentation)).save(FINAL_PPTX);
  console.log(FINAL_PPTX);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
