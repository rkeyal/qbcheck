import { parseDocx } from "../core/parser.js";
import { segmentPacket } from "../core/segmenter.js";
import { lint, inferCrossPacketCategories } from "../core/engine.js";
import { LintDiagnostic, Severity, Packet } from "../core/model.js";

const uploadArea = document.getElementById("upload-area")!;
const resultsArea = document.getElementById("results-area")!;
const fileInput = document.getElementById("file-input") as HTMLInputElement;
const folderInput = document.getElementById("folder-input") as HTMLInputElement;
const dropZone = document.getElementById("drop-zone")!;
const fileNameEl = document.getElementById("file-name")!;
const clearBtn = document.getElementById("clear-btn")!;
const countError = document.getElementById("count-error")!;
const countWarning = document.getElementById("count-warning")!;
const countInfo = document.getElementById("count-info")!;
const statsBar = document.getElementById("stats-bar")!;
const filterCategory = document.getElementById(
  "filter-category"
) as HTMLSelectElement;

const activeSeverities = new Set<string>(["error", "warning", "info"]);
const diagnosticsList = document.getElementById("diagnostics-list")!;
const noIssues = document.getElementById("no-issues")!;
const packetNav = document.getElementById("packet-nav")!;
const prevBtn = document.getElementById("prev-btn") as HTMLButtonElement;
const nextBtn = document.getElementById("next-btn") as HTMLButtonElement;
const packetSelect = document.getElementById(
  "packet-select"
) as HTMLSelectElement;
const packetCounter = document.getElementById("packet-counter")!;

interface PacketResult {
  filename: string;
  diagnostics: LintDiagnostic[];
}

let packetResults: PacketResult[] = [];
let currentIndex: number = 0;

function getCurrentDiagnostics(): LintDiagnostic[] {
  return packetResults[currentIndex]?.diagnostics ?? [];
}

// File input handler
fileInput.addEventListener("change", () => {
  const files = collectDocxFiles(fileInput.files);
  if (files.length > 0) processFiles(files);
});

// Folder input handler
folderInput.addEventListener("change", () => {
  const files = collectDocxFiles(folderInput.files);
  if (files.length > 0) processFiles(files);
});

// Drag and drop
dropZone.addEventListener("dragover", (e) => {
  e.preventDefault();
  dropZone.classList.add("drag-over");
});

dropZone.addEventListener("dragleave", () => {
  dropZone.classList.remove("drag-over");
});

dropZone.addEventListener("drop", (e) => {
  e.preventDefault();
  dropZone.classList.remove("drag-over");
  const files = collectDocxFiles(e.dataTransfer?.files ?? null);
  if (files.length > 0) processFiles(files);
});

// Clear button
clearBtn.addEventListener("click", () => {
  packetResults = [];
  currentIndex = 0;
  uploadArea.hidden = false;
  resultsArea.hidden = true;
  fileInput.value = "";
  folderInput.value = "";
});

// Filters
statsBar.addEventListener("click", (e) => {
  const btn = (e.target as HTMLElement).closest("[data-severity]") as HTMLElement | null;
  if (!btn) return;
  const sev = btn.dataset.severity!;
  if (activeSeverities.has(sev)) {
    // Don't allow deactivating all chips
    if (activeSeverities.size === 1) return;
    activeSeverities.delete(sev);
    btn.classList.remove("active");
  } else {
    activeSeverities.add(sev);
    btn.classList.add("active");
  }
  renderDiagnostics();
});
filterCategory.addEventListener("change", renderDiagnostics);

// Navigation
prevBtn.addEventListener("click", () => {
  currentIndex = Math.max(0, currentIndex - 1);
  showCurrentPacket();
});

nextBtn.addEventListener("click", () => {
  currentIndex = Math.min(packetResults.length - 1, currentIndex + 1);
  showCurrentPacket();
});

packetSelect.addEventListener("change", () => {
  currentIndex = parseInt(packetSelect.value, 10);
  showCurrentPacket();
});

function collectDocxFiles(fileList: FileList | null): File[] {
  if (!fileList) return [];
  const files: File[] = [];
  for (let i = 0; i < fileList.length; i++) {
    if (fileList[i].name.endsWith(".docx")) {
      files.push(fileList[i]);
    }
  }
  return files;
}

async function processFiles(files: File[]) {
  const sorted = [...files].sort((a, b) => a.name.localeCompare(b.name));

  uploadArea.hidden = true;
  resultsArea.hidden = false;
  noIssues.hidden = true;
  diagnosticsList.innerHTML = `<div class="loading">Analyzing 0 / ${sorted.length}...</div>`;

  // When 4+ files are uploaded, disable the static category check and
  // use cross-packet frequency inference instead.
  const useInference = sorted.length > 3;
  const disabledRules = useInference
    ? new Set(["tag.valid-category"])
    : undefined;

  packetResults = [];
  const packets: Packet[] = [];

  for (let i = 0; i < sorted.length; i++) {
    diagnosticsList.innerHTML = `<div class="loading">Analyzing ${i + 1} / ${sorted.length}...</div>`;

    try {
      const file = sorted[i];
      const buffer = await file.arrayBuffer();
      const paragraphs = await parseDocx(buffer);
      const packet = segmentPacket(paragraphs);
      const diagnostics = lint(packet, disabledRules);
      packets.push(packet);
      packetResults.push({ filename: file.name, diagnostics });
    } catch (err) {
      packets.push(null as unknown as Packet);
      packetResults.push({
        filename: sorted[i].name,
        diagnostics: [],
      });
    }
  }

  // Cross-packet tag category inference
  if (useInference) {
    const validPackets = packets.filter((p): p is Packet => p !== null);
    if (validPackets.length > 3) {
      const crossDiags = inferCrossPacketCategories(validPackets);

      // Map inferred diagnostics back to packetResults, skipping failed packets
      let validIdx = 0;
      for (let i = 0; i < packets.length; i++) {
        if (packets[i] === null) continue;
        const diags = crossDiags[validIdx++];
        if (diags.length > 0) {
          packetResults[i].diagnostics.push(...diags);
          packetResults[i].diagnostics.sort(
            (a, b) => a.paragraph - b.paragraph
          );
        }
      }
    }
  }

  currentIndex = 0;
  populatePacketSelect();
  showCurrentPacket();
}

function populatePacketSelect() {
  packetSelect.innerHTML = packetResults
    .map((r, i) => `<option value="${i}">${escapeHtml(r.filename)}</option>`)
    .join("");
}

function showCurrentPacket() {
  const result = packetResults[currentIndex];
  if (!result) return;

  fileNameEl.textContent = result.filename;
  packetSelect.value = String(currentIndex);
  packetCounter.textContent = `${currentIndex + 1} / ${packetResults.length}`;

  // Show/hide navigation bar
  packetNav.hidden = packetResults.length <= 1;

  // Update button states
  prevBtn.disabled = currentIndex === 0;
  nextBtn.disabled = currentIndex === packetResults.length - 1;

  updateCounts();
  renderDiagnostics();
}

function updateCounts() {
  const diags = getCurrentDiagnostics();
  countError.textContent = String(
    diags.filter((d) => d.severity === "error").length
  );
  countWarning.textContent = String(
    diags.filter((d) => d.severity === "warning").length
  );
  countInfo.textContent = String(
    diags.filter((d) => d.severity === "info").length
  );
}

function renderDiagnostics() {
  const catFilter = filterCategory.value;

  const filtered = getCurrentDiagnostics().filter((d) => {
    if (!activeSeverities.has(d.severity)) return false;
    if (catFilter !== "all" && !d.rule.startsWith(catFilter + "."))
      return false;
    return true;
  });

  if (filtered.length === 0) {
    diagnosticsList.innerHTML = "";
    noIssues.hidden = false;
    return;
  }

  noIssues.hidden = true;

  const severityIcon: Record<Severity, string> = {
    error: "!",
    warning: "!",
    info: "i",
  };

  diagnosticsList.innerHTML = filtered
    .map(
      (d) => `
    <div class="diagnostic severity-${d.severity}">
      <div class="diag-icon">${severityIcon[d.severity]}</div>
      <div class="diag-body">
        <div class="diag-rule">${d.rule}</div>
        <div class="diag-message">${escapeHtml(d.message)}</div>
        <div class="diag-location">${d.questionLabel || "Paragraph " + (d.paragraph + 1)}${d.answerPreview ? " \u2014 " + escapeHtml(d.answerPreview) : ""}</div>
        ${d.suggestion ? `<div class="diag-suggestion">${escapeHtml(d.suggestion)}</div>` : ""}
      </div>
    </div>
  `
    )
    .join("");
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
