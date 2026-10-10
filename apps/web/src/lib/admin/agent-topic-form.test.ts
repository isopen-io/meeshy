import { describe, expect, test } from 'bun:test';

import type { AgentTopic } from '@/lib/api/admin-agent-topics';

import { topicChangesOf, topicDraftOf, topicInputOf } from './agent-topic-form';

const SUJET: AgentTopic = {
  id: 't1',
  slug: 'cuisine',
  label: 'Cuisine',
  description: null,
  keywordPatterns: ['recette', 'four'],
  instructionTemplate: 'Parle de cuisine avec entrain et précision.',
  searchHintTemplate: 'recettes',
  examples: [],
  cooldownMinutes: 60,
  priority: 2,
  isActive: true,
};

describe('le brouillon d’un sujet', () => {
  test('un sujet neuf part des défauts de la passerelle (pause 60, priorité 0, actif)', () => {
    expect(topicDraftOf(null)).toMatchObject({ cooldownMinutes: '60', priority: '0', isActive: true, keywordPatterns: '' });
  });

  test('motifs et exemples s’écrivent un par ligne, les lignes vides tombent', () => {
    const verdict = topicInputOf({ ...topicDraftOf(SUJET), keywordPatterns: 'recette\n\n  four \n', examples: '\nUne tarte\n' });
    expect(verdict.ok && verdict.input).toMatchObject({ keywordPatterns: ['recette', 'four'], examples: ['Une tarte'], description: null });
  });

  test('les bornes de la passerelle sont relues avant l’envoi, champ par champ', () => {
    const verdict = topicInputOf({
      ...topicDraftOf(SUJET),
      slug: 'Cuisine Fine',
      keywordPatterns: '',
      instructionTemplate: 'trop court',
      searchHintTemplate: 'abc',
      priority: '11',
      cooldownMinutes: '1.5',
    });
    expect(verdict).toEqual({
      ok: false,
      invalid: ['slug', 'keywordPatterns', 'instructionTemplate', 'searchHintTemplate', 'cooldownMinutes', 'priority'],
    });
  });

  test('une édition n’envoie que ce qui change', () => {
    const verdict = topicInputOf({ ...topicDraftOf(SUJET), priority: '5', keywordPatterns: 'recette\nfour\nfourneau' });
    expect(verdict.ok && topicChangesOf(SUJET, verdict.input)).toEqual({ priority: 5, keywordPatterns: ['recette', 'four', 'fourneau'] });
    const intact = topicInputOf(topicDraftOf(SUJET));
    expect(intact.ok && topicChangesOf(SUJET, intact.input)).toEqual({});
  });
});
