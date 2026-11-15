/**
 * `admitDerivedConversationWrite` — les règles d'écriture qu'un acte DÉRIVÉ
 * d'un message subit (#9899) : l'état terminal, le rang, le mineur en Global.
 * Jamais les débits, qui mesurent des messages.
 *
 * La route qui l'appelle a ses témoins de bout en bout
 * (`conversation-shared-translations-admission.test.ts`) ; ceux-ci tiennent les
 * cas que la route ne peut pas fabriquer — une ligne de conversation ou de
 * participant absente.
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';
import {
  admitDerivedConversationWrite,
  isConversationWriteRefused,
  type ConversationWriteAdmission,
  type DerivedWriteSenderRow,
} from '../../../../services/messaging/conversationWriteAdmission';

const NOW = new Date('2026-10-10T12:00:00.000Z');
const MINOR = { role: 'member', user: { role: 'USER', birthDate: new Date('2011-03-01T00:00:00.000Z') } };
const MEMBER = { role: 'member', user: { role: 'USER', birthDate: null } };

const reasonOf = (admission: ConversationWriteAdmission): string =>
  isConversationWriteRefused(admission) ? admission.reason : 'admitted';

const verdict = (conversation: Record<string, unknown> | null, sender: DerivedWriteSenderRow | null) =>
  reasonOf(admitDerivedConversationWrite({ conversation, sender, now: NOW }));

describe('admitDerivedConversationWrite', () => {
  it.each([
    ['une conversation dont la ligne manque : l’appartenance est jugée ailleurs', null, MEMBER, 'admitted'],
    ['un salon d’annonces sans participant lisible : la restriction est connue, l’identité manque', { isAnnouncementChannel: true }, null, 'write-role-insufficient'],
    ['une conversation libre sans participant lisible', { defaultWriteRole: 'everyone' }, null, 'admitted'],
    ['Global, qui n’a pas de rang, même marqué canal d’annonces', { type: 'global', isAnnouncementChannel: true }, MEMBER, 'admitted'],
    ['un mineur hors de Global', { type: 'group' }, MINOR, 'admitted'],
    ['un mineur dans Global', { type: 'global' }, MINOR, 'minor-global'],
    ['un âge non déclaré dans Global', { type: 'global' }, { role: 'member', user: null }, 'admitted'],
    ['une conversation close, même pour le staff plateforme', { closedAt: NOW }, { role: 'creator', user: { role: 'BIGBOSS' } }, 'conversation-closed'],
  ])('%s', (_label, conversation, sender, expected) => {
    expect(verdict(conversation, sender)).toBe(expected);
  });

  it('ne lit aucun débit : un mode lent réglé ne retient pas un acte dérivé', () => {
    expect(verdict({ type: 'group', slowModeSeconds: 30 }, MEMBER)).toBe('admitted');
  });
});
