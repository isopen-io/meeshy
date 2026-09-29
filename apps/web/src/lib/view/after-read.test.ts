import { QueryClient } from '@tanstack/react-query';
import { beforeEach, describe, expect, test } from 'bun:test';

import { MESSAGE_EFFECT_FLAGS } from '@meeshy/shared/types/message-effect-flags';

import { messagesQueryKey } from '@/lib/api/messages';
import { applyMessageExpired } from '@/lib/api/realtime-ephemeral';
import type { Message } from '@/lib/api/types';
import { protectionOf } from '@/lib/reading-mode/protection';

import { afterReadSeenUpTo, isAfterReadMessage } from './after-read';
import { destructionPhaseOf } from './ephemeral-destruction';
import { resetEphemeralReception, resolveEphemeralDeadline } from './ephemeral-reception';

/**
 * LA FLAMME-ŒIL DANS LE FIL (#8304, contrat #8302) — un message qui porte
 * `EPHEMERAL | EPHEMERAL_AFTER_READ` n'a AUCUNE durée : rien ne décompte,
 * aucune pastille ne s'affiche, et c'est la SORTIE du lecteur qui le retire.
 */
const AFTER_READ = MESSAGE_EFFECT_FLAGS.EPHEMERAL | MESSAGE_EFFECT_FLAGS.EPHEMERAL_AFTER_READ;
const NOW = Date.parse('2026-09-27T10:00:00.000Z');

function messageOf(partial: Partial<Message>): Message {
  return {
    id: 'm-1',
    conversationId: 'c-a',
    senderId: 'u-other',
    content: 'Lis-moi puis oublie-moi.',
    originalLanguage: 'fr',
    messageType: 'text',
    isViewOnce: false,
    viewOnceCount: 0,
    isBlurred: false,
    translations: [],
    createdAt: new Date(NOW),
    ...partial,
  } as unknown as Message;
}

beforeEach(() => resetEphemeralReception());

describe('isAfterReadMessage — le bit, et lui seul', () => {
  test('EPHEMERAL | EPHEMERAL_AFTER_READ ⇒ flamme-œil', () => {
    expect(isAfterReadMessage(messageOf({ effectFlags: AFTER_READ }))).toBe(true);
  });

  test('un éphémère à durée, un message sans drapeau ⇒ non', () => {
    expect(isAfterReadMessage(messageOf({ effectFlags: MESSAGE_EFFECT_FLAGS.EPHEMERAL, ephemeralDuration: 30 }))).toBe(false);
    expect(isAfterReadMessage(messageOf({}))).toBe(false);
  });
});

describe('aucun décompte, aucune pastille — dans TOUS les modes (site unique `resolveEphemeralDeadline`)', () => {
  test('destinataire : l’échéance est `none`, même si une échéance a été servie', () => {
    const message = messageOf({ effectFlags: AFTER_READ, expiresAt: new Date(NOW + 60_000) });
    expect(resolveEphemeralDeadline({ message, isMine: false, now: NOW })).toEqual({ state: 'none' });
  });

  test('expéditeur : ni « en attente de réception », ni décompte', () => {
    const message = messageOf({ effectFlags: AFTER_READ, senderId: 'u-me' });
    expect(resolveEphemeralDeadline({ message, isMine: true, now: NOW })).toEqual({ state: 'none' });
  });
});

/**
 * CONSOMMÉE, ELLE NE REVIENT PAS (#8556) — après la sortie, la passerelle sert
 * encore le message une heure (grâce `D(u) + 1 h`) avec l'échéance du lecteur,
 * déjà PASSÉE. Le fil rouvert doit le tenir pour parti, sans rejouer la
 * combustion — jumelle web d'`ExpiredEphemeralRow.isGone` (iOS, #8352).
 */
describe('une flamme-œil consommée ne se repeint pas au retour du lecteur', () => {
  test('destinataire, échéance servie PASSÉE ⇒ la rangée est partie', () => {
    const message = messageOf({ effectFlags: AFTER_READ, expiresAt: new Date(NOW - 5 * 60_000) });
    const deadline = resolveEphemeralDeadline({ message, isMine: false, now: NOW });
    expect(destructionPhaseOf({ deadline, now: NOW, destroying: false, expired: false })).toBe('gone');
  });

  test('expéditeur : la bulle reste tant que la passerelle ne lui sert aucune échéance', () => {
    const message = messageOf({ effectFlags: AFTER_READ, senderId: 'u-me' });
    const deadline = resolveEphemeralDeadline({ message, isMine: true, now: NOW });
    expect(destructionPhaseOf({ deadline, now: NOW, destroying: false, expired: false })).toBe('visible');
  });
});

/**
 * #8630 — UNE RÉPONSE PART AVEC CE QU'ELLE CITE. La passerelle sert à la
 * réponse l'échéance du message cité quand celui-ci est mort pour ce lecteur
 * (`inheritedEphemeralExpiresAt`) : c'est la SEULE échéance que l'auteur d'une
 * flamme-œil peut recevoir, et elle vaut destruction pour lui aussi.
 */
describe('une réponse meurt, pour son lecteur, avec le message éphémère qu’elle cite (#8630)', () => {
  test('réponse ordinaire, échéance héritée passée ⇒ la rangée est partie', () => {
    const message = messageOf({ id: 'reply', replyToId: 'flamme', expiresAt: new Date(NOW - 5 * 60_000) } as Partial<Message>);
    const deadline = resolveEphemeralDeadline({ message, isMine: false, now: NOW });
    expect(destructionPhaseOf({ deadline, now: NOW, destroying: false, expired: false })).toBe('gone');
  });

  test('MA réponse flamme-œil, échéance héritée passée ⇒ partie de mon écran aussi', () => {
    const message = messageOf({ id: 'reply', senderId: 'u-me', effectFlags: AFTER_READ, expiresAt: new Date(NOW - 5 * 60_000) });
    const deadline = resolveEphemeralDeadline({ message, isMine: true, now: NOW });
    expect(destructionPhaseOf({ deadline, now: NOW, destroying: false, expired: false })).toBe('gone');
  });

  test('réponse ordinaire, échéance héritée À VENIR ⇒ encore là, et elle partira à cette échéance', () => {
    const message = messageOf({ id: 'reply', expiresAt: new Date(NOW + 60_000) });
    const deadline = resolveEphemeralDeadline({ message, isMine: false, now: NOW });
    expect(destructionPhaseOf({ deadline, now: NOW, destroying: false, expired: false })).toBe('visible');
    expect(destructionPhaseOf({ deadline, now: NOW + 60_000 + 1_000, destroying: false, expired: false })).toBe('gone');
  });
});

describe('la flamme-œil reste un ÉPHÉMÈRE pour la vue unique', () => {
  test('vue unique + flamme-œil, échéance passée ⇒ `expired`, jamais « déjà ouvert »', () => {
    const message = messageOf({ effectFlags: AFTER_READ | MESSAGE_EFFECT_FLAGS.VIEW_ONCE, isViewOnce: true, expiresAt: new Date(NOW - 1) });
    expect(protectionOf(message, NOW)).toBe('expired');
  });

  test('`message:expired` RETIRE une vue unique flamme-œil au lieu de la sceller', () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(messagesQueryKey('c-a'), {
      pages: [{ messages: [messageOf({ id: 'm-vu', effectFlags: AFTER_READ | MESSAGE_EFFECT_FLAGS.VIEW_ONCE, isViewOnce: true })], hasMore: false }],
      pageParams: [undefined],
    });
    applyMessageExpired(queryClient, { messageId: 'm-vu', conversationId: 'c-a' }, (fn) => fn());
    const data = queryClient.getQueryData(messagesQueryKey('c-a')) as { readonly pages: readonly { readonly messages: readonly Message[] }[] };
    expect(data.pages.flatMap((p) => p.messages.map((m) => m.id))).toEqual([]);
  });
});

describe('afterReadSeenUpTo — ce que la détection de lecture a montré', () => {
  const thread = [
    messageOf({ id: 'a', effectFlags: AFTER_READ }),
    messageOf({ id: 'b' }),
    messageOf({ id: 'c', effectFlags: AFTER_READ, senderId: 'u-me' }),
    messageOf({ id: 'd', effectFlags: AFTER_READ, deletedAt: new Date(NOW) }),
    messageOf({ id: 'e', effectFlags: AFTER_READ }),
    messageOf({ id: 'f', effectFlags: AFTER_READ }),
  ];

  test('les flammes-œil REÇUES jusqu’à la frontière lue — jamais les siennes, jamais une supprimée, jamais au-delà', () => {
    expect(afterReadSeenUpTo({ messages: thread, boundaryId: 'e', viewerId: 'u-me' })).toEqual(['a', 'e']);
  });

  test('une frontière absente du fil ne montre rien', () => {
    expect(afterReadSeenUpTo({ messages: thread, boundaryId: 'zz', viewerId: 'u-me' })).toEqual([]);
  });
});
