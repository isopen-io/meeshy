/**
 * **LES RÉGLAGES DE L'AGENT, EN BROUILLON** (lot Agent complet) — la table des
 * champs qu'un formulaire de l'écran Agent rend, et la loi qui transforme un
 * brouillon tapé en changements à envoyer.
 *
 * Les bornes sont celles des schémas Zod de la passerelle
 * (`services/gateway/src/routes/admin/agent-configs.ts` § `agentConfigSchema`,
 * `agent-llm.ts` § `globalConfigSchema`) : un champ accepté ici et refusé là
 * serait un bouton « Enregistrer » qui échoue à coup sûr.
 *
 * ## Seul ce qui CHANGE part
 *
 * `PUT /configs/:id` et `PUT /global-config` écrivent ce qu'ils reçoivent : un
 * champ renvoyé à l'identique ne coûte rien, mais un champ que la passerelle
 * n'a PAS servi et que l'écran renverrait vide l'écraserait. Le brouillon se
 * compare donc au servi, champ par champ, et seuls les écarts partent.
 *
 * Un nombre se TAPE (le champ garde le texte, la virgule décimale est lue) et
 * se relit ici ; un texte « nullable » vidé part en `null`.
 */
export type AgentFieldSpec =
  | { readonly key: string; readonly kind: 'bool' }
  | { readonly key: string; readonly kind: 'int' | 'number'; readonly min: number; readonly max?: number }
  | { readonly key: string; readonly kind: 'text'; readonly max: number; readonly min?: number; readonly nullable?: boolean; readonly multiline?: boolean }
  | { readonly key: string; readonly kind: 'choice'; readonly options: readonly string[] };

export type AgentDraft = Readonly<Record<string, string | boolean>>;
export type AgentServed = Readonly<Record<string, unknown>>;

export type AgentChanges =
  | { readonly ok: true; readonly changes: Readonly<Record<string, unknown>> }
  | { readonly ok: false; readonly invalid: readonly string[] };

/** Les paires « plancher ≤ plafond » que la passerelle refuse inversées (`refine`). */
type Pair = readonly [string, string];

export const AGENT_CONFIG_FIELDS: readonly AgentFieldSpec[] = [
  { key: 'enabled', kind: 'bool' },
  { key: 'autoPickupEnabled', kind: 'bool' },
  { key: 'scanIntervalMinutes', kind: 'int', min: 1, max: 1440 },
  { key: 'maxControlledUsers', kind: 'int', min: 1, max: 50 },
  { key: 'minResponsesPerCycle', kind: 'int', min: 0, max: 50 },
  { key: 'maxResponsesPerCycle', kind: 'int', min: 1, max: 50 },
  { key: 'reactionsEnabled', kind: 'bool' },
  { key: 'maxReactionsPerCycle', kind: 'int', min: 0, max: 50 },
  { key: 'weekdayMaxMessages', kind: 'int', min: 1, max: 100 },
  { key: 'weekendMaxMessages', kind: 'int', min: 1, max: 200 },
  { key: 'minWordsPerMessage', kind: 'int', min: 1, max: 200 },
  { key: 'maxWordsPerMessage', kind: 'int', min: 10, max: 2000 },
  { key: 'generationTemperature', kind: 'number', min: 0, max: 2 },
  { key: 'qualityGateEnabled', kind: 'bool' },
  { key: 'webSearchEnabled', kind: 'bool' },
  { key: 'agentInstructions', kind: 'text', max: 5000, nullable: true, multiline: true },
];

const CONFIG_PAIRS: readonly Pair[] = [
  ['minResponsesPerCycle', 'maxResponsesPerCycle'],
  ['minWordsPerMessage', 'maxWordsPerMessage'],
];

export const AGENT_PROVIDERS = ['openai', 'anthropic'] as const;

export const AGENT_GLOBAL_FIELDS: readonly AgentFieldSpec[] = [
  { key: 'enabled', kind: 'bool' },
  { key: 'globalScanEnabled', kind: 'bool' },
  { key: 'defaultProvider', kind: 'choice', options: AGENT_PROVIDERS },
  { key: 'defaultModel', kind: 'text', min: 1, max: 120 },
  { key: 'globalDailyBudgetUsd', kind: 'number', min: 0, max: 1000 },
  { key: 'maxConcurrentCalls', kind: 'int', min: 1, max: 50 },
  { key: 'messageFreshnessHours', kind: 'int', min: 1, max: 168 },
  { key: 'weekdayMaxConversations', kind: 'int', min: 1, max: 500 },
  { key: 'weekendMaxConversations', kind: 'int', min: 1, max: 500 },
  { key: 'systemPrompt', kind: 'text', max: 10000, multiline: true },
];

/** Les champs du modèle que le formulaire souverain réécrit (`PUT /llm`) — la clé, à part, n'est jamais relue. */
export const AGENT_LLM_FIELDS: readonly AgentFieldSpec[] = [
  { key: 'provider', kind: 'choice', options: AGENT_PROVIDERS },
  { key: 'model', kind: 'text', min: 1, max: 120 },
  { key: 'dailyBudgetUsd', kind: 'number', min: 0 },
  { key: 'maxCostPerCall', kind: 'number', min: 0 },
];

const isNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

/** La valeur servie d'un champ, si elle a le type que la table annonce ; `undefined` sinon. */
function servedValue(spec: AgentFieldSpec, served: AgentServed): unknown {
  const value = served[spec.key];
  switch (spec.kind) {
    case 'bool':
      return typeof value === 'boolean' ? value : undefined;
    case 'int':
    case 'number':
      return isNumber(value) ? value : undefined;
    case 'text':
      return typeof value === 'string' || (spec.nullable === true && value === null) ? value : undefined;
    case 'choice':
      return typeof value === 'string' ? value : undefined;
  }
}

/** Les seuls champs de la table, aux types annoncés : ce qu'un réglage servi DIT, rien de plus. */
export function pickServed(specs: readonly AgentFieldSpec[], raw: AgentServed): AgentServed {
  const picked: Record<string, unknown> = {};
  for (const spec of specs) {
    const value = servedValue(spec, raw);
    if (value !== undefined) picked[spec.key] = value;
  }
  return picked;
}

export function draftOf(specs: readonly AgentFieldSpec[], served: AgentServed): AgentDraft {
  const draft: Record<string, string | boolean> = {};
  for (const spec of specs) {
    const value = servedValue(spec, served);
    if (spec.kind === 'bool') draft[spec.key] = value === true;
    else if (spec.kind === 'int' || spec.kind === 'number') draft[spec.key] = isNumber(value) ? String(value) : '';
    else draft[spec.key] = typeof value === 'string' ? value : '';
  }
  return draft;
}

type Parsed = { readonly valid: true; readonly value: unknown } | { readonly valid: false };

function parse(spec: AgentFieldSpec, entry: string | boolean | undefined): Parsed {
  if (spec.kind === 'bool') return { valid: true, value: entry === true };
  const text = typeof entry === 'string' ? entry.trim() : '';
  switch (spec.kind) {
    case 'int':
    case 'number': {
      const value = Number(text.replace(',', '.'));
      if (text === '' || !Number.isFinite(value)) return { valid: false };
      if (spec.kind === 'int' && !Number.isInteger(value)) return { valid: false };
      if (value < spec.min || (spec.max !== undefined && value > spec.max)) return { valid: false };
      return { valid: true, value };
    }
    case 'text':
      if (text === '' && spec.nullable === true) return { valid: true, value: null };
      if (text.length < (spec.min ?? 0) || text.length > spec.max) return { valid: false };
      return { valid: true, value: text };
    case 'choice':
      return spec.options.includes(text) ? { valid: true, value: text } : { valid: false };
  }
}

/** Un champ non servi, laissé à son état vide, n'est pas un changement. */
const untouched = (spec: AgentFieldSpec, entry: string | boolean | undefined): boolean =>
  spec.kind === 'bool' ? entry !== true : typeof entry !== 'string' || entry.trim() === '';

export function changesOf(specs: readonly AgentFieldSpec[], served: AgentServed, draft: AgentDraft): AgentChanges {
  const changes: Record<string, unknown> = {};
  const effective: Record<string, unknown> = {};
  const invalid: string[] = [];

  for (const spec of specs) {
    const before = servedValue(spec, served);
    const entry = draft[spec.key];
    effective[spec.key] = before;
    if (before === undefined && untouched(spec, entry)) continue;
    const parsed = parse(spec, entry);
    if (!parsed.valid) {
      invalid.push(spec.key);
      continue;
    }
    effective[spec.key] = parsed.value;
    if (parsed.value !== before) changes[spec.key] = parsed.value;
  }

  const pairs = specs === AGENT_CONFIG_FIELDS ? CONFIG_PAIRS : [];
  for (const [low, high] of pairs) {
    const a = effective[low];
    const b = effective[high];
    if (isNumber(a) && isNumber(b) && a > b) {
      for (const key of [low, high]) if (!invalid.includes(key)) invalid.push(key);
    }
  }

  return invalid.length > 0 ? { ok: false, invalid } : { ok: true, changes };
}
