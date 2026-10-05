import { describe, expect, test } from 'bun:test';

import {
  AGENT_CONFIG_FIELDS,
  AGENT_GLOBAL_FIELDS,
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
    expect(changesOf(SPECS, SERVED, draft)).toEqual({
      ok: false,
      invalid: ['scanIntervalMinutes', 'generationTemperature', 'agentInstructions', 'defaultModel', 'defaultProvider'],
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
    expect(changesOf(AGENT_CONFIG_FIELDS, served, draft)).toEqual({ ok: false, invalid: ['minResponsesPerCycle', 'maxResponsesPerCycle'] });
  });

  test('chaque clé n’apparaît qu’une fois par table', () => {
    for (const table of [AGENT_CONFIG_FIELDS, AGENT_GLOBAL_FIELDS]) {
      const keys = table.map((spec) => spec.key);
      expect(new Set(keys).size).toBe(keys.length);
    }
  });
});
