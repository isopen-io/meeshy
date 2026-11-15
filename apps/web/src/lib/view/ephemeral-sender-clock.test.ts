import { beforeEach, describe, expect, test } from 'bun:test';

import { protectionFieldsOf } from '@/lib/send/compose-protection';
import { localMessageOf } from '@/lib/send/local-message';

import {
  noteServedDeadline,
  peekEphemeralDeadline,
  resetEphemeralReception,
  resolveEphemeralDeadline,
  servedDeadlineFor,
} from './ephemeral-reception';

/**
 * **L'EXPÉDITEUR D'UN ÉPHÉMÈRE NE DÉCOMPTE QU'UNE FOIS QUE QUELQU'UN A REÇU** (#8905).
 *
 * La loi partagée (`packages/shared/utils/ephemeral-countdown.ts`) donne à
 * l'expéditeur `max D(u)` — la plus tardive des échéances de ses
 * destinataires ; la passerelle la sert (`null` tant que personne n'a reçu,
 * puis `message:countdown-started`). La bulle optimiste portait `envoi +
 * durée` : l'expéditeur voyait décompter dès l'envoi. Aucun témoin ne lit
 * l'horloge murale.
 */

const SENT_AT = 1_757_600_000_000;

beforeEach(() => resetEphemeralReception());

describe('la bulle de l’expéditeur ne porte AUCUNE échéance client', () => {
  test('la protection composée porte la DURÉE, jamais une échéance', () => {
    const fields = protectionFieldsOf({ ephemeralSeconds: 60 });
    expect('expiresAt' in fields).toBe(false);
    expect(fields.ephemeralDuration).toBe(60);
  });

  test('la flamme-œil n’a ni durée ni échéance', () => {
    const fields = protectionFieldsOf({ ephemeralSeconds: 0 });
    expect('expiresAt' in fields).toBe(false);
    expect('ephemeralDuration' in fields).toBe(false);
  });

  test('la bulle optimiste attend la réception, même dix minutes après l’envoi', () => {
    const local = localMessageOf({
      clientMessageId: 'cid-8905',
      conversationId: 'c-a',
      viewerId: 'u-sender',
      content: 'disparaît',
      originalLanguage: 'fr',
      protection: { ephemeralSeconds: 60 },
      now: new Date(SENT_AT),
    });

    expect(local.expiresAt).toBeUndefined();
    expect(peekEphemeralDeadline({ message: local, isMine: true, now: SENT_AT + 600_000 })).toEqual({
      state: 'awaiting-reception',
      durationSeconds: 60,
    });
  });
});

describe('l’échéance SERVIE pilote seule le décompte de l’expéditeur', () => {
  const sent = { id: 'm-8905', ephemeralDuration: 60 };

  test('`countdown-started` fait décompter jusqu’à `max D(u)`, y compris quand elle RECULE', () => {
    noteServedDeadline('m-8905', new Date(SENT_AT + 300_000).toISOString());
    noteServedDeadline('m-8905', new Date(SENT_AT + 900_000).toISOString());

    expect(resolveEphemeralDeadline({ message: sent, isMine: true, now: SENT_AT })).toEqual({
      state: 'scheduled',
      expiresAtMs: SENT_AT + 900_000,
    });
  });

  test('l’échéance servie par REST, plus tardive que l’événement retenu, l’emporte', () => {
    noteServedDeadline('m-8905', new Date(SENT_AT + 300_000).toISOString());
    const refetched = { ...sent, expiresAt: new Date(SENT_AT + 900_000) };

    expect(servedDeadlineFor(refetched, true)).toBe(SENT_AT + 900_000);
  });

  test('chez un DESTINATAIRE, la plus PROCHE reste la règle — un événement en retard ne rallonge rien', () => {
    noteServedDeadline('m-8905', new Date(SENT_AT + 300_000).toISOString());
    noteServedDeadline('m-8905', new Date(SENT_AT + 900_000).toISOString());

    expect(servedDeadlineFor(sent, false)).toBe(SENT_AT + 300_000);
  });

  test('rien de servi ⇒ aucune échéance', () => {
    expect(servedDeadlineFor(sent, true)).toBeNull();
  });
});
