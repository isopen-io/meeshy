/**
 * WF-110/111/112 — `FocalThread`, l'arbre vivant du fil (ordonnancement +
 * densité + perspective/pilule + capsule date).
 */
import React, { createRef } from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import type { Message, User } from '@meeshy/shared/types';

jest.mock('@/hooks/use-i18n', () => ({
  useI18n: () => ({
    t: (key: string) => (key === 'focal.row.you' ? 'Toi' : key),
    locale: 'fr',
    isLoading: false,
  }),
}));

import { FocalThread } from '../FocalThread';

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
    sender: { id: 'other', conversationId: 'c1', type: 'user', displayName: 'Alice' } as unknown,
    ...overrides,
  } as Message;
}

describe('FocalThread — topologie (ordre ascendant, ancien en haut)', () => {
  it('inverse `messages` (DESC backend) pour un rendu "ancien en haut"', () => {
    // Backend: [récent, ancien] = [m2, m1]
    const m1 = makeMessage('m1', { createdAt: new Date('2026-08-12T09:00:00Z'), timestamp: new Date('2026-08-12T09:00:00Z') });
    const m2 = makeMessage('m2', { createdAt: new Date('2026-08-12T10:00:00Z'), timestamp: new Date('2026-08-12T10:00:00Z') });
    const containerRef = createRef<HTMLDivElement>();

    render(
      <FocalThread messages={[m2, m1]} currentUser={currentUser} scrollContainerRef={containerRef} />
    );

    const rows = screen.getAllByTestId('focal-row');
    expect(rows.map((r) => r.getAttribute('data-message-id'))).toEqual(['m1', 'm2']);
  });
});

describe('FocalThread — capsule date sticky (WF-112)', () => {
  it('insère une capsule au premier message et à chaque frontière de jour', () => {
    const m1 = makeMessage('m1', { createdAt: new Date('2026-08-11T10:00:00'), timestamp: new Date('2026-08-11T10:00:00') });
    const m2 = makeMessage('m2', { createdAt: new Date('2026-08-11T12:00:00'), timestamp: new Date('2026-08-11T12:00:00') });
    const m3 = makeMessage('m3', { createdAt: new Date('2026-08-12T09:00:00'), timestamp: new Date('2026-08-12T09:00:00') });
    const containerRef = createRef<HTMLDivElement>();

    render(
      <FocalThread messages={[m3, m2, m1]} currentUser={currentUser} scrollContainerRef={containerRef} />
    );

    expect(screen.getAllByTestId('focal-date-capsule')).toHaveLength(2);
  });
});

describe('FocalThread — drapeau densité', () => {
  it('propage la densité aux rangées', () => {
    const containerRef = createRef<HTMLDivElement>();
    render(
      <FocalThread
        messages={[makeMessage('m1')]}
        currentUser={currentUser}
        scrollContainerRef={containerRef}
        density="script"
      />
    );
    expect(screen.getByTestId('focal-row')).toHaveAttribute('data-density', 'script');
  });
});

describe('FocalThread — perspective + pilule jour·heure (WF-111)', () => {
  it('monte la pilule jour·heure (FocalTimePill) au-dessus des rangées', () => {
    const containerRef = createRef<HTMLDivElement>();
    render(
      <FocalThread messages={[makeMessage('m1')]} currentUser={currentUser} scrollContainerRef={containerRef} />
    );
    expect(screen.getByTestId('focal-time-pill')).toBeInTheDocument();
  });

  it('chaque rangée expose un wrapper de perspective (registerRow branché — densité focal)', () => {
    const containerRef = createRef<HTMLDivElement>();
    render(
      <FocalThread messages={[makeMessage('m1'), makeMessage('m2')]} currentUser={currentUser} scrollContainerRef={containerRef} />
    );
    expect(screen.getAllByTestId('focal-row-perspective-wrapper')).toHaveLength(2);
  });
});

describe('FocalThread — garde aucun useQuery (extension du périmètre WL-10)', () => {
  it('le fichier ne référence aucun hook react-query', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const fs = require('fs');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const path = require('path');
    const content = fs.readFileSync(path.join(__dirname, '../FocalThread.tsx'), 'utf8');
    expect(content).not.toMatch(/\buse(?:Infinite)?Quer(?:y|ies)\s*\(|\buseMutation\s*\(/);
  });
});
