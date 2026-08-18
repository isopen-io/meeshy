/**
 * V4ter/axe — audit axe-core de la peau Focal (`FocalThread`).
 *
 * Fixtures RE-PRISES de `FocalThread.test.tsx` (messages, `currentUser`,
 * mock `use-i18n`) — étendues pour couvrir les quatre variantes du contrat
 * WF-110..112 dans le MÊME fil : texte simple, citation (`replyTo`), média
 * (pièce jointe image) et premier-du-groupe (en-tête d'identité affiché
 * seulement en tête de groupe, densité `focal`).
 */
import React, { createRef } from 'react';
import { render } from '@testing-library/react';
import '@testing-library/jest-dom';
import { axe, toHaveNoViolations } from 'jest-axe';
import type { Message, User } from '@meeshy/shared/types';

expect.extend(toHaveNoViolations);

jest.mock('@/hooks/use-i18n', () => ({
  useI18n: () => ({
    t: (key: string) => (key === 'focal.row.you' ? 'Toi' : key),
    locale: 'fr',
    isLoading: false,
  }),
}));

import { FocalThread } from '@/components/conversations/focal/FocalThread';

const currentUser = {
  id: 'me',
  username: 'me',
  displayName: 'Moi',
  systemLanguage: 'fr',
} as unknown as User;

function makeMessage(id: string, overrides: Partial<Message> = {}): Message {
  return {
    id,
    conversationId: 'c1',
    senderId: 'other',
    content: `Message ${id}`,
    originalLanguage: 'en',
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
    createdAt: new Date('2026-08-12T10:00:00Z'),
    timestamp: new Date('2026-08-12T10:00:00Z'),
    translations: [],
    sender: { id: 'other', conversationId: 'c1', type: 'user', displayName: 'Alice' } as unknown as Message['sender'],
    ...overrides,
  } as Message;
}

/**
 * Géométrie réaliste — backend DESC (récent…ancien), `FocalThread` inverse :
 *   m1 (Alice, texte, PREMIER-du-groupe) → m2 (Alice, MÊME groupe, sans
 *   en-tête) → m3 (moi, citation de m1) → m4 (Alice, média).
 */
const m1 = makeMessage('m1', {
  createdAt: new Date('2026-08-12T09:00:00Z'),
  timestamp: new Date('2026-08-12T09:00:00Z'),
  content: 'On se retrouve où ?',
  sender: { id: 'other', conversationId: 'c1', type: 'user', displayName: 'Alice' } as unknown as Message['sender'],
});

const m2 = makeMessage('m2', {
  createdAt: new Date('2026-08-12T09:01:00Z'),
  timestamp: new Date('2026-08-12T09:01:00Z'),
  content: 'Devant la gare, comme la dernière fois',
  sender: { id: 'other', conversationId: 'c1', type: 'user', displayName: 'Alice' } as unknown as Message['sender'],
});

const m3 = makeMessage('m3', {
  senderId: 'me',
  createdAt: new Date('2026-08-12T09:02:00Z'),
  timestamp: new Date('2026-08-12T09:02:00Z'),
  content: "Parfait, j'y serai",
  sender: { id: 'me', conversationId: 'c1', type: 'user', displayName: 'Moi' } as unknown as Message['sender'],
  replyTo: m1,
} as Partial<Message>);

const m4 = makeMessage('m4', {
  createdAt: new Date('2026-08-12T09:03:00Z'),
  timestamp: new Date('2026-08-12T09:03:00Z'),
  content: '',
  sender: { id: 'other', conversationId: 'c1', type: 'user', displayName: 'Alice' } as unknown as Message['sender'],
  attachments: [
    {
      id: 'att-1',
      mimeType: 'image/png',
      thumbnailUrl: 'https://example.test/thumb.png',
      fileUrl: 'https://example.test/full.png',
      originalName: 'photo-gare.png',
      width: 800,
      height: 600,
    } as any,
  ],
});

describe('Audit axe — Focal (fil, texte/citation/média/premier-du-groupe)', () => {
  it('aucune violation sur une géométrie réaliste, densité focal', async () => {
    const containerRef = createRef<HTMLDivElement>();
    const { container } = render(
      <FocalThread
        messages={[m4, m3, m2, m1]}
        currentUser={currentUser}
        scrollContainerRef={containerRef}
      />
    );

    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it('aucune violation en densité script (en-tête toujours visible, zéro perspective)', async () => {
    const containerRef = createRef<HTMLDivElement>();
    const { container } = render(
      <FocalThread
        messages={[m4, m3, m2, m1]}
        currentUser={currentUser}
        scrollContainerRef={containerRef}
        density="script"
      />
    );

    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
