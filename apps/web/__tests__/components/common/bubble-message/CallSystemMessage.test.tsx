/**
 * CallSystemMessage — bulle d'appel riche (terminal) + état VIVANT (call-live).
 *
 * Invariants durcis ici :
 *  - le kind est lu AVANT l'outcome : un payload live (kind 'call-live') ne
 *    rend JAMAIS l'état terminal, même avec outcome 'completed' (placeholder) ;
 *  - « Rejoindre » n'apparaît que pour une conversation directe ET un
 *    utilisateur NON anonyme (le gate serveur refuse les anonymes — leur
 *    montrer le bouton serait un mensonge) ;
 *  - « annulé » est par-spectateur : initiateur → « Appel annulé »,
 *    destinataire → « Appel manqué » ;
 *  - un kind/outcome inconnu futur dégrade en rendu neutre (plus de TypeError
 *    possible sur TINT_BY_OUTCOME[outcome]).
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';

const mockStartCall = jest.fn();
jest.mock('@/hooks/conversations/use-video-call', () => ({
  useVideoCall: () => ({ startCall: mockStartCall }),
}));

jest.mock('@/hooks/useI18n', () => ({
  useI18n: () => ({
    t: (_key: string, fallback?: string) => fallback ?? _key,
  }),
}));

import { CallSystemMessage } from '@/components/common/bubble-message/CallSystemMessage';

const INITIATOR_ID = 'user-init';
const VIEWER_ID = 'user-viewer';

const terminalMetadata = (overrides: Record<string, unknown> = {}): any => ({
  kind: 'call',
  callId: 'call-1',
  initiatorId: INITIATOR_ID,
  callType: 'audio',
  outcome: 'completed',
  durationSeconds: 272,
  bytesTotal: null,
  bytesEstimated: false,
  networkQuality: null,
  ...overrides,
});

const liveMetadata = (overrides: Record<string, unknown> = {}): any => ({
  kind: 'call-live',
  callId: 'call-1',
  initiatorId: INITIATOR_ID,
  callType: 'audio',
  outcome: 'completed',
  durationSeconds: 0,
  bytesTotal: null,
  bytesEstimated: false,
  networkQuality: null,
  ...overrides,
});

const renderCall = (metadata: any, props: Record<string, unknown> = {}) =>
  render(
    <CallSystemMessage
      metadata={metadata}
      currentUserId={VIEWER_ID}
      conversationId="conv-1"
      conversationType="direct"
      {...props}
    />
  );

describe('CallSystemMessage — état vivant (kind call-live)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('rend « Appel audio en cours » avec indicateur pulsant', () => {
    renderCall(liveMetadata());
    expect(screen.getByText('Appel audio en cours')).toBeInTheDocument();
    expect(screen.getByTestId('live-call-indicator')).toBeInTheDocument();
  });

  it('rend « Appel vidéo en cours » pour un appel vidéo', () => {
    renderCall(liveMetadata({ callType: 'video' }));
    expect(screen.getByText('Appel vidéo en cours')).toBeInTheDocument();
  });

  it('lit le kind AVANT l\'outcome : le placeholder outcome=completed ne rend jamais le terminal', () => {
    renderCall(liveMetadata({ outcome: 'completed', durationSeconds: 0 }));
    expect(screen.queryByText('Appel audio')).not.toBeInTheDocument();
    expect(screen.getByText('Appel audio en cours')).toBeInTheDocument();
  });

  it('offre « Rejoindre » en conversation directe pour un utilisateur inscrit', () => {
    renderCall(liveMetadata());
    expect(screen.getByRole('button', { name: 'Rejoindre' })).toBeInTheDocument();
  });

  it('masque « Rejoindre » pour un utilisateur anonyme (le gate serveur le refuserait)', () => {
    renderCall(liveMetadata(), { isAnonymous: true });
    expect(screen.queryByRole('button', { name: 'Rejoindre' })).not.toBeInTheDocument();
  });

  it('masque « Rejoindre » hors conversation directe (état affiché sans action)', () => {
    renderCall(liveMetadata(), { conversationType: 'group' });
    expect(screen.queryByRole('button', { name: 'Rejoindre' })).not.toBeInTheDocument();
  });

  it('ne montre jamais le bouton Rappeler sur un appel en cours', () => {
    renderCall(liveMetadata());
    expect(screen.queryByRole('button', { name: 'Rappeler' })).not.toBeInTheDocument();
  });
});

describe('CallSystemMessage — annulé par-spectateur (missed + endedByInitiator)', () => {
  beforeEach(() => jest.clearAllMocks());

  const cancelled = () =>
    terminalMetadata({ outcome: 'missed', durationSeconds: 0, endedByInitiator: true });

  it('l\'initiateur voit « Appel annulé »', () => {
    renderCall(cancelled(), { currentUserId: INITIATOR_ID });
    expect(screen.getByText('Appel annulé')).toBeInTheDocument();
  });

  it('le destinataire garde « Appel audio manqué »', () => {
    renderCall(cancelled(), { currentUserId: VIEWER_ID });
    expect(screen.getByText('Appel audio manqué')).toBeInTheDocument();
    expect(screen.queryByText('Appel annulé')).not.toBeInTheDocument();
  });

  it('sans endedByInitiator, l\'initiateur voit aussi « manqué » (comportement actuel)', () => {
    renderCall(terminalMetadata({ outcome: 'missed', durationSeconds: 0 }), {
      currentUserId: INITIATOR_ID,
    });
    expect(screen.getByText('Appel audio manqué')).toBeInTheDocument();
  });
});

describe('CallSystemMessage — durcissement (kind/outcome inconnus)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('un outcome inconnu ne crashe plus et dégrade en rendu neutre', () => {
    expect(() => renderCall(terminalMetadata({ outcome: 'teleported' }))).not.toThrow();
    expect(screen.getByText('Appel')).toBeInTheDocument();
  });

  it('le rendu terminal existant est inchangé (completed + durée)', () => {
    renderCall(terminalMetadata());
    expect(screen.getByText('Appel audio')).toBeInTheDocument();
    expect(screen.getByText('04:32')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Rappeler' })).toBeInTheDocument();
  });
});
