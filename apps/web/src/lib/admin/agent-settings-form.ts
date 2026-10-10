/**
 * **LES RÉGLAGES DE L'AGENT, EN BROUILLON** (lot Agent complet) — la table des
 * champs qu'un formulaire de l'écran Agent rend, regroupés en sections, et la
 * loi qui transforme un brouillon tapé en changements à envoyer.
 *
 * Les bornes sont celles des schémas Zod de la passerelle
 * (`services/gateway/src/routes/admin/agent-configs.ts` § `agentConfigSchema`,
 * `agent-llm.ts` § `globalConfigSchema`) : un champ accepté ici et refusé là
 * serait un bouton « Enregistrer » qui échoue à coup sûr.
 *
 * ## Tous les réglages éditables — et pourquoi sept clés du schéma ne le sont pas
 *
 * `PUT /global-config` : les seize clés de `globalConfigSchema` sont éditées.
 * `PUT /configs/:id` : quarante-cinq des cinquante-deux clés d'`agentConfigSchema`.
 * Les sept autres sont NOMMÉES dans `AGENT_CONFIG_NOT_EDITED` avec leur raison —
 * un champ que l'écran offrirait sans effet, ou qui ferait échouer l'écriture,
 * serait un contrôle qui ment.
 *
 * ## Seul ce qui CHANGE part
 *
 * `PUT /configs/:id` et `PUT /global-config` écrivent ce qu'ils reçoivent : un
 * champ renvoyé à l'identique ne coûte rien, mais un champ que la passerelle
 * n'a PAS servi et que l'écran renverrait vide l'écraserait. Le brouillon se
 * compare donc au servi, champ par champ, et seuls les écarts partent.
 *
 * Un nombre se TAPE (le champ garde le texte, la virgule décimale est lue) et
 * se relit ici ; un texte ou un nombre « nullable » vidé part en `null` ; une
 * liste de mots-clés se tape une valeur par ligne (ou séparée par des virgules) ;
 * un ensemble de choix nommés se coche.
 */
export type AgentFieldSpec =
  | { readonly key: string; readonly kind: 'bool' }
  | {
      readonly key: string;
      readonly kind: 'int' | 'number';
      readonly min: number;
      readonly max?: number;
      /** Vide : `null`, la valeur par défaut du service de l'agent. */
      readonly nullable?: boolean;
      /** La clé du plafond que ce plancher ne doit pas dépasser (`min… ≤ max…`). */
      readonly atMost?: string;
    }
  | { readonly key: string; readonly kind: 'text'; readonly max: number; readonly min?: number; readonly nullable?: boolean; readonly multiline?: boolean }
  | { readonly key: string; readonly kind: 'choice'; readonly options: readonly string[]; readonly nullable?: boolean }
  /** Un tableau de choix NOMMÉS, cochés : une valeur servie hors de la liste est gardée telle quelle. */
  | { readonly key: string; readonly kind: 'set'; readonly options: readonly string[] }
  /** Un tableau de chaînes libres, une par ligne. */
  | {
      readonly key: string;
      readonly kind: 'list';
      /** Le format d'un élément : `objectId` pour un identifiant de membre. */
      readonly item?: 'objectId';
      readonly itemMax?: number;
      readonly maxItems?: number;
    };

export type AgentFieldKind = AgentFieldSpec['kind'];

/** Une section du formulaire : un titre (`id`) et ses champs, dans l'ordre. */
export type AgentFieldSection = { readonly id: string; readonly keys: readonly string[] };

export type AgentDraftValue = string | boolean | readonly string[];
export type AgentDraft = Readonly<Record<string, AgentDraftValue>>;
export type AgentServed = Readonly<Record<string, unknown>>;

/** Ce qui ne va pas dans un champ, assez précis pour être DIT sous lui. */
export type AgentFieldProblem =
  | { readonly code: 'range' | 'integer' | 'number' | 'required' | 'length' | 'choice' | 'count' }
  | { readonly code: 'item'; readonly value: string }
  | { readonly code: 'order'; readonly other: string; readonly side: 'low' | 'high' };

export type AgentChanges =
  | { readonly ok: true; readonly changes: Readonly<Record<string, unknown>> }
  | { readonly ok: false; readonly invalid: readonly string[]; readonly problems: Readonly<Record<string, AgentFieldProblem>> };

export const AGENT_PROVIDERS = ['openai', 'anthropic'] as const;
/** `agentType` (`schema.prisma` § `AgentConfig`) : le comportement général de l'agent dans la conversation. */
export const AGENT_TYPES = ['personal', 'animator', 'support', 'faq'] as const;
/** Les types de conversation (`@meeshy/shared/types/conversation` § `ConversationType`). */
export const AGENT_CONVERSATION_TYPES = ['direct', 'group', 'public', 'global', 'broadcast'] as const;
/** Les rôles de compte (`schema.prisma` § `enum UserRole`) — l'agent les compare au rôle du membre (`notIn`). */
export const AGENT_USER_ROLES = ['USER', 'ADMIN', 'MODERATOR', 'BIGBOSS', 'AUDIT', 'ANALYST', 'AGENT'] as const;

const ids = (key: string): AgentFieldSpec => ({ key, kind: 'list', item: 'objectId' });

export const AGENT_CONFIG_SECTIONS: readonly AgentFieldSection[] = [
  { id: 'general', keys: ['enabled', 'agentType', 'agentInstructions', 'webSearchEnabled'] },
  {
    id: 'members',
    keys: [
      'autoPickupEnabled',
      'maxControlledUsers',
      'inactivityThresholdHours',
      'minHistoricalMessages',
      'weekdayMaxUsers',
      'weekendMaxUsers',
      'manualUserIds',
      'excludedUserIds',
      'excludedRoles',
    ],
  },
  {
    id: 'rhythm',
    keys: [
      'scanIntervalMinutes',
      'spreadOverDayEnabled',
      'minDelayMinutes',
      'maxDelayMinutes',
      'burstEnabled',
      'burstSize',
      'burstIntervalMinutes',
      'quietIntervalMinutes',
    ],
  },
  {
    id: 'budget',
    keys: [
      'weekdayMaxMessages',
      'weekendMaxMessages',
      'minResponsesPerCycle',
      'maxResponsesPerCycle',
      'maxMessagesPerUserPer10Min',
      'reactionsEnabled',
      'maxReactionsPerCycle',
    ],
  },
  {
    id: 'style',
    keys: ['minWordsPerMessage', 'maxWordsPerMessage', 'generationTemperature', 'qualityGateEnabled', 'qualityGateMinScore', 'contextWindowSize', 'useFullHistory'],
  },
  {
    id: 'triggers',
    keys: [
      'triggerOnTimeout',
      'timeoutSeconds',
      'triggerOnUserMessage',
      'triggerFromUserIds',
      'triggerOnReplyTo',
      'prioritizeTaggedUsers',
      'prioritizeRepliedUsers',
      'reactionBoostFactor',
    ],
  },
  { id: 'topics', keys: ['freshTopicProbability', 'freshTopicCategoryHints'] },
];

const CONFIG_SPECS: Readonly<Record<string, AgentFieldSpec>> = Object.fromEntries(
  (
    [
      { key: 'enabled', kind: 'bool' },
      { key: 'agentType', kind: 'choice', options: AGENT_TYPES },
      { key: 'agentInstructions', kind: 'text', max: 5000, nullable: true, multiline: true },
      { key: 'webSearchEnabled', kind: 'bool' },

      { key: 'autoPickupEnabled', kind: 'bool' },
      { key: 'maxControlledUsers', kind: 'int', min: 1, max: 50 },
      { key: 'inactivityThresholdHours', kind: 'int', min: 1, max: 720 },
      { key: 'minHistoricalMessages', kind: 'int', min: 0 },
      { key: 'weekdayMaxUsers', kind: 'int', min: 1, max: 20 },
      { key: 'weekendMaxUsers', kind: 'int', min: 1, max: 30 },
      ids('manualUserIds'),
      ids('excludedUserIds'),
      { key: 'excludedRoles', kind: 'set', options: AGENT_USER_ROLES },

      { key: 'scanIntervalMinutes', kind: 'int', min: 1, max: 1440 },
      { key: 'spreadOverDayEnabled', kind: 'bool' },
      { key: 'minDelayMinutes', kind: 'int', min: 1, max: 1440, nullable: true, atMost: 'maxDelayMinutes' },
      { key: 'maxDelayMinutes', kind: 'int', min: 1, max: 1440, nullable: true },
      { key: 'burstEnabled', kind: 'bool' },
      { key: 'burstSize', kind: 'int', min: 1, max: 10 },
      { key: 'burstIntervalMinutes', kind: 'int', min: 1, max: 30 },
      { key: 'quietIntervalMinutes', kind: 'int', min: 10, max: 480 },

      { key: 'weekdayMaxMessages', kind: 'int', min: 1, max: 100 },
      { key: 'weekendMaxMessages', kind: 'int', min: 1, max: 200 },
      { key: 'minResponsesPerCycle', kind: 'int', min: 0, max: 50, atMost: 'maxResponsesPerCycle' },
      { key: 'maxResponsesPerCycle', kind: 'int', min: 1, max: 50 },
      { key: 'maxMessagesPerUserPer10Min', kind: 'int', min: 1, max: 20, nullable: true },
      { key: 'reactionsEnabled', kind: 'bool' },
      { key: 'maxReactionsPerCycle', kind: 'int', min: 0, max: 50 },

      { key: 'minWordsPerMessage', kind: 'int', min: 1, max: 200, atMost: 'maxWordsPerMessage' },
      { key: 'maxWordsPerMessage', kind: 'int', min: 10, max: 2000 },
      { key: 'generationTemperature', kind: 'number', min: 0, max: 2 },
      { key: 'qualityGateEnabled', kind: 'bool' },
      { key: 'qualityGateMinScore', kind: 'number', min: 0, max: 1 },
      { key: 'contextWindowSize', kind: 'int', min: 10, max: 250 },
      { key: 'useFullHistory', kind: 'bool' },

      { key: 'triggerOnTimeout', kind: 'bool' },
      { key: 'timeoutSeconds', kind: 'int', min: 30, max: 3600 },
      { key: 'triggerOnUserMessage', kind: 'bool' },
      ids('triggerFromUserIds'),
      { key: 'triggerOnReplyTo', kind: 'bool' },
      { key: 'prioritizeTaggedUsers', kind: 'bool' },
      { key: 'prioritizeRepliedUsers', kind: 'bool' },
      { key: 'reactionBoostFactor', kind: 'number', min: 0.5, max: 5 },

      { key: 'freshTopicProbability', kind: 'number', min: 0, max: 1 },
      { key: 'freshTopicCategoryHints', kind: 'list', itemMax: 40, maxItems: 20 },
    ] satisfies readonly AgentFieldSpec[]
  ).map((spec) => [spec.key, spec]),
);

const inOrder = (sections: readonly AgentFieldSection[], specs: Readonly<Record<string, AgentFieldSpec>>): readonly AgentFieldSpec[] =>
  sections.flatMap((section) =>
    section.keys.map((key) => {
      const spec = specs[key];
      if (spec === undefined) throw new Error(`Réglage de l'agent sans table : ${key}`);
      return spec;
    }),
  );

export const AGENT_CONFIG_FIELDS: readonly AgentFieldSpec[] = inOrder(AGENT_CONFIG_SECTIONS, CONFIG_SPECS);

/**
 * Les clés d'`agentConfigSchema` que la fiche d'une conversation n'édite PAS, et pourquoi.
 * Un témoin vérifie que table + exclusions = schéma de la passerelle, clé pour clé.
 */
export const AGENT_CONFIG_NOT_EDITED: Readonly<Record<string, 'derived' | 'globalOnly' | 'noColumn'>> = {
  /** Recalculée par la passerelle depuis `inactivityThresholdHours` à chaque écriture. */
  inactivityDaysThreshold: 'derived',
  /** Stockées par conversation, mais l'agent ne les lit QUE dans la configuration globale (`conversation-scanner.ts`). */
  eligibleConversationTypes: 'globalOnly',
  messageFreshnessHours: 'globalOnly',
  maxConversationsPerCycle: 'globalOnly',
  /** Acceptées par le schéma, absentes du modèle `AgentConfig` : l'écriture échouerait (Prisma). */
  globalScanEnabled: 'noColumn',
  globalScanMinInterval: 'noColumn',
  globalScanMaxInterval: 'noColumn',
};

export const AGENT_GLOBAL_SECTIONS: readonly AgentFieldSection[] = [
  { id: 'general', keys: ['enabled', 'systemPrompt'] },
  { id: 'model', keys: ['defaultProvider', 'defaultModel', 'fallbackProvider', 'fallbackModel'] },
  { id: 'budget', keys: ['globalDailyBudgetUsd', 'maxConcurrentCalls'] },
  {
    id: 'scan',
    keys: [
      'globalScanEnabled',
      'globalScanMinInterval',
      'globalScanMaxInterval',
      'eligibleConversationTypes',
      'messageFreshnessHours',
      'maxConversationsPerCycle',
      'weekdayMaxConversations',
      'weekendMaxConversations',
    ],
  },
];

const GLOBAL_SPECS: Readonly<Record<string, AgentFieldSpec>> = Object.fromEntries(
  (
    [
      { key: 'enabled', kind: 'bool' },
      { key: 'systemPrompt', kind: 'text', max: 10000, multiline: true },
      { key: 'defaultProvider', kind: 'choice', options: AGENT_PROVIDERS },
      { key: 'defaultModel', kind: 'text', min: 1, max: 120 },
      { key: 'fallbackProvider', kind: 'choice', options: AGENT_PROVIDERS, nullable: true },
      { key: 'fallbackModel', kind: 'text', max: 120, nullable: true },
      { key: 'globalDailyBudgetUsd', kind: 'number', min: 0, max: 1000 },
      { key: 'maxConcurrentCalls', kind: 'int', min: 1, max: 50 },
      { key: 'globalScanEnabled', kind: 'bool' },
      { key: 'globalScanMinInterval', kind: 'int', min: 1, atMost: 'globalScanMaxInterval' },
      { key: 'globalScanMaxInterval', kind: 'int', min: 1 },
      { key: 'eligibleConversationTypes', kind: 'set', options: AGENT_CONVERSATION_TYPES },
      { key: 'messageFreshnessHours', kind: 'int', min: 1, max: 168 },
      { key: 'maxConversationsPerCycle', kind: 'int', min: 0 },
      { key: 'weekdayMaxConversations', kind: 'int', min: 1, max: 500 },
      { key: 'weekendMaxConversations', kind: 'int', min: 1, max: 500 },
    ] satisfies readonly AgentFieldSpec[]
  ).map((spec) => [spec.key, spec]),
);

export const AGENT_GLOBAL_FIELDS: readonly AgentFieldSpec[] = inOrder(AGENT_GLOBAL_SECTIONS, GLOBAL_SPECS);

/** Les champs du modèle que le formulaire souverain réécrit (`PUT /llm`) — la clé, à part, n'est jamais relue. */
export const AGENT_LLM_FIELDS: readonly AgentFieldSpec[] = [
  { key: 'provider', kind: 'choice', options: AGENT_PROVIDERS },
  { key: 'model', kind: 'text', min: 1, max: 120 },
  { key: 'dailyBudgetUsd', kind: 'number', min: 0 },
  { key: 'maxCostPerCall', kind: 'number', min: 0 },
];

const isNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const isStringArray = (value: unknown): value is readonly string[] => Array.isArray(value) && value.every((entry) => typeof entry === 'string');
const OBJECT_ID = /^[0-9a-fA-F]{24}$/;

/** La valeur servie d'un champ, si elle a le type que la table annonce ; `undefined` sinon. */
function servedValue(spec: AgentFieldSpec, served: AgentServed): unknown {
  const value = served[spec.key];
  switch (spec.kind) {
    case 'bool':
      return typeof value === 'boolean' ? value : undefined;
    case 'int':
    case 'number':
      return isNumber(value) || (spec.nullable === true && value === null) ? value : undefined;
    case 'text':
    case 'choice':
      return typeof value === 'string' || (spec.nullable === true && value === null) ? value : undefined;
    case 'set':
    case 'list':
      return isStringArray(value) ? value : undefined;
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
  const draft: Record<string, AgentDraftValue> = {};
  for (const spec of specs) {
    const value = servedValue(spec, served);
    if (spec.kind === 'bool') draft[spec.key] = value === true;
    else if (spec.kind === 'int' || spec.kind === 'number') draft[spec.key] = isNumber(value) ? String(value) : '';
    else if (spec.kind === 'set') draft[spec.key] = isStringArray(value) ? value : [];
    else if (spec.kind === 'list') draft[spec.key] = isStringArray(value) ? value.join('\n') : '';
    else draft[spec.key] = typeof value === 'string' ? value : '';
  }
  return draft;
}

/** Les éléments d'une liste tapée : une valeur par ligne ou par virgule, sans blanc ni doublon. */
export const listItemsOf = (text: string): readonly string[] => [
  ...new Set(
    text
      .split(/[\n,]/)
      .map((entry) => entry.trim())
      .filter((entry) => entry !== ''),
  ),
];

type Parsed = { readonly valid: true; readonly value: unknown } | { readonly valid: false; readonly problem: AgentFieldProblem };

const refuse = (problem: AgentFieldProblem): Parsed => ({ valid: false, problem });

function parse(spec: AgentFieldSpec, entry: AgentDraftValue | undefined): Parsed {
  if (spec.kind === 'bool') return { valid: true, value: entry === true };
  if (spec.kind === 'set') return { valid: true, value: Array.isArray(entry) ? [...entry] : [] };
  const text = typeof entry === 'string' ? entry.trim() : '';
  switch (spec.kind) {
    case 'int':
    case 'number': {
      if (text === '') return spec.nullable === true ? { valid: true, value: null } : refuse({ code: 'required' });
      const value = Number(text.replace(',', '.'));
      if (!Number.isFinite(value)) return refuse({ code: 'number' });
      if (spec.kind === 'int' && !Number.isInteger(value)) return refuse({ code: 'integer' });
      if (value < spec.min || (spec.max !== undefined && value > spec.max)) return refuse({ code: 'range' });
      return { valid: true, value };
    }
    case 'text':
      if (text === '' && spec.nullable === true) return { valid: true, value: null };
      if (text.length < (spec.min ?? 0)) return refuse({ code: 'required' });
      if (text.length > spec.max) return refuse({ code: 'length' });
      return { valid: true, value: text };
    case 'choice':
      if (text === '' && spec.nullable === true) return { valid: true, value: null };
      return spec.options.includes(text) ? { valid: true, value: text } : refuse({ code: 'choice' });
    case 'list': {
      const items = listItemsOf(typeof entry === 'string' ? entry : '');
      const wrong = items.find((item) => (spec.item === 'objectId' && !OBJECT_ID.test(item)) || (spec.itemMax !== undefined && item.length > spec.itemMax));
      if (wrong !== undefined) return refuse({ code: 'item', value: wrong });
      if (spec.maxItems !== undefined && items.length > spec.maxItems) return refuse({ code: 'count' });
      return { valid: true, value: items };
    }
  }
}

/** Un champ non servi, laissé à son état vide, n'est pas un changement. */
function untouched(spec: AgentFieldSpec, entry: AgentDraftValue | undefined): boolean {
  if (spec.kind === 'bool') return entry !== true;
  if (spec.kind === 'set') return !Array.isArray(entry) || entry.length === 0;
  return typeof entry !== 'string' || entry.trim() === '';
}

function same(spec: AgentFieldSpec, before: unknown, after: unknown): boolean {
  if (Array.isArray(before) && Array.isArray(after)) {
    if (before.length !== after.length) return false;
    // Un ensemble coché ne dépend pas de l'ordre ; une liste tapée, si.
    const [a, b] = spec.kind === 'set' ? [[...before].sort(), [...after].sort()] : [before, after];
    return a.every((value, index) => value === b[index]);
  }
  return before === after;
}

export function changesOf(specs: readonly AgentFieldSpec[], served: AgentServed, draft: AgentDraft): AgentChanges {
  const changes: Record<string, unknown> = {};
  const effective: Record<string, unknown> = {};
  const problems: Record<string, AgentFieldProblem> = {};

  for (const spec of specs) {
    const before = servedValue(spec, served);
    const entry = draft[spec.key];
    effective[spec.key] = before;
    if (before === undefined && untouched(spec, entry)) continue;
    const parsed = parse(spec, entry);
    if (!parsed.valid) {
      problems[spec.key] = parsed.problem;
      continue;
    }
    effective[spec.key] = parsed.value;
    if (!same(spec, before, parsed.value)) changes[spec.key] = parsed.value;
  }

  for (const spec of specs) {
    if ((spec.kind !== 'int' && spec.kind !== 'number') || spec.atMost === undefined) continue;
    const low = effective[spec.key];
    const high = effective[spec.atMost];
    if (isNumber(low) && isNumber(high) && low > high) {
      problems[spec.key] ??= { code: 'order', other: spec.atMost, side: 'low' };
      problems[spec.atMost] ??= { code: 'order', other: spec.key, side: 'high' };
    }
  }

  const invalid = specs.map((spec) => spec.key).filter((key) => problems[key] !== undefined);
  return invalid.length > 0 ? { ok: false, invalid, problems } : { ok: true, changes };
}
