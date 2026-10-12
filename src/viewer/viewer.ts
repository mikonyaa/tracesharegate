import type {
  Report,
  Action,
  ReportError,
  Entry,
  Manifest,
} from "../schemas/types.js";
const $ = <T extends HTMLElement>(id: string) =>
  document.getElementById(id) as T;
const el = (tag: string, text?: string, className?: string) => {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
};
const data = JSON.parse($("report-data").textContent ?? "{}") as {
  report: Report;
  entries: Entry[];
  omissionManifest: Manifest;
};
const report = data.report;
const banner = $("banner");
banner.append(
  el(
    "strong",
    report.processingStatus === "complete"
      ? "Reduction complete · review required"
      : report.processingStatus.toUpperCase() + " COVERAGE · review required",
  ),
);
banner.append(
  document.createTextNode(
    report.processingStatus === "complete"
      ? "Selected schema fields were processed. This does not establish absence of sensitive data."
      : report.coverage.issues
          .map((x) => x.code + " (" + x.count + ")")
          .join(" · "),
  ),
);
$("action-count").textContent = report.actions.length + " actions";
$("coverage").append(
  el("p", "Archive inventory: " + report.coverage.archiveInventory),
  el("p", "Recognized schema: " + report.coverage.recognizedSchema),
  el("p", "Retained fields: " + report.coverage.processedRetainedFields),
  el("p", "Assertion scope: " + report.coverage.assertionScope),
  el("p", "Known literals: " + report.coverage.literalCheck),
  el("p", "Built-in patterns: bounded matching"),
  el(
    "p",
    "Lanes use independent relative clocks. Errors without a time show their original event index.",
  ),
);
for (const issue of report.coverage.issues)
  $("coverage").append(
    el(
      "p",
      issue.code + " · " + (issue.entryId ?? "archive") + " · " + issue.count,
    ),
  );
$("retained").append(
  el(
    "p",
    "Generated IDs; known operations; relative timing; verified parents; outcomes; bounded redacted errors; counts and coverage.",
  ),
);
for (const r of report.redactionSummary)
  $("retained").append(
    el("p", r.ruleId + " · " + r.field + " · " + r.count + " replacements"),
  );
const table = el("table");
const head = el("tr");
head.append(
  el("th", "Excluded category"),
  el("th", "Events / entries / references"),
);
table.append(head);
for (const o of report.omissionSummary) {
  const row = el("tr");
  row.append(
    el("td", o.category.replaceAll("-", " ")),
    el("td", `${o.eventCount} / ${o.entryCount} / ${o.resourceReferenceCount}`),
  );
  table.append(row);
}
$("omissions").append(
  table,
  el(
    "p",
    "References count uses, not unique bytes. Physical entries are counted once. Payload entries omitted without decompression have contentsInspected=false; their sizes are declared, not measured. Zero means no separately counted envelope; excluded opaque containers may still contain that surface.",
  ),
  el(
    "p",
    data.entries.filter((e) => !e.contentsInspected).length +
      " entries excluded without content inspection.",
  ),
);
const errorById = new Map(report.errors.map((e) => [e.id, e]));
interface Item {
  action?: Action;
  error?: ReportError;
  contextId: string;
  index: number;
  status: string;
  label: string;
  text: string;
}
const items: Item[] = [
  ...report.actions.map((action) => ({
    action,
    contextId: action.contextId,
    index: action.eventIndex,
    status: action.outcome,
    label: action.operation,
    text: action.errorIds
      .map((id) => errorById.get(id)?.message ?? "")
      .join("\n"),
  })),
  ...report.errors
    .filter((e) => !e.actionId)
    .map((error) => ({
      error,
      contextId: error.contextId,
      index: error.eventIndex,
      status: "unknown",
      label: "Observed error",
      text: error.message ?? "",
    })),
];
let selected: Item | undefined =
  items.find(
    (x) => x.action?.operation === "Assertion" && x.status === "failed",
  ) ??
  items.find((x) => x.status === "failed") ??
  items[0];
let currentPage = 0;
let copyText = "";
let visible: Item[] = [];
let buttons: HTMLButtonElement[] = [];
const pageSize = 100;
const pair = (dl: HTMLElement, label: string, value: string) => {
  dl.append(el("dt", label), el("dd", value));
};
function select(item: Item, focus = false) {
  selected = item;
  const details = $("details");
  details.replaceChildren(el("h2", item.label));
  const dl = el("dl");
  pair(dl, "Status", item.error ? "observed error" : item.status);
  pair(
    dl,
    "Lane",
    item.action?.lane ??
      report.contexts.find((c) => c.id === item.contextId)?.lane ??
      "unknown",
  );
  pair(dl, "Local ID", item.action?.id ?? item.error?.id ?? "unknown");
  pair(dl, "Event index", String(item.index));
  if (item.action) {
    const a = item.action;
    pair(
      dl,
      "Relative start",
      a.startMs === null ? "unknown" : a.startMs + " ms",
    );
    pair(
      dl,
      "Duration",
      a.durationMs === null ? "unknown" : a.durationMs + " ms",
    );
    pair(dl, "Parent", a.parentId ?? "No verified parent");
  } else
    pair(
      dl,
      "Time",
      item.error?.timeMs === null ? "Not recorded" : item.error?.timeMs + " ms",
    );
  details.append(dl);
  const errors = item.action
    ? item.action.errorIds.map((id) => errorById.get(id)!).filter(Boolean)
    : item.error
      ? [item.error]
      : [];
  for (const e of errors) {
    details.append(
      el("strong", e.name || "Observed error"),
      el("pre", e.message ?? "Error text excluded by the string policy."),
    );
  }
  if (!errors.length)
    details.append(el("p", "No retained error for this operation."));
  copyText = [
    item.label,
    ...Array.from(dl.children).map((n) => n.textContent),
    ...errors.map((e) => e.message ?? "Error text excluded"),
  ].join("\n");
  buttons.forEach((b, i) => {
    const chosen = visible[i] === item;
    b.classList.toggle("selected", chosen);
    b.setAttribute("aria-pressed", String(chosen));
    if (chosen) {
      const box = $("timeline");
      const top =
        b.getBoundingClientRect().top -
        box.getBoundingClientRect().top +
        box.scrollTop;
      if (top < box.scrollTop + 38) box.scrollTop = Math.max(0, top - 38);
      else if (top + b.offsetHeight > box.scrollTop + box.clientHeight)
        box.scrollTop = top + b.offsetHeight - box.clientHeight;
      if (focus) b.focus();
    }
  });
}
function render() {
  const search = $<HTMLInputElement>("search").value.toLocaleLowerCase();
  const status = $<HTMLSelectElement>("status").value;
  const kind = $<HTMLSelectElement>("kind").value;
  const matches = items.filter(
    (i) =>
      (status === "all" || status === i.status) &&
      (kind === "all" ||
        (kind === "actions" && i.action) ||
        (kind === "errors" && (i.error || i.action?.errorIds.length))) &&
      [i.label, i.text, i.action?.id ?? i.error?.id ?? ""]
        .join(" ")
        .toLocaleLowerCase()
        .includes(search),
  );
  currentPage = Math.min(
    currentPage,
    Math.max(0, Math.ceil(matches.length / pageSize) - 1),
  );
  visible = matches.slice(currentPage * pageSize, (currentPage + 1) * pageSize);
  const timeline = $("timeline");
  timeline.replaceChildren();
  buttons = [];
  for (const context of report.contexts) {
    const rows = visible.filter((i) => i.contextId === context.id);
    if (!rows.length) continue;
    timeline.append(
      el(
        "div",
        context.lane + " / " + context.origin + " / separate clock",
        "lane",
      ),
    );
    for (const item of rows) {
      const button = el(
        "button",
        undefined,
        "action " + item.status,
      ) as HTMLButtonElement;
      button.type = "button";
      button.append(
        el(
          "span",
          item.action?.startMs !== null && item.action?.startMs !== undefined
            ? item.action.startMs + " ms"
            : "event " + item.index,
          "time",
        ),
      );
      const content = el("span", item.label);
      content.append(el("small", item.action?.id ?? item.error?.id));
      if (item.text) content.append(el("div", item.text, "error-preview"));
      button.append(
        content,
        el("span", item.error ? "error" : item.status, "status"),
      );
      button.addEventListener("click", () => select(item));
      timeline.append(button);
      buttons.push(button);
    }
  }
  // Match the visual lane ordering for keyboard navigation.
  visible = report.contexts.flatMap((c) =>
    visible.filter((i) => i.contextId === c.id),
  );
  if (!visible.length)
    timeline.append(el("p", "No matching retained events.", "empty"));
  if (matches.length > pageSize) {
    const nav = el(
      "div",
      `${matches.length} matches · page ${currentPage + 1} of ${Math.ceil(matches.length / pageSize)}`,
      "empty",
    );
    for (const [label, delta] of [
      ["Previous", -1],
      ["Next", 1],
    ] as const) {
      const b = el("button", label) as HTMLButtonElement;
      b.disabled =
        currentPage + delta < 0 ||
        (currentPage + delta) * pageSize >= matches.length;
      b.addEventListener("click", () => {
        currentPage += delta;
        render();
      });
      nav.append(b);
    }
    timeline.append(nav);
  }
  if (selected && !visible.includes(selected)) selected = visible[0];
  if (selected) select(selected);
  else {
    $("details").replaceChildren(
      el("h2", "No matching event"),
      el("p", "Change the filters to inspect retained text."),
    );
    copyText = "";
  }
}
for (const id of ["search", "status", "kind"])
  $(id).addEventListener("input", () => {
    currentPage = 0;
    render();
  });
$("timeline").addEventListener("keydown", (event) => {
  if (
    !["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key) ||
    !visible.length
  )
    return;
  event.preventDefault();
  const index = selected ? visible.indexOf(selected) : 0;
  const next =
    event.key === "Home"
      ? 0
      : event.key === "End"
        ? visible.length - 1
        : Math.max(
            0,
            Math.min(
              visible.length - 1,
              index + (event.key === "ArrowDown" ? 1 : -1),
            ),
          );
  select(visible[next]!, true);
});
$("copy").addEventListener("click", async () => {
  if (!copyText) {
    $("copy-status").textContent = "No retained text selected.";
    return;
  }
  try {
    await navigator.clipboard.writeText(copyText);
    $("copy-status").textContent = "Sanitized text copied.";
  } catch {
    const area = el("textarea") as HTMLTextAreaElement;
    area.value = copyText;
    document.body.append(area);
    area.select();
    const ok = document.execCommand("copy");
    area.remove();
    $("copy-status").textContent = ok
      ? "Sanitized text copied."
      : "Copy unavailable. Select the retained text manually.";
  }
});
render();

$("download").addEventListener("click", () => {
  const blob = new Blob(
    [JSON.stringify(data.omissionManifest, null, 2) + "\n"],
    { type: "application/json" },
  );
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "omission-manifest.json";
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});
