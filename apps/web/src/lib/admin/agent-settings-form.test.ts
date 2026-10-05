import { describe, expect, test } from 'bun:test';

import { loadAdminInterfaceCatalog, translateAdminMaybe } from '@/lib/i18n-admin-catalog';

import {
  AGENT_CONFIG_FIELDS,
  AGENT_CONFIG_NOT_EDITED,
  AGENT_CONFIG_SECTIONS,
  AGENT_GLOBAL_FIELDS,
  AGENT_GLOBAL_SECTIONS,
  changesOf,
  draftOf,
  pickServed,
  type AgentFieldSpec,
} from './agent-settings-form';

const SPECS: readonly AgentFieldSpec[] = [
  { key: 'enabled', kind: 'bool' },
  { key: 'scanIntervalMinutes', kind: 'int', min: 1, max: 1440 },
  { key: 'generationTemperature', kind: 'number', min: 0, max: 2 },
  { key: 'agentInstructions', kind: 'text', max: 20, nullable: true },
  { key: 'defaultModel', kind: 'text', max: 20, min: 1 },
  { key: 'defaultProvider', kind: 'choice', options: ['openai', 'anthropic'] },
];

const SERVED = {
  enabled: true,
  scanIntervalMinutes: 3,
  generationTemperature: 0.7,
  agentInstructions: null,
  defaultModel: 'gpt-4o-mini',
  defaultProvider: 'openai',
};

describe('le brouillon d’un réglage SERVI', () => {
  test('chaque champ devient sa forme éditable : booléen, texte du nombre, texte vide pour null', () => {
    expect(draftOf(SPECS, SERVED)).toEqual({
      enabled: true,
      scanIntervalMinutes: '3',
      generationTemperature: '0.7',
      agentInstructions: '',
      defaultModel: 'gpt-4o-mini',
      defaultProvider: 'openai',
    });
  });

  test('un champ que la passerelle ne sert pas reste vide, jamais inventé', () => {
    expect(draftOf(SPECS, {})).toEqual({
      enabled: false,
      scanIntervalMinutes: '',
      generationTemperature: '',
      agentInstructions: '',
      defaultModel: '',
      defaultProvider: '',
    });
  });

  test('pickServed ne garde que les champs de la table, aux types qu’ils annoncent', () => {
    expect(pickServed(SPECS, { ...SERVED, apiKeyEncrypted: 'x', scanIntervalMinutes: 'trois' })).toEqual({
      enabled: true,
      generationTemperature: 0.7,
      agentInstructions: null,
      defaultModel: 'gpt-4o-mini',
      defaultProvider: 'openai',
    });
  });
});

describe('seul ce qui CHANGE part', () => {
  test('un brouillon intact ne produit aucun changement', () => {
    expect(changesOf(SPECS, SERVED, draftOf(SPECS, SERVED))).toEqual({ ok: true, changes: {} });
  });

  test('un nombre retapé, un booléen basculé, un texte vidé (nullable) partent typés', () => {
    const draft = { ...draftOf(SPECS, SERVED), enabled: false, scanIntervalMinutes: ' 15 ', generationTemperature: '1,2', agentInstructions: 'Sois bref' };
    expect(changesOf(SPECS, SERVED, draft)).toEqual({
      ok: true,
      changes: { enabled: false, scanIntervalMinutes: 15, generationTemperature: 1.2, agentInstructions: 'Sois bref' },
    });
    const vide = { ...draftOf(SPECS, { ...SERVED, agentInstructions: 'Avant' }), agentInstructions: '  ' };
    expect(changesOf(SPECS, { ...SERVED, agentInstructions: 'Avant' }, vide)).toEqual({ ok: true, changes: { agentInstructions: null } });
  });

  test('hors bornes, non entier, texte trop long ou requis vide, choix inconnu : refusé, champ par champ', () => {
    const draft = {
      ...draftOf(SPECS, SERVED),
      scanIntervalMinutes: '2.5',
      generationTemperature: '3',
      agentInstructions: 'x'.repeat(21),
      defaultModel: ' ',
      defaultProvider: 'mistral',
    };
    expect(changesOf(SPECS, SERVED, draft)).toMatchObject({
      ok: false,
      invalid: ['scanIntervalMinutes', 'generationTemperature', 'agentInstructions', 'defaultModel', 'defaultProvider'],
      problems: {
        scanIntervalMinutes: { code: 'integer' },
        generationTemperature: { code: 'range' },
        agentInstructions: { code: 'length' },
        defaultModel: { code: 'required' },
        defaultProvider: { code: 'choice' },
      },
    });
  });

  test('un champ non servi laissé vide ne part pas', () => {
    expect(changesOf(SPECS, {}, draftOf(SPECS, {}))).toEqual({ ok: true, changes: { } });
  });
});

describe('les tables suivent les bornes de la passerelle', () => {
  test('la configuration d’une conversation garde min ≤ max des réponses et des mots', () => {
    const served = { minResponsesPerCycle: 2, maxResponsesPerCycle: 4, minWordsPerMessage: 5, maxWordsPerMessage: 80 };
    const draft = { ...draftOf(AGENT_CONFIG_FIELDS, served), minResponsesPerCycle: '9' };
    expect(changesOf(AGENT_CONFIG_FIELDS, served, draft)).toMatchObject({
      ok: false,
      invalid: ['minResponsesPerCycle', 'maxResponsesPerCycle'],
      problems: {
        minResponsesPerCycle: { code: 'order', other: 'maxResponsesPerCycle', side: 'low' },
        maxResponsesPerCycle: { code: 'order', other: 'minResponsesPerCycle', side: 'high' },
      },
    });
  });

  test('chaque clé n’apparaît qu’une fois par table', () => {
    for (const table of [AGENT_CONFIG_FIELDS, AGENT_GLOBAL_FIELDS]) {
      const keys = table.map((spec) => spec.key);
      expect(new Set(keys).size).toBe(keys.length);
    }
  });
});

/**
 * LE MIROIR DES SCHÉMAS DE LA PASSERELLE — les clés de `agentConfigSchema`
 * (`agent-configs.ts`) et de `globalConfigSchema` (`agent-llm.ts`), recopiées.
 * Une clé ajoutée là-bas sans être tranchée ici (éditée, ou exclue avec sa
 * raison) rougit ce témoin.
 */
const GATEWAY_CONFIG_KEYS = [
  'enabled', 'autoPickupEnabled', 'inactivityThresholdHours', 'minHistoricalMessages', 'maxControlledUsers', 'manualUserIds',
  'excludedRoles', 'excludedUserIds', 'triggerOnTimeout', 'timeoutSeconds', 'triggerOnUserMessage', 'triggerFromUserIds',
  'triggerOnReplyTo', 'agentType', 'contextWindowSize', 'useFullHistory', 'scanIntervalMinutes', 'minResponsesPerCycle',
  'maxResponsesPerCycle', 'reactionsEnabled', 'maxReactionsPerCycle', 'agentInstructions', 'webSearchEnabled', 'minWordsPerMessage',
  'maxWordsPerMessage', 'generationTemperature', 'qualityGateEnabled', 'qualityGateMinScore', 'weekdayMaxMessages', 'weekendMaxMessages',
  'weekdayMaxUsers', 'weekendMaxUsers', 'burstEnabled', 'burstSize', 'burstIntervalMinutes', 'quietIntervalMinutes',
  'inactivityDaysThreshold', 'prioritizeTaggedUsers', 'prioritizeRepliedUsers', 'reactionBoostFactor', 'eligibleConversationTypes',
  'messageFreshnessHours', 'maxConversationsPerCycle', 'globalScanEnabled', 'globalScanMinInterval', 'globalScanMaxInterval',
  'minDelayMinutes', 'maxDelayMinutes', 'spreadOverDayEnabled', 'maxMessagesPerUserPer10Min', 'freshTopicProbability',
  'freshTopicCategoryHints',
];
const GATEWAY_GLOBAL_KEYS = [
  'systemPrompt', 'enabled', 'defaultProvider', 'defaultModel', 'fallbackProvider', 'fallbackModel', 'globalDailyBudgetUsd',
  'maxConcurrentCalls', 'eligibleConversationTypes', 'messageFreshnessHours', 'maxConversationsPerCycle', 'weekdayMaxConversations',
  'weekendMaxConversations', 'globalScanEnabled', 'globalScanMinInterval', 'globalScanMaxInterval',
];

const specOf = (table: readonly AgentFieldSpec[], key: string): AgentFieldSpec => {
  const spec = table.find((entry) => entry.key === key);
  if (spec === undefined) throw new Error(`absent : ${key}`);
  return spec;
};

describe('TOUS les réglages éditables sont couverts', () => {
  test('conversation : table + exclusions nommées = le schéma de la passerelle, clé pour clé', () => {
    const covered = [...AGENT_CONFIG_FIELDS.map((spec) => spec.key), ...Object.keys(AGENT_CONFIG_NOT_EDITED)].sort();
    expect(covered).toEqual([...GATEWAY_CONFIG_KEYS].sort());
    expect(AGENT_CONFIG_FIELDS).toHaveLength(45);
  });

  test('global : les seize clés du schéma', () => {
    expect(AGENT_GLOBAL_FIELDS.map((spec) => spec.key).sort()).toEqual([...GATEWAY_GLOBAL_KEYS].sort());
  });

  test('chaque champ vit dans UNE section, et l’ordre des tables est celui des sections', () => {
    for (const [sections, table] of [
      [AGENT_CONFIG_SECTIONS, AGENT_CONFIG_FIELDS],
      [AGENT_GLOBAL_SECTIONS, AGENT_GLOBAL_FIELDS],
    ] as const) {
      expect(sections.flatMap((section) => section.keys)).toEqual(table.map((spec) => spec.key));
    }
  });

  test('chaque type a le bon contrôle : bascule, entier, nombre, liste nommée, ensemble coché, mots-clés', () => {
    expect(specOf(AGENT_CONFIG_FIELDS, 'burstEnabled')).toEqual({ key: 'burstEnabled', kind: 'bool' });
    expect(specOf(AGENT_CONFIG_FIELDS, 'timeoutSeconds')).toEqual({ key: 'timeoutSeconds', kind: 'int', min: 30, max: 3600 });
    expect(specOf(AGENT_CONFIG_FIELDS, 'reactionBoostFactor')).toEqual({ key: 'reactionBoostFactor', kind: 'number', min: 0.5, max: 5 });
    expect(specOf(AGENT_CONFIG_FIELDS, 'agentType')).toMatchObject({ kind: 'choice', options: ['personal', 'animator', 'support', 'faq'] });
    expect(specOf(AGENT_CONFIG_FIELDS, 'excludedRoles')).toMatchObject({ kind: 'set' });
    expect(specOf(AGENT_CONFIG_FIELDS, 'freshTopicCategoryHints')).toEqual({ key: 'freshTopicCategoryHints', kind: 'list', itemMax: 40, maxItems: 20 });
    expect(specOf(AGENT_CONFIG_FIELDS, 'manualUserIds')).toMatchObject({ kind: 'list', item: 'objectId' });
    expect(specOf(AGENT_GLOBAL_FIELDS, 'eligibleConversationTypes')).toMatchObject({ kind: 'set' });
    expect(specOf(AGENT_GLOBAL_FIELDS, 'fallbackProvider')).toMatchObject({ kind: 'choice', nullable: true });
  });
});

describe('les nouveaux genres de champ', () => {
  const T: readonly AgentFieldSpec[] = [
    specOf(AGENT_CONFIG_FIELDS, 'minDelayMinutes'),
    specOf(AGENT_CONFIG_FIELDS, 'maxDelayMinutes'),
    specOf(AGENT_CONFIG_FIELDS, 'excludedRoles'),
    specOf(AGENT_CONFIG_FIELDS, 'freshTopicCategoryHints'),
    specOf(AGENT_CONFIG_FIELDS, 'manualUserIds'),
    specOf(AGENT_GLOBAL_FIELDS, 'fallbackProvider'),
  ];
  const ID = 'a'.repeat(24);
  const SERVI = { minDelayMinutes: null, maxDelayMinutes: 30, excludedRoles: ['ADMIN', 'AGENT'], freshTopicCategoryHints: ['ia'], manualUserIds: [ID], fallbackProvider: null };

  test('le brouillon : vide pour null, ensemble tel quel, liste une par ligne', () => {
    expect(draftOf(T, SERVI)).toEqual({
      minDelayMinutes: '',
      maxDelayMinutes: '30',
      excludedRoles: ['ADMIN', 'AGENT'],
      freshTopicCategoryHints: 'ia',
      manualUserIds: ID,
      fallbackProvider: '',
    });
  });

  test('intact, rien ne part ; un ensemble recoché dans un autre ordre non plus', () => {
    expect(changesOf(T, SERVI, draftOf(T, SERVI))).toEqual({ ok: true, changes: {} });
    expect(changesOf(T, SERVI, { ...draftOf(T, SERVI), excludedRoles: ['AGENT', 'ADMIN'] })).toEqual({ ok: true, changes: {} });
  });

  test('seul le champ modifié part, typé : tableau, null, nombre', () => {
    const draft = { ...draftOf(T, SERVI), freshTopicCategoryHints: 'ia\nsport, musique\nia', maxDelayMinutes: '' };
    expect(changesOf(T, SERVI, draft)).toEqual({ ok: true, changes: { freshTopicCategoryHints: ['ia', 'sport', 'musique'], maxDelayMinutes: null } });
    expect(changesOf(T, SERVI, { ...draftOf(T, SERVI), excludedRoles: ['ADMIN'] })).toEqual({ ok: true, changes: { excludedRoles: ['ADMIN'] } });
    expect(changesOf(T, SERVI, { ...draftOf(T, SERVI), fallbackProvider: 'anthropic' })).toEqual({ ok: true, changes: { fallbackProvider: 'anthropic' } });
  });

  test('bornes : délai hors bornes, plancher au-dessus du plafond, identifiant mal formé, mot-clé trop long, trop de mots-clés', () => {
    expect(changesOf(T, SERVI, { ...draftOf(T, SERVI), minDelayMinutes: '2000' })).toMatchObject({ ok: false, problems: { minDelayMinutes: { code: 'range' } } });
    expect(changesOf(T, SERVI, { ...draftOf(T, SERVI), minDelayMinutes: '45' })).toMatchObject({
      ok: false,
      invalid: ['minDelayMinutes', 'maxDelayMinutes'],
      problems: { minDelayMinutes: { code: 'order', other: 'maxDelayMinutes' } },
    });
    expect(changesOf(T, SERVI, { ...draftOf(T, SERVI), manualUserIds: `${ID}\nlea` })).toMatchObject({ ok: false, problems: { manualUserIds: { code: 'item', value: 'lea' } } });
    expect(changesOf(T, SERVI, { ...draftOf(T, SERVI), freshTopicCategoryHints: 'x'.repeat(41) })).toMatchObject({ ok: false, problems: { freshTopicCategoryHints: { code: 'item' } } });
    const vingtEtUn = Array.from({ length: 21 }, (_, i) => `t${i}`).join('\n');
    expect(changesOf(T, SERVI, { ...draftOf(T, SERVI), freshTopicCategoryHints: vingtEtUn })).toMatchObject({ ok: false, problems: { freshTopicCategoryHints: { code: 'count' } } });
  });

  test('global : intervalle minimal du balayage ≤ maximal', () => {
    const served = { globalScanMinInterval: 60, globalScanMaxInterval: 300 };
    const draft = { ...draftOf(AGENT_GLOBAL_FIELDS, served), globalScanMinInterval: '600' };
    expect(changesOf(AGENT_GLOBAL_FIELDS, served, draft)).toMatchObject({ ok: false, invalid: ['globalScanMinInterval', 'globalScanMaxInterval'] });
  });
});

describe('chaque champ a son libellé humain, dans les quatre langues', () => {
  for (const language of ['fr', 'en', 'es', 'pt'] as const) {
    test(`${language} : libellés, titres de section, options nommées`, async () => {
      await loadAdminInterfaceCatalog(language);
      const missing = [
        ...AGENT_CONFIG_FIELDS.map((spec) => `admin.agentPanel.cfg.${spec.key}`),
        ...AGENT_CONFIG_SECTIONS.map((section) => `admin.agentPanel.cfg.section.${section.id}`),
        ...['personal', 'animator', 'support', 'faq'].map((type) => `admin.agentPanel.cfg.agentType.${type}`),
        ...AGENT_GLOBAL_FIELDS.map((spec) => `admin.agentPanel.global.${spec.key}`),
        ...AGENT_GLOBAL_SECTIONS.map((section) => `admin.agentPanel.global.section.${section.id}`),
      ].filter((key) => translateAdminMaybe(language, key) === null);
      expect(missing).toEqual([]);
    });
  }
});
