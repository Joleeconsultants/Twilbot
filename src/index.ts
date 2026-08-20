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
  | "not_contains"
  | "time_between";

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

/**
 * Portable tenant-config contract version. AI-generated onboard JSON must set
 * `version` to this value. Bump only when the public import shape changes.
 */
export const TENANT_CONFIG_VERSION = 1 as const;

/**
 * Portable, secret-free configuration that a private tenant adapter can
 * export, validate, and import. This is the AI-onboard contract for the
 * public engine. Token aliases are identifiers only; the adapter resolves
 * their values from its own secret provider.
 */
export interface TenantConfig {
  version: typeof TENANT_CONFIG_VERSION;
  branding: {
    applicationName: string;
  };
  restTools?: RestTool[];
}

export interface TenantConfigValidation {
  ok: boolean;
  errors: string[];
  config?: TenantConfig;
}

const REST_SCOPES = new Set<RestTool["scope"]>(["live_variable", "output_sorter", "output_destination"]);
const REST_METHODS = new Set<RestTool["method"]>(["GET", "POST", "PUT", "PATCH"]);
const REST_PARAMETER_LOCATIONS = new Set<RestParameterLocation>(["query", "json", "header"]);
const PORTABLE_KEY = /^[a-z][a-z0-9_]{0,63}$/;
const PORTABLE_ALIAS = /^[A-Z][A-Z0-9_]{0,127}$/;

/** Validates and normalizes the public tenant configuration format. */
export function validateTenantConfig(input: unknown): TenantConfigValidation {
  const errors: string[] = [];
  const value = input && typeof input === "object" && !Array.isArray(input) ? input as Record<string, unknown> : null;
  if (!value) return { ok: false, errors: ["Tenant configuration must be an object."] };
  if (value.version !== TENANT_CONFIG_VERSION) errors.push(`Tenant configuration version must be ${TENANT_CONFIG_VERSION}.`);

  const branding = value.branding && typeof value.branding === "object" && !Array.isArray(value.branding)
    ? value.branding as Record<string, unknown>
    : {};
  const applicationName = clean(branding.applicationName as Scalar);
  if (!applicationName || applicationName.length > 80) errors.push("branding.applicationName must contain 1 to 80 characters.");

  const rawTools = value.restTools === undefined ? [] : value.restTools;
  if (!Array.isArray(rawTools)) errors.push("restTools must be an array when provided.");
  const keys = new Set<string>();
  const restTools: RestTool[] = [];

  if (Array.isArray(rawTools)) rawTools.forEach((rawTool, toolIndex) => {
    const tool = rawTool && typeof rawTool === "object" && !Array.isArray(rawTool) ? rawTool as Record<string, unknown> : null;
    const prefix = `restTools[${toolIndex}]`;
    if (!tool) {
      errors.push(`${prefix} must be an object.`);
      return;
    }
    if ("token" in tool || "bearerToken" in tool || "secret" in tool) errors.push(`${prefix} must use tokenAlias, never a token value.`);
    const key = clean(tool.key as Scalar).toLowerCase();
    if (!PORTABLE_KEY.test(key)) errors.push(`${prefix}.key must be lowercase snake_case.`);
    if (keys.has(key)) errors.push(`${prefix}.key must be unique.`);
    keys.add(key);
    const scope = clean(tool.scope as Scalar) as RestTool["scope"];
    if (!REST_SCOPES.has(scope)) errors.push(`${prefix}.scope is invalid.`);
    const method = clean(tool.method as Scalar).toUpperCase() as RestTool["method"];
    if (!REST_METHODS.has(method)) errors.push(`${prefix}.method is invalid.`);
    const url = clean(tool.url as Scalar);
    try {
      const parsedUrl = new URL(url);
      if (parsedUrl.protocol !== "https:") errors.push(`${prefix}.url must use HTTPS.`);
      if ([...parsedUrl.searchParams.keys()].some((name) => /(?:token|secret|authorization|api[_-]?key)/i.test(name))) {
        errors.push(`${prefix}.url must not contain credential-like query parameters.`);
      }
    } catch {
      errors.push(`${prefix}.url must be a valid HTTPS URL.`);
    }
    const tokenAlias = clean(tool.tokenAlias as Scalar);
    if (tokenAlias && !PORTABLE_ALIAS.test(tokenAlias)) errors.push(`${prefix}.tokenAlias must be an uppercase alias.`);
    if (!Array.isArray(tool.parameters)) errors.push(`${prefix}.parameters must be an array.`);
    const parameters: RestParameter[] = [];
    const parameterNames = new Set<string>();
    if (Array.isArray(tool.parameters)) tool.parameters.forEach((rawParameter, parameterIndex) => {
      const parameter = rawParameter && typeof rawParameter === "object" && !Array.isArray(rawParameter)
        ? rawParameter as Record<string, unknown>
        : null;
      const parameterPrefix = `${prefix}.parameters[${parameterIndex}]`;
      if (!parameter) {
        errors.push(`${parameterPrefix} must be an object.`);
        return;
      }
      const name = clean(parameter.name as Scalar);
      const where = clean(parameter.where as Scalar) as RestParameterLocation;
      if (!PORTABLE_KEY.test(name)) errors.push(`${parameterPrefix}.name must be lowercase snake_case.`);
      if (parameterNames.has(name)) errors.push(`${parameterPrefix}.name must be unique within the tool.`);
      parameterNames.add(name);
      if (!REST_PARAMETER_LOCATIONS.has(where)) errors.push(`${parameterPrefix}.where is invalid.`);
      const source = parameter.source === undefined ? undefined : clean(parameter.source as Scalar);
      const literal = parameter.value === undefined ? undefined : clean(parameter.value as Scalar);
      if (!source && literal === undefined) errors.push(`${parameterPrefix} needs source or value.`);
      if (parameter.required !== undefined && typeof parameter.required !== "boolean") errors.push(`${parameterPrefix}.required must be boolean.`);
      parameters.push({ name, where, ...(source ? { source } : {}), ...(literal !== undefined ? { value: literal } : {}), ...(typeof parameter.required === "boolean" ? { required: parameter.required } : {}) });
    });
    parameters.length || errors.push(`${prefix} must define at least one parameter.`);
    restTools.push({ key, scope, method, url, ...(tokenAlias ? { tokenAlias } : {}), parameters });
  });

  if (errors.length) return { ok: false, errors };
  return { ok: true, errors: [], config: { version: TENANT_CONFIG_VERSION, branding: { applicationName }, restTools } };
}

/** Parses an exported JSON tenant configuration without ever resolving aliases. */
export function parseTenantConfig(serialized: string): TenantConfigValidation {
  try {
    return validateTenantConfig(JSON.parse(serialized));
  } catch {
    return { ok: false, errors: ["Tenant configuration must be valid JSON."] };
  }
}

/** Produces a stable, pretty JSON export after validation. */
export function exportTenantConfig(input: unknown): string {
  const result = validateTenantConfig(input);
  if (!result.ok || !result.config) throw new Error(result.errors.join(" "));
  return JSON.stringify(result.config, null, 2);
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

/**
 * Stable names for the generic post-call workflow. Private Worker adapters
 * should use these names directly with Workflow.step.do so Cloudflare can
 * render the actual output stages instead of a single helper-function node.
 */
export const POST_CALL_OUTPUT_WORKFLOW_STEPS = {
  start: "1. Start output delivery",
  duplicate: "1a. Return duplicate result",
  loadSettings: "2. Load output settings",
  formatOutput: "3. Format output",
  runSorters: "4. Run REST output sorters",
  sendEmail: "5. Send email output",
  skipEmail: "5a. Skip email output",
  runDestinations: "6. Run REST output destinations",
  persist: "7. Persist output result",
} as const;

export async function runPostCallOutputPipeline<State, Result>(initial: State, pipeline: PostCallOutputPipeline<State, Result>): Promise<Result> {
  let state = await pipeline.step(POST_CALL_OUTPUT_WORKFLOW_STEPS.start, () => pipeline.start(initial));
  if (pipeline.isDuplicate(state)) return pipeline.duplicateResult(state);

  state = await pipeline.step(POST_CALL_OUTPUT_WORKFLOW_STEPS.loadSettings, () => pipeline.loadSettings(state));
  state = await pipeline.step(POST_CALL_OUTPUT_WORKFLOW_STEPS.formatOutput, () => pipeline.formatOutput(state));
  state = await pipeline.step(POST_CALL_OUTPUT_WORKFLOW_STEPS.runSorters, () => pipeline.runSorters(state));
  state = pipeline.shouldSendEmail(state)
    ? await pipeline.step(POST_CALL_OUTPUT_WORKFLOW_STEPS.sendEmail, () => pipeline.sendEmail(state))
    : await pipeline.step(POST_CALL_OUTPUT_WORKFLOW_STEPS.skipEmail, () => pipeline.skipEmail(state));
  state = await pipeline.step(POST_CALL_OUTPUT_WORKFLOW_STEPS.runDestinations, () => pipeline.runDestinations(state));
  state = await pipeline.step(POST_CALL_OUTPUT_WORKFLOW_STEPS.persist, () => pipeline.persist(state));
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

function clockMinutes(value: string): number | null {
  const match = clean(value).match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isInteger(hours) || !Number.isInteger(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return hours * 60 + minutes;
}

/** Returns true when a 24-hour clock value is within an inclusive time window. */
export function isTimeBetween(value: string, range: string): boolean {
  const now = clockMinutes(value);
  const [startValue, endValue] = clean(range).split("|", 2);
  const start = clockMinutes(startValue || "");
  const end = clockMinutes(endValue || "");
  if (now === null || start === null || end === null) return false;
  return start <= end ? now >= start && now <= end : now >= start || now <= end;
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
    case "time_between": return isTimeBetween(getPath(values, condition.left), clean(condition.right));
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
    if (!prompt) continue;
    // An empty prompt is an intentional terminal slot. It lets an app keep a
    // stable prompt layout without having to delete or rewire later steps.
    if (!clean(prompt.text)) return { queue: [], spokenPromptIds, text: parts.join("\n\n"), waitingForAnswer: false, completed: true };
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
