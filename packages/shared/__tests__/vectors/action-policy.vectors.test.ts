/**
 * Vecteurs de la loi des actions (#11205) — deux gardes, deux questions :
 *  - le REJEU passe chaque cas du fichier dans la loi : tombe si la loi change
 *    sans que le fichier suive ;
 *  - la DIVERGENCE compare le fichier à ce que le plan PRODUIT : tombe si le
 *    fichier est retouché à la main, ou s'il manque un cas du plan.
 *
 * Régénération voulue (depuis `packages/shared`) :
 * `UPDATE_ACTION_POLICY_VECTORS=1 bunx vitest run __tests__/vectors/action-policy.vectors.test.ts`.
 *
 * @see packages/shared/fixtures/action-policy/
 * @see packages/shared/__tests__/action-policy/action-policy-vectors-law.ts
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { conversationActionsFor } from '../../utils/conversation-action-policy.js';
import { messageActionsFor } from '../../utils/message-action-policy.js';
import {
  actionPolicyVectorsFormat,
  buildConversationActionVectors,
  buildMessageActionVectors,
  type ConversationActionVector,
  type MessageActionVector,
} from '../action-policy/action-policy-vectors-law.js';

const DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'fixtures', 'action-policy');

const FILES = {
  message: { path: join(DIR, 'message-actions.vectors.json'), law: 'messageActionsFor', build: buildMessageActionVectors },
  conversation: { path: join(DIR, 'conversation-actions.vectors.json'), law: 'conversationActionsFor', build: buildConversationActionVectors },
} as const;

const render = (file: (typeof FILES)[keyof typeof FILES]): string =>
  `${JSON.stringify({ $format: actionPolicyVectorsFormat(file.law), vectors: file.build() }, null, 2)}\n`;

if (process.env.UPDATE_ACTION_POLICY_VECTORS === '1') Object.values(FILES).forEach((file) => writeFileSync(file.path, render(file)));

const vectorsOf = <T>(path: string): readonly T[] => JSON.parse(readFileSync(path, 'utf-8')).vectors;

const messageVectors = vectorsOf<MessageActionVector>(FILES.message.path);
const conversationVectors = vectorsOf<ConversationActionVector>(FILES.conversation.path);

describe('les fichiers de vecteurs ne divergent pas du plan', () => {
  it.each(Object.entries(FILES))('%s-actions.vectors.json est exactement ce que le plan produit', (_name, file) => {
    expect(JSON.parse(readFileSync(file.path, 'utf-8'))).toEqual(JSON.parse(render(file)));
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
