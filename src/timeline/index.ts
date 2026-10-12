import { check, LIMITS, object, type Budget } from "../limits/index.js";
import { operation } from "../policy/index.js";
import type { Action, Context, ReportError, Issue } from "../schemas/types.js";
import type { Redactor } from "../redaction/index.js";
interface RecordAction {
  action: Action;
  parent: unknown;
  rawStart: number | null;
  rawEnd: number | null;
  finished: boolean;
  ambiguous: boolean;
}
const time = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) && v >= 0 && v < 1e15 ? v : null;
export class Timeline {
  readonly actions: Action[] = [];
  readonly errors: ReportError[] = [];
  readonly contexts: Context[] = [];
  constructor(
    readonly redactor: Redactor,
    readonly issue: (i: Omit<Issue, "count">) => void,
    readonly budget: Budget = LIMITS,
  ) {}
  stream(entryId: string, origin: Context["origin"]): Lane {
    check(this.contexts.length < this.budget.streams, "stream-limit");
    const id = "context-" + (this.contexts.length + 1);
    const c: Context = {
      id,
      lane: "lane-" + (this.contexts.length + 1),
      origin,
      clock: "stream-relative",
      assertionObservations:
        origin === "runner"
          ? "not-observed"
          : origin === "browser"
            ? "out-of-scope"
            : "not-observed",
    };
    this.contexts.push(c);
    return new Lane(this, c, entryId);
  }
}
export class Lane {
  private calls = new Map<string, RecordAction>();
  private orphanIds = new Set<string>();
  private base: number | null = null;
  constructor(
    readonly owner: Timeline,
    readonly context: Context,
    readonly entryId: string,
  ) {}
  issue(code: string, index: number | null, path = "events"): void {
    this.owner.issue({
      code,
      entryId: this.entryId,
      eventIndex: index,
      schemaPath: path,
    });
  }
  error(
    value: unknown,
    index: number,
    action: Action | null,
    end: number | null,
  ): void {
    check(this.owner.errors.length < this.owner.budget.errors, "error-limit");
    const data = object(value) ? value : {};
    const id = "error-" + (this.owner.errors.length + 1);
    const err: ReportError = {
      id,
      contextId: this.context.id,
      actionId: action?.id ?? null,
      name: this.owner.redactor.sanitize(data.name, "errors[].name"),
      message: this.owner.redactor.error(data.message, "errors[].message"),
      timeMs:
        end !== null && this.base !== null
          ? Math.round((end - this.base) * 1000) / 1000
          : null,
      eventIndex: index,
    };
    this.owner.errors.push(err);
    action?.errorIds.push(id);
  }
  consume(e: Record<string, unknown>, index: number): void {
    const type = e.type;
    if (type === "error") {
      this.error({ message: e.message }, index, null, null);
      return;
    }
    if (
      typeof type !== "string" ||
      !["before", "after", "action"].includes(type)
    )
      return;
    if (
      typeof e.callId !== "string" ||
      e.callId.length === 0 ||
      e.callId.length > 1024
    ) {
      this.issue("invalid-call-id", index);
      return;
    }
    const call = e.callId;
    if (type === "before" || type === "action") {
      const old = this.calls.get(call);
      if (old) {
        old.ambiguous = true;
        old.action.outcome = "unknown";
        this.issue("duplicate-before", index);
        return;
      }
      check(
        this.owner.actions.length < this.owner.budget.actions,
        "action-limit",
      );
      const op = operation(e.class, e.method);
      if (!op.known)
        this.issue("unknown-operation", index, "events[].operation");
      const start = time(e.startTime);
      if (start === null) this.issue("invalid-start-time", index);
      if (this.base === null && start !== null) this.base = start;
      const action: Action = {
        id: "action-" + (this.owner.actions.length + 1),
        contextId: this.context.id,
        lane: this.context.lane,
        operation: op.label,
        operationKnown: op.known,
        startMs:
          start !== null && this.base !== null
            ? Math.round((start - this.base) * 1000) / 1000
            : null,
        endMs: null,
        durationMs: null,
        outcome: "incomplete",
        parentId: null,
        errorIds: [],
        eventIndex: index,
      };
      const record: RecordAction = {
        action,
        parent: e.parentId,
        rawStart: start,
        rawEnd: null,
        finished: false,
        ambiguous: this.orphanIds.has(call),
      };
      this.calls.set(call, record);
      this.owner.actions.push(action);
      if (e.class === "Test" && e.method === "expect")
        this.context.assertionObservations = "recorded";
      if (type === "action") this.finish(e, index, record);
      return;
    }
    const record = this.calls.get(call);
    if (!record) {
      check(this.orphanIds.size < this.owner.budget.actions, "action-limit");
      this.orphanIds.add(call);
      this.issue("orphan-after", index);
      if (e.error) this.error(e.error, index, null, null);
      return;
    }
    this.finish(e, index, record);
  }
  private finish(
    e: Record<string, unknown>,
    index: number,
    r: RecordAction,
  ): void {
    if (r.finished) {
      r.ambiguous = true;
      r.action.outcome = "unknown";
      this.issue("duplicate-after", index);
      if (e.error) this.error(e.error, index, r.action, null);
      return;
    }
    r.finished = true;
    const end = time(e.endTime);
    r.rawEnd = end;
    if (end === null || r.rawStart === null || end < r.rawStart) {
      r.action.outcome = "unknown";
      this.issue("invalid-duration", index);
    } else {
      r.action.endMs =
        this.base === null ? null : Math.round((end - this.base) * 1000) / 1000;
      r.action.durationMs = Math.round((end - r.rawStart) * 1000) / 1000;
      r.action.outcome =
        r.ambiguous || !r.action.operationKnown
          ? "unknown"
          : e.error
            ? "failed"
            : "passed";
    }
    if (e.error) {
      if (!object(e.error) || typeof e.error.message !== "string")
        this.issue("invalid-error-structure", index);
      this.error(e.error, index, r.action, end);
    }
  }
  complete(): void {
    for (const r of this.calls.values()) {
      if (r.action.outcome === "incomplete")
        this.issue("unfinished-action", r.action.eventIndex);
      if (r.ambiguous) r.action.outcome = "unknown";
      if (r.parent !== undefined) {
        const p =
          typeof r.parent === "string" ? this.calls.get(r.parent) : undefined;
        if (
          p &&
          p !== r &&
          !p.ambiguous &&
          !r.ambiguous &&
          p.rawStart !== null &&
          r.rawStart !== null &&
          p.rawEnd !== null &&
          r.rawEnd !== null &&
          p.rawStart <= r.rawStart &&
          p.rawEnd >= r.rawEnd &&
          p.action.eventIndex < r.action.eventIndex
        )
          r.action.parentId = p.action.id;
        else {
          this.issue(
            "unverified-parent",
            r.action.eventIndex,
            "actions[].parentId",
          );
          r.action.outcome = "unknown";
        }
      }
    }
  }
}
