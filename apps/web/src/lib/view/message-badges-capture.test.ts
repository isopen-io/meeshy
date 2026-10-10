import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, test } from 'bun:test';

import type { Message } from '@/lib/api/types';

import { composeMessageLabel } from './message-a11y-label';
import { systemRowOf, systemRowText } from './message-badges';

/* L'AVIS DE CAPTURE (#9617) — la passerelle pose `metadata.kind =
   'content-capture'` et un repli FRANÇAIS en UTC dans `content`. La rangée se
   compose chez le lecteur, dans SA langue et SON fuseau : l'heure dite est
   l'heure d'ENVOI de l'éphémère capturé. */

const message = (partial: Partial<Message> = {}): Message =>
  ({
    id: 'm-notice',
    conversationId: 'c-a',
    senderId: 'u-alice',
    content: 'Alice a capturé l’éphémère du 07/10/2026 à 12:05 (UTC)',
    originalLanguage: 'fr',
    messageType: 'system',
    messageSource: 'system',
    isEdited: false,
    isViewOnce: false,
    viewOnceCount: 0,
    isBlurred: false,
    deliveredCount: 0,
    readCount: 0,
    reactionCount: 0,
    isEncrypted: false,
    translations: [],
    createdAt: new Date('2026-10-07T12:06:00.000Z'),
    ...partial,
  }) as Message;

const captureMetadata = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  kind: 'content-capture',
  actor: { participantId: 'p-alice', displayName: 'Alice', isAnonymous: false },
  capturedMessageId: '0123456789abcdef01234567',
  nature: 'timed-flame',
  outcome: 'announced',
  captureKind: 'screenshot',
  sentAt: '2026-10-07T12:05:00.000Z',
  ...overrides,
});

const rowOf = (metadata: Record<string, unknown>) => {
  const row = systemRowOf(message({ metadata }));
  if (row === null) throw new Error('rangée attendue');
  return row;
};

describe('la rangée d’un avis de capture (#9617)', () => {
  test('systemRowOf reconnaît l’avis — jamais une rangée de texte plat', () => {
    expect(rowOf(captureMetadata()).kind).toBe('capture');
  });

  test('l’éphémère capturé se dit dans la langue ET le fuseau du lecteur', () => {
    const row = rowOf(captureMetadata());
    expect(systemRowText(row, 'fr', 'Europe/Paris')).toBe('Alice a capturé l’éphémère du 07/10/2026 à 14:05');
    expect(systemRowText(row, 'en', 'America/New_York')).toContain('10/07/2026');
    expect(systemRowText(row, 'en', 'America/New_York')).toContain('08:05');
  });

  test('deux lecteurs de fuseaux différents ne lisent pas le même jour', () => {
    const row = rowOf(captureMetadata({ sentAt: '2026-10-07T23:30:00.000Z' }));
    expect(systemRowText(row, 'fr', 'Europe/Paris')).toContain('08/10/2026 à 01:30');
    expect(systemRowText(row, 'fr', 'America/Los_Angeles')).toContain('07/10/2026 à 16:30');
  });

  test('la tentative sur une vue unique se dit sans heure', () => {
    const row = rowOf(captureMetadata({ nature: 'view-once', outcome: 'blocked' }));
    expect(systemRowText(row, 'fr', 'Europe/Paris')).toBe('Alice a tenté de capturer un message à vue unique — impossible');
  });

  test('un enregistrement d’écran a sa propre phrase', () => {
    const row = rowOf(captureMetadata({ captureKind: 'recording' }));
    expect(systemRowText(row, 'fr', 'UTC')).toBe('Alice a enregistré l’écran pendant l’éphémère du 07/10/2026 à 12:05');
  });

  test('un inscrit est nommé avec son pseudo, un invité est dit invité', () => {
    const member = rowOf(captureMetadata({ actor: { participantId: 'p-alice', displayName: 'Alice', isAnonymous: false, username: 'alice' } }));
    expect(systemRowText(member, 'fr', 'UTC')).toBe('Alice (@alice) a capturé l’éphémère du 07/10/2026 à 12:05');
    const guest = rowOf(captureMetadata({ actor: { participantId: 'p-anon', displayName: 'Alice', isAnonymous: true } }));
    expect(systemRowText(guest, 'en', 'UTC')).toMatch(/^Alice \(guest\) took a screenshot/);
  });

  test('une métadonnée illisible retombe sur le repli stocké, jamais sur une rangée vide', () => {
    const row = rowOf(captureMetadata({ nature: 'view-once', outcome: 'announced' }));
    expect(row.kind).toBe('notice');
    expect(systemRowText(row, 'en', 'UTC')).toBe('Alice a capturé l’éphémère du 07/10/2026 à 12:05 (UTC)');
  });

  test('le fuseau par défaut est celui du lecteur (Intl), pas UTC', () => {
    const row = rowOf(captureMetadata());
    const readerZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    expect(systemRowText(row, 'fr')).toBe(systemRowText(row, 'fr', readerZone));
  });

  test('le libellé accessible de la rangée prononce la même phrase', () => {
    const label = composeMessageLabel({
      message: message({ metadata: captureMetadata() }),
      isMine: false,
      servedText: '',
      delivery: null,
      protection: 'standard',
      language: 'fr',
    });
    expect(label).toContain('Alice a capturé l’éphémère du 07/10/2026');
  });
});

describe('le rendu de l’avis de capture ne tire pas zod', () => {
  test('aucun module relatif importé par capture-notice n’importe zod', () => {
    const shared = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', '..', 'packages', 'shared', 'utils');
    const source = readFileSync(join(shared, 'capture-notice.ts'), 'utf8');
    const relatives = [...source.matchAll(/from '(\.[^']+)\.js'/g)].map((match) => join(shared, `${match[1]}.ts`));
    expect(relatives.length).toBeGreaterThan(0);
    relatives.forEach((file) => expect(readFileSync(file, 'utf8')).not.toMatch(/from 'zod/));
  });
});
