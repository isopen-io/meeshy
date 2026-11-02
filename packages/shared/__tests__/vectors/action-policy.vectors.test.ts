/**
 * Vecteurs de la loi des actions (#11205) — deux gardes, deux questions :
 *  - le REJEU passe chaque cas du fichier dans la loi : tombe si la loi change
 *    sans que le fichier suive ;
 *  - la DIVERGENCE compare le fichier à ce que le plan PRODUIT : tombe si le
 *    fichier est retouché à la main, ou s'il manque un cas du plan.
 *
 * Régénération voulue (depuis `packages/shared`) : `bun run action-policy-vectors:generate`.
 *
 * @see packages/shared/fixtures/action-policy/
 * @see packages/shared/__tests__/action-policy/action-policy-vectors-law.ts
 * @see packages/shared/scripts/generate-action-policy-vectors.ts
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { conversationActionsFor } from '../../utils/conversation-action-policy.js';
import { messageActionsFor } from '../../utils/message-action-policy.js';
import {
  actionPolicyVectorFiles,
  type ConversationActionVector,
  type MessageActionVector,
} from '../action-policy/action-policy-vectors-law.js';

const DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'fixtures', 'action-policy');

const pathOf = (name: string): string => join(DIR, `${name}.vectors.json`);

const vectorsOf = <T>(path: string): readonly T[] => JSON.parse(readFileSync(path, 'utf-8')).vectors;

const messageVectors = vectorsOf<MessageActionVector>(pathOf('message-actions'));
const conversationVectors = vectorsOf<ConversationActionVector>(pathOf('conversation-actions'));

describe('les fichiers de vecteurs ne divergent pas du plan', () => {
  it.each(actionPolicyVectorFiles().map((file) => [file.name, file] as const))('%s.vectors.json est exactement ce que le plan produit', (_name, file) => {
    expect(JSON.parse(readFileSync(pathOf(file.name), 'utf-8'))).toEqual(JSON.parse(file.content));
  });

  it('les fichiers portent des cas, jamais zéro (leçon 257)', () => {
    expect(messageVectors.length).toBeGreaterThan(20);
    expect(conversationVectors.length).toBeGreaterThan(20);
  });
});

describe('vecteurs : message-actions', () => {
  it.each(messageVectors.map((vector) => [vector._label, vector] as const))('%s', (_label, vector) => {
    expect(messageActionsFor(vector.input)).toEqual(vector.expected);
  });
});

describe('vecteurs : conversation-actions', () => {
  it.each(conversationVectors.map((vector) => [vector._label, vector] as const))('%s', (_label, vector) => {
    expect(conversationActionsFor(vector.input)).toEqual(vector.expected);
  });
});

describe('« Supprimer pour moi » suit la participation active (#11415)', () => {
  const departed = messageVectors.filter((vector) => !vector.input.viewer.isActiveMember);

  it('aucun lecteur hors participation active ne se voit offrir « pour moi », comme DELETE /messages/:id/delete-for-me', () => {
    expect(departed.map((vector) => vector._label)).toEqual(
      expect.arrayContaining([
        'non-membre-supprimer-pour-moi-refuse',
        'ancien-membre-supprimer-pour-moi-refuse',
        'ancien-membre-son-propre-message-ne-se-supprime-plus-pour-moi',
        'ancien-membre-message-supprime-ne-se-masque-plus',
      ]),
    );
    departed.forEach((vector) => {
      expect(vector.expected.verdicts.deleteForMe).toBe(false);
      expect(vector.expected.groups.destructive).not.toContain('deleteForMe');
    });
  });

  it('un participant actif garde « pour moi »', () => {
    const active = messageVectors.find((vector) => vector._label === 'membre-actif-supprimer-pour-moi');
    expect(active?.expected.verdicts.deleteForMe).toBe(true);
    expect(active?.expected.groups.destructive).toContain('deleteForMe');
  });
});
