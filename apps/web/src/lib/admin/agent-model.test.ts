import { beforeAll, describe, expect, test } from 'bun:test';

import { loadAdminInterfaceCatalog } from '@/lib/i18n-admin-catalog';
import { SUPPORTED_INTERFACE_LANGUAGES } from '@/lib/inline-interface-language-bootstrap.js';

import {
  AGENT_OUTCOMES,
  AGENT_TRIGGERS,
  agentConversationRefOf,
  agentNodeLabel,
  interpretAgentOutcome,
  interpretAgentTrigger,
} from './agent-model';

/**
 * **CE QUE L'AGENT FAIT, EN MOTS** (#8876) — chaque code que le service agent
 * écrit se dit dans les sept langues ; un code inconnu s'avoue « Non reconnu » et
 * ne se peint jamais ; la conversation suivie est nommée.
 */
beforeAll(async () => {
  await Promise.all(SUPPORTED_INTERFACE_LANGUAGES.map((language) => loadAdminInterfaceCatalog(language)));
});

describe('l’issue d’un scan', () => {
  test('les quatre issues que le service écrit, avec un ton qui suit leur gravité', () => {
    expect(interpretAgentOutcome('messages_sent', 'fr')).toMatchObject({ label: 'Message publié', tone: 'success', raw: 'messages_sent' });
    expect(interpretAgentOutcome('reactions_only', 'fr')).toMatchObject({ label: 'Réactions seules', tone: 'info' });
    expect(interpretAgentOutcome('skipped', 'fr')).toMatchObject({ label: 'Aucune action', tone: 'neutral' });
    expect(interpretAgentOutcome('error', 'fr')).toMatchObject({ label: 'Erreur', tone: 'danger' });
  });

  test('chaque issue porte une phrase qui dit ce qui s’est passé', () => {
    for (const outcome of AGENT_OUTCOMES) expect(interpretAgentOutcome(outcome, 'fr').explain).not.toBe(null);
  });

  test('un code inconnu s’avoue « Non reconnu » : le code brut ne vit que dans `raw`', () => {
    const unknown = interpretAgentOutcome('sent', 'fr');
    expect(unknown.label).toBe('Non reconnu');
    expect(unknown.raw).toBe('sent');
    expect(unknown.label).not.toContain('sent');
  });

  test('une issue absente se dit « Non renseigné »', () => {
    expect(interpretAgentOutcome(null, 'fr').label).toBe('Non renseigné');
    expect(interpretAgentOutcome('  ', 'fr').label).toBe('Non renseigné');
  });
});

describe('le déclencheur', () => {
  test('automatique ou manuel, avec sa phrase', () => {
    expect(interpretAgentTrigger('auto', 'fr')).toMatchObject({ label: 'Automatique', explain: 'Lancé par le planificateur de l’agent.' });
    expect(interpretAgentTrigger('manual', 'fr')).toMatchObject({ label: 'Manuel', tone: 'brand' });
    expect(interpretAgentTrigger('cron', 'fr').label).toBe('Non reconnu');
  });
});

describe('l’étape du graphe', () => {
  test('dite comme une action, jamais par son nom de nœud', () => {
    expect(agentNodeLabel('observer', 'fr')).toBe('observe la conversation');
    expect(agentNodeLabel('strategist', 'fr')).toBe('choisit quoi dire');
    expect(agentNodeLabel('generator', 'fr')).toBe('rédige un message');
    expect(agentNodeLabel('qualityGate', 'fr')).toBe('contrôle la qualité');
  });

  test('une étape inconnue ou absente reste dite, sans nom de nœud', () => {
    expect(agentNodeLabel(null, 'fr')).toBe('étape en cours');
    expect(agentNodeLabel('vectorSearch', 'fr')).toBe('étape en cours');
  });
});

describe('les sept langues portent chaque code', () => {
  test('issues, déclencheurs et étapes ont un libellé dans chaque langue — jamais « Non reconnu »', () => {
    for (const language of SUPPORTED_INTERFACE_LANGUAGES) {
      const unrecognized = interpretAgentOutcome('inconnu', language).label;
      for (const outcome of AGENT_OUTCOMES) {
        expect({ language, outcome, recognized: interpretAgentOutcome(outcome, language).label !== unrecognized }).toEqual({ language, outcome, recognized: true });
      }
      for (const trigger of AGENT_TRIGGERS) expect(interpretAgentTrigger(trigger, language).label.length).toBeGreaterThan(0);
      for (const node of ['observer', 'strategist', 'generator', 'qualityGate']) expect(agentNodeLabel(node, language).length).toBeGreaterThan(0);
    }
  });
});

describe('la conversation suivie, nommée', () => {
  test('son titre ; sans titre, « Conversation sans titre » — jamais l’identifiant', () => {
    expect(agentConversationRefOf({ conversationId: 'c1', title: 'Atelier', conversationType: 'group' }, 'fr')).toEqual({ kind: 'conversation', id: 'c1', label: 'Atelier' });
    const untitled = agentConversationRefOf({ conversationId: '0123456789abcdef01234567', title: null, conversationType: 'direct' }, 'fr');
    expect(untitled.label).toBe('Conversation sans titre');
  });
});
