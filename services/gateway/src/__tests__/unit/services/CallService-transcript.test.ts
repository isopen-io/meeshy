/**
 * CallService.getCallTranscript — replay du journal de transcription persisté
 * (décision produit 2026-08-13 : le transcript survit à la suppression de
 * l'app et de ses caches locaux).
 *
 * Donnée SENSIBLE : l'accès est restreint aux participants EFFECTIFS de
 * l'appel — plus strict que getCallSession, qui autorise tout membre de la
 * conversation. Ces tests verrouillent l'autorisation et le mapping
 * (speakerId/displayName résolus depuis le roster, ordre par horloge de
 * capture, traductions jointes).
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals';

jest.mock('../../../services/TURNCredentialService', () => ({
  TURNCredentialService: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('../../../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

import { CallService } from '../../../services/CallService';
import type { PrismaClient } from '@meeshy/shared/prisma/client';

const CALL_ID = '507f1f77bcf86cd799439011';
const CONVERSATION_ID = '507f1f77bcf86cd799439099';
const PARTICIPANT_USER = 'user-in-call';
const OUTSIDER_USER = 'user-conversation-only';

function makeCall() {
  return {
    id: CALL_ID,
    conversationId: CONVERSATION_ID,
    startedAt: new Date(1_765_650_000_000),
    participants: [
      {
        participantId: 'participant-1',
        participant: {
          userId: PARTICIPANT_USER,
          user: { id: PARTICIPANT_USER, username: 'alice', displayName: 'Alice Doe' },
        },
        leftAt: null,
      },
    ],
  };
}

function makeTranscriptionRows() {
  return [
    {
      id: 'row-2',
      participantId: 'participant-1',
      segmentId: 'seg-late',
      text: 'Deuxième énoncé',
      language: 'fr',
      confidence: 0.9,
      timestamp: new Date(1_765_650_010_000),
      translations: [],
    },
    {
      id: 'row-1',
      participantId: 'participant-1',
      segmentId: null,
      text: 'Premier énoncé',
      language: 'fr',
      confidence: 0.95,
      timestamp: new Date(1_765_650_001_000),
      translations: [
        { targetLanguage: 'en', translatedText: 'First utterance' },
      ],
    },
  ];
}

function makePrisma(overrides: {
  call?: unknown;
  rows?: unknown[];
} = {}) {
  return {
    callSession: {
      findUnique: jest.fn<any>().mockResolvedValue(overrides.call === undefined ? makeCall() : overrides.call),
    },
    transcription: {
      findMany: jest.fn<any>().mockResolvedValue(overrides.rows ?? makeTranscriptionRows()),
    },
  } as unknown as PrismaClient;
}

describe('CallService.getCallTranscript', () => {
  let prisma: PrismaClient;
  let service: CallService;

  beforeEach(() => {
    prisma = makePrisma();
    service = new CallService(prisma);
  });

  it('returns the persisted segments with roster-resolved speaker identity and translations', async () => {
    const transcript = await service.getCallTranscript(CALL_ID, PARTICIPANT_USER);

    expect(transcript.callId).toBe(CALL_ID);
    expect(transcript.conversationId).toBe(CONVERSATION_ID);
    expect(transcript.callStartedAt).toEqual(new Date(1_765_650_000_000));
    expect(transcript.segments).toHaveLength(2);

    const [first] = transcript.segments;
    expect(first.speakerId).toBe(PARTICIPANT_USER);
    expect(first.speakerDisplayName).toBe('Alice Doe');
    expect(first.capturedAtMs).toBeGreaterThan(0);
    expect(first.translations).toBeDefined();
  });

  it('queries the rows ordered by capture timestamp ascending', async () => {
    await service.getCallTranscript(CALL_ID, PARTICIPANT_USER);
    expect((prisma as any).transcription.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { callSessionId: CALL_ID },
        orderBy: { timestamp: 'asc' },
      })
    );
  });

  it('uses the wire segmentId as journal id when present, the row id otherwise', async () => {
    const transcript = await service.getCallTranscript(CALL_ID, PARTICIPANT_USER);
    const ids = transcript.segments.map((s) => s.id);
    expect(ids).toContain('seg-late');
    expect(ids).toContain('row-1');
  });

  it('rejects a user who did not take part in the call, even if they could access the call session', async () => {
    await expect(service.getCallTranscript(CALL_ID, OUTSIDER_USER)).rejects.toThrow(/NOT_A_PARTICIPANT/);
    expect((prisma as any).transcription.findMany).not.toHaveBeenCalled();
  });

  it('throws CALL_NOT_FOUND for an unknown call', async () => {
    prisma = makePrisma({ call: null });
    service = new CallService(prisma);
    await expect(service.getCallTranscript(CALL_ID, PARTICIPANT_USER)).rejects.toThrow(/CALL_NOT_FOUND/);
  });
});
