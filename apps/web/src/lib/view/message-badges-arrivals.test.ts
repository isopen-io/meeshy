import { describe, expect, test } from 'bun:test';

import type { Message } from '@/lib/api/types';

import { systemRowOf, systemRowText } from './message-badges';

/* Meeshy Global regroupe ses arrivées en UNE ligne par fenêtre de dix minutes
   (#7740). Le gateway pose `metadata.kind = 'members-arrived'` ; la rangée la
   dit dans la langue du LECTEUR, jamais le repli français de `content`. */

const message = (partial: Partial<Message> = {}): Message =>
  ({
    id: 'm1',
    conversationId: 'c-a',
    senderId: 'u-bruno',
    content: 'Bonjour',
    originalLanguage: 'fr',
    messageType: 'text',
    messageSource: 'user',
    isEdited: false,
    isViewOnce: false,
    viewOnceCount: 0,
    isBlurred: false,
    deliveredCount: 0,
    readCount: 0,
    reactionCount: 0,
    isEncrypted: false,
    translations: [],
    createdAt: new Date('2026-09-10T09:00:00.000Z'),
    ...partial,
  }) as Message;

const arrivalsLine = (names: readonly string[], count = names.length): Message =>
  message({
    messageType: 'system',
    messageSource: 'system',
    content: 'repli français',
    metadata: {
      kind: 'members-arrived',
      arrivals: names.map((displayName, index) => ({ participantId: `p-${index}`, displayName })),
      count,
      windowStartedAt: '2026-09-24T10:00:00.000Z',
    },
  });

describe('rangée des arrivées regroupées de Meeshy Global (#7740)', () => {
  test('systemRowOf reconnaît la ligne d’arrivées', () => {
    const row = systemRowOf(arrivalsLine(['Aïcha', 'Tom'], 14));
    expect(row?.kind).toBe('arrivals');
  });

  test('se dit dans la langue du lecteur — « Aïcha, Tom et 12 autres »', () => {
    const row = systemRowOf(arrivalsLine(['Aïcha', 'Tom'], 14));
    if (row === null) throw new Error('rangée attendue');
    expect(systemRowText(row, 'fr')).toBe('Aïcha, Tom et 12 autres viennent d’arriver — dis-leur salut');
    expect(systemRowText(row, 'en')).toBe('Aïcha, Tom and 12 others just arrived — say hi');
  });

  test('jamais le repli français stocké dans `content`', () => {
    const row = systemRowOf(arrivalsLine(['Aïcha']));
    if (row === null) throw new Error('rangée attendue');
    expect(systemRowText(row, 'en')).toBe('Aïcha just arrived — say hi');
  });

  test('une ligne d’arrivées malformée retombe sur le texte plat, jamais sur une rangée vide', () => {
    const row = systemRowOf(
      message({ messageType: 'system', messageSource: 'system', content: 'Aïcha vient d’arriver', metadata: { kind: 'members-arrived', arrivals: [] } }),
    );
    expect(row).toEqual({ kind: 'notice', text: 'Aïcha vient d’arriver' });
  });
});
