/**
 * Tenant-neutral primitives. Worker bindings, domains, vendors, and secrets
 * intentionally belong to the private tenant adapter, not this package.
 */

export type Scalar = string | number | boolean | null | undefined;
export interface Values {
  [key: string]: Scalar | Values;
}

export type ConditionOperator =
  | "is_empty"
  | "is_not_empty"
  | "equals"
  | "not_equals"
  | "contains"
  | "not_contains";

export interface DeterministicCondition {
  left: string;
  operator: ConditionOperator;
  right?: string;
}

export type RestParameterLocation = "query" | "json" | "header";

export interface RestParameter {
  name: string;
  where: RestParameterLocation;
  source?: string;
  value?: string;
  required?: boolean;
}

export interface RestTool {
  key: string;
  scope: "live_variable" | "output_sorter" | "output_destination";
  method: "GET" | "POST" | "PUT" | "PATCH";
  url: string;
  tokenAlias?: string;
  parameters: RestParameter[];
}

export interface BuiltRestRequest {
  method: RestTool["method"];
  url: string;
  headers: Record<string, string>;
  body?: Record<string, string>;
}

export interface OutputFields {
  company_name?: string;
  customer_name?: string;
  caller_id?: string;
  callback_number?: string;
  issue_summary?: string;
  transcript?: string;
  [key: string]: Scalar | undefined;
}

export interface PromptFlowPrompt {
  id: string;
  key?: string;
  index?: number;
  text: string;
  mode?: string;
}

export interface PromptFlowCondition {
  id: string;
  thenIds: string[];
  elseIds: string[];
}

export interface AdvancePromptFlowOptions {
  queue: string[];
  prompts: PromptFlowPrompt[];
  conditions: PromptFlowCondition[];
  values: Values;
  shouldWaitForAnswer: (prompt: PromptFlowPrompt) => boolean;
  decideCondition: (condition: PromptFlowCondition) => Promise<boolean> | boolean;
}

export interface PromptFlowAdvanceResult {
  queue: string[];
  spokenPromptIds: string[];
  text: string;
  waitingForAnswer: boolean;
  currentPrompt?: PromptFlowPrompt;
  completed: boolean;
}

export interface OutputEmail {
  subject: string;
  text: string;
  html: string;
}

/**
 * A tenant-neutral view of the events sent by a realtime phone provider.
 * Adapters retain provider authentication and transport handling; this helper
 * only makes the state-machine decision testable outside a Worker runtime.
 */
export interface ConversationRelayEvent {
  kind: "connected" | "caller_prompt" | "dtmf" | "error" | "unknown";
  transcript: string;
}

export function classifyConversationRelayEvent(input: unknown): ConversationRelayEvent {
  const event = input && typeof input === "object" ? input as Record<string, unknown> : {};
  const type = clean(event.type as Scalar).toLowerCase();
  if (type === "connected" || type === "setup") return { kind: "connected", transcript: "" };
  if (type === "prompt") {
    return { kind: "caller_prompt", transcript: clean(event.voicePrompt as Scalar || event.transcript as Scalar || event.speechResult as Scalar) };
  }
  if (type === "dtmf") return { kind: "dtmf", transcript: clean(event.digit as Scalar) };
  if (type === "error") return { kind: "error", transcript: "" };
  return { kind: "unknown", transcript: "" };
}

/**
 * The public ordering contract for post-call delivery. The adapter injects
 * durable Workflow steps and its own provider functions, so credentials,
 * Cloudflare bindings, tenant output configuration, and destinations never
 * enter the public package.
 */
export interface PostCallOutputPipeline<State, Result> {
  step: (name: string, work: () => Promise<State>) => Promise<State>;
  start: (state: State) => Promise<State>;
  isDuplicate: (state: State) => boolean;
  duplicateResult: (state: State) => Result;
  loadSettings: (state: State) => Promise<State>;
  formatOutput: (state: State) => Promise<State>;
  runSorters: (state: State) => Promise<State>;
  shouldSendEmail: (state: State) => boolean;
  sendEmail: (state: State) => Promise<State>;
  skipEmail: (state: State) => Promise<State>;
  runDestinations: (state: State) => Promise<State>;
  persist: (state: State) => Promise<State>;
  result: (state: State) => Result;
}

export async function runPostCallOutputPipeline<State, Result>(initial: State, pipeline: PostCallOutputPipeline<State, Result>): Promise<Result> {
  let state = await pipeline.step("1. Start output delivery", () => pipeline.start(initial));
  if (pipeline.isDuplicate(state)) return pipeline.duplicateResult(state);

  state = await pipeline.step("2. Load output settings", () => pipeline.loadSettings(state));
  state = await pipeline.step("3. Format output", () => pipeline.formatOutput(state));
  state = await pipeline.step("3a. Run REST output sorters", () => pipeline.runSorters(state));
  state = pipeline.shouldSendEmail(state)
    ? await pipeline.step("4. Send email output", () => pipeline.sendEmail(state))
    : await pipeline.step("4a. Skip email output", () => pipeline.skipEmail(state));
  state = await pipeline.step("5. Run REST output destinations", () => pipeline.runDestinations(state));
  state = await pipeline.step("6. Persist output result", () => pipeline.persist(state));
  return pipeline.result(state);
}

/** Returns a bounded retry delay suitable for an adapter's scheduler. */
export function outputRetryDelaySeconds(attempt: number, baseSeconds = 5, maxSeconds = 300): number {
  const safeAttempt = Math.max(0, Math.floor(attempt));
  const safeBase = Math.max(1, Math.floor(baseSeconds));
  const safeMax = Math.max(safeBase, Math.floor(maxSeconds));
  return Math.min(safeMax, safeBase * 2 ** safeAttempt);
}

export function clean(value: Scalar): string {
  return String(value ?? "").trim();
}

export function getPath(values: Values, path: string): string {
  const current = path.split(".").filter(Boolean).reduce<unknown>((value, key) => {
    if (value && typeof value === "object" && key in value) return (value as Record<string, unknown>)[key];
    return undefined;
  }, values);
  return clean(current as Scalar);
}

export function renderTemplate(template: string, values: Values): string {
  return template.replace(/{{\s*([a-zA-Z0-9_.-]+)\s*}}/g, (_match, key: string) => getPath(values, key));
}

export function evaluateDeterministicCondition(condition: DeterministicCondition, values: Values): boolean {
  const left = getPath(values, condition.left).toLowerCase();
  const right = clean(condition.right).toLowerCase();
  switch (condition.operator) {
    case "is_empty": return !left;
    case "is_not_empty": return !!left;
    case "equals": return left === right;
    case "not_equals": return left !== right;
    case "contains": return left.includes(right);
    case "not_contains": return !left.includes(right);
  }
}

/**
 * Advances a saved prompt graph until the next caller answer is required or
 * the graph finishes. The private adapter supplies its own condition policy,
 * which keeps AI providers and tenant rules outside this package.
 */
export async function advancePromptFlow(options: AdvancePromptFlowOptions): Promise<PromptFlowAdvanceResult> {
  const queue = options.queue.map(clean).filter(Boolean);
  const promptById = new Map<string, PromptFlowPrompt>();
  const conditionById = new Map<string, PromptFlowCondition>();
  for (const prompt of options.prompts) {
    promptById.set(clean(prompt.id), prompt);
    if (prompt.key) promptById.set(clean(prompt.key), prompt);
  }
  for (const condition of options.conditions) conditionById.set(clean(condition.id), condition);

  const spokenPromptIds: string[] = [];
  const parts: string[] = [];
  while (queue.length) {
    const nextId = clean(queue.shift());
    if (!nextId) continue;
    const condition = conditionById.get(nextId);
    if (condition) {
      const selected = await options.decideCondition(condition) ? condition.thenIds : condition.elseIds;
      queue.unshift(...selected.map(clean).filter(Boolean));
      continue;
    }
    const prompt = promptById.get(nextId);
    if (!prompt || !clean(prompt.text)) continue;
    parts.push(renderTemplate(prompt.text, options.values));
    spokenPromptIds.push(prompt.id);
    if (options.shouldWaitForAnswer(prompt)) {
      return { queue, spokenPromptIds, text: parts.join("\n\n"), waitingForAnswer: true, currentPrompt: prompt, completed: false };
    }
  }
  return { queue, spokenPromptIds, text: parts.join("\n\n"), waitingForAnswer: false, completed: true };
}

export function normalizeE164(value: string): string {
  const digits = clean(value).replace(/\D/g, "");
  if (!digits) return "";
  if (digits.length === 10) return `+1${digits}`;
  return `+${digits}`;
}

export function buildRestRequest(tool: RestTool, values: Values, bearerToken?: string): BuiltRestRequest {
  const url = new URL(renderTemplate(tool.url, values));
  const headers: Record<string, string> = { accept: "application/json" };
  const body: Record<string, string> = {};

  if (bearerToken) headers.authorization = `Bearer ${bearerToken}`;

  for (const parameter of tool.parameters) {
    const resolved = renderTemplate(parameter.source ?? parameter.value ?? "", values);
    if (parameter.required && !resolved) throw new Error(`Missing required REST parameter: ${parameter.name}`);
    if (!resolved) continue;
    if (parameter.where === "query") url.searchParams.set(parameter.name, resolved);
    if (parameter.where === "header") headers[parameter.name] = resolved;
    if (parameter.where === "json") body[parameter.name] = resolved;
  }

  if (Object.keys(body).length) headers["content-type"] = "application/json";
  return { method: tool.method, url: url.toString(), headers, ...(Object.keys(body).length ? { body } : {}) };
}

export function buildOutputText(fields: OutputFields): string {
  const sections: Array<[string, string]> = [
    ["Company Name", clean(fields.company_name)],
    ["Customer Name", clean(fields.customer_name)],
    ["Caller ID", clean(fields.caller_id)],
    ["Callback Number", clean(fields.callback_number)],
    ["Summary", clean(fields.issue_summary)],
    ["Transcript", clean(fields.transcript)]
  ];
  return sections.filter(([, value]) => value).map(([label, value]) => `${label}: ${value}`).join("\n\n");
}

export function buildOutputPayload(fields: OutputFields, variables: Values = {}): Values {
  const output = { ...fields, text: buildOutputText(fields) };
  return { ...fields, summary: { ...fields }, output, variables };
}

export function formatOutputEmail(fields: OutputFields, subject: string): OutputEmail {
  const text = buildOutputText(fields);
  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;");
  return {
    subject: clean(subject),
    text,
    html: `<pre style="font:14px/1.45 system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; white-space:pre-wrap">${escaped}</pre>`,
  };
}
