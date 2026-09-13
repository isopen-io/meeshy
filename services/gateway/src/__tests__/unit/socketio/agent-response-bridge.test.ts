/**
 * Le pont entre une réponse de l'agent (ZMQ) et le pipeline de messagerie
 * (#6192) : résolution des mentions, participant émetteur, et l'image de
 * l'article joint au message qui lance un sujet. Extrait de
 * MeeshySocketIOManager pour être testable et pour ne pas ajouter à un
 * fichier hors budget.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';

jest.mock('../../../utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { handleAgentResponse, type AgentResponseBridgeDeps, type AgentResponsePayload } from '../../../socketio/agent-response-bridge';

const CONV = '507f1f77bcf86cd799439011';
const USER = '507f1f77bcf86cd799439012';
const PARTICIPANT = '507f1f77bcf86cd799439013';
const ARTICLE = 'https://www.camerounweb.com/faits-divers/bonaberi';

function makeResponse(overrides: Partial<AgentResponsePayload> = {}): AgentResponsePayload {
  return {
    type: 'agent:response',
    conversationId: CONV,
    asUserId: USER,
    content: 'Vous avez vu ça à Bonabéri ? 😳',
    originalLanguage: 'fr',
    messageSource: 'agent',
    metadata: { agentType: 'orchestrator', roleConfidence: 1 },
    ...overrides,
  };
}

function makeDeps(overrides: Partial<AgentResponseBridgeDeps> = {}) {
  const saved = { id: 'msg-1', createdAt: new Date('2026-09-12T10:00:00Z'), content: 'x' };
  const deps = {
    prisma: {
      participant: {
        findFirst: jest.fn<any>().mockResolvedValue({ id: PARTICIPANT }),
        findMany: jest.fn<any>().mockResolvedValue([]),
      },
    },
    messagingService: { handleMessage: jest.fn<any>().mockResolvedValue({ success: true, data: saved }) },
    mentionService: {
      extractMentionsWithParticipants: jest.fn<any>().mockReturnValue([]),
      resolveUsernames: jest.fn<any>().mockResolvedValue(new Map()),
    },
    resolveUsernamesToIds: jest.fn<any>().mockResolvedValue([]),
    attachmentService: { uploadFile: jest.fn<any>().mockResolvedValue({ id: 'att-1' }) },
    resolveIllustration: jest.fn<any>().mockResolvedValue(null),
    broadcastNewMessage: jest.fn<any>().mockResolvedValue(undefined),
    ...overrides,
  };
  return deps as unknown as AgentResponseBridgeDeps & typeof deps;
}

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);

beforeEach(() => {
  jest.clearAllMocks();
});

describe('handleAgentResponse — texte', () => {
  it('posts the message through the messaging pipeline as the sender participant and broadcasts it', async () => {
    const deps = makeDeps();
    await handleAgentResponse(deps, makeResponse({ replyToId: 'msg-0' }));

    expect(deps.prisma.participant.findFirst).toHaveBeenCalledWith({
      where: { userId: USER, conversationId: CONV, isActive: true },
      select: { id: true },
    });
    expect(deps.messagingService.handleMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationId: CONV,
        content: 'Vous avez vu ça à Bonabéri ? 😳',
        originalLanguage: 'fr',
        messageType: 'text',
        messageSource: 'agent',
        replyToId: 'msg-0',
        isAnonymous: false,
      }),
      PARTICIPANT,
    );
    expect(deps.messagingService.handleMessage.mock.calls[0][0]).not.toHaveProperty('attachmentIds');
    expect(deps.broadcastNewMessage).toHaveBeenCalledWith(expect.objectContaining({ id: 'msg-1' }), CONV);
  });

  it('does nothing when the borrowed user is not an active participant', async () => {
    const deps = makeDeps();
    deps.prisma.participant.findFirst.mockResolvedValue(null);
    await handleAgentResponse(deps, makeResponse());
    expect(deps.messagingService.handleMessage).not.toHaveBeenCalled();
    expect(deps.broadcastNewMessage).not.toHaveBeenCalled();
  });

  it('does not broadcast when the pipeline refuses the message', async () => {
    const deps = makeDeps();
    deps.messagingService.handleMessage.mockResolvedValue({ success: false, error: 'nope' });
    await handleAgentResponse(deps, makeResponse());
    expect(deps.broadcastNewMessage).not.toHaveBeenCalled();
  });

  it('resolves explicit mentioned usernames to user ids', async () => {
    const deps = makeDeps();
    deps.resolveUsernamesToIds.mockResolvedValue(['u-alice']);
    await handleAgentResponse(deps, makeResponse({ mentionedUsernames: ['alice'] }));
    expect(deps.resolveUsernamesToIds).toHaveBeenCalledWith(['alice']);
    expect(deps.messagingService.handleMessage.mock.calls[0][0]).toMatchObject({ mentionedUserIds: ['u-alice'] });
  });

  it('resolves @DisplayName mentions from the conversation participants when none were declared', async () => {
    const deps = makeDeps();
    deps.prisma.participant.findMany.mockResolvedValue([
      { userId: 'u-paul', displayName: 'Paul', user: { id: 'u-paul', username: 'paul', displayName: 'Paul' } },
      { userId: 'u-ghost', displayName: null, user: null },
    ]);
    deps.mentionService.extractMentionsWithParticipants.mockReturnValue(['paul']);
    deps.mentionService.resolveUsernames.mockResolvedValue(new Map([['paul', { id: 'u-paul' }]]));

    await handleAgentResponse(deps, makeResponse({ content: '@Paul tu as vu ?' }));

    expect(deps.mentionService.extractMentionsWithParticipants).toHaveBeenCalledWith('@Paul tu as vu ?', [
      { userId: 'u-paul', username: 'paul', displayName: 'Paul' },
    ]);
    expect(deps.messagingService.handleMessage.mock.calls[0][0]).toMatchObject({ mentionedUserIds: ['u-paul'] });
  });

  it('falls back on the username when a participant has no display name', async () => {
    const deps = makeDeps();
    deps.prisma.participant.findMany.mockResolvedValue([
      { userId: 'u-disp-null', displayName: null, user: { id: 'u-disp-null', username: 'usernameonly', displayName: null } },
    ]);
    deps.mentionService.extractMentionsWithParticipants.mockReturnValue([]);

    await handleAgentResponse(deps, makeResponse({ content: '@usernameonly ?' }));

    expect(deps.mentionService.extractMentionsWithParticipants).toHaveBeenCalledWith('@usernameonly ?', [
      { userId: 'u-disp-null', username: 'usernameonly', displayName: 'usernameonly' },
    ]);
  });

  it('posts the message without mentions when the participant lookup for @mentions fails', async () => {
    const deps = makeDeps();
    deps.prisma.participant.findMany.mockRejectedValue(new Error('DB exploded in mention'));

    await handleAgentResponse(deps, makeResponse({ content: '@Paul tu as vu ?' }));

    expect(deps.mentionService.extractMentionsWithParticipants).not.toHaveBeenCalled();
    expect(deps.messagingService.handleMessage).toHaveBeenCalledTimes(1);
    expect(deps.messagingService.handleMessage.mock.calls[0][0].mentionedUserIds).toBeUndefined();
  });

  it('never throws: a pipeline crash is logged, not propagated', async () => {
    const deps = makeDeps();
    deps.messagingService.handleMessage.mockRejectedValue(new Error('boom'));
    await expect(handleAgentResponse(deps, makeResponse())).resolves.toBeUndefined();
  });
});

describe('handleAgentResponse — illustration (#6192)', () => {
  it('uploads the resolved article image as the borrowed user and attaches it to the message', async () => {
    const deps = makeDeps();
    deps.resolveIllustration.mockResolvedValue({
      buffer: JPEG, mimeType: 'image/jpeg', filename: 'bonaberi.jpg', sourceUrl: ARTICLE, imageUrl: 'https://cdn.example/bonaberi.jpg',
    });

    await handleAgentResponse(deps, makeResponse({ illustration: { sourceUrl: ARTICLE } }));

    expect(deps.resolveIllustration).toHaveBeenCalledWith(ARTICLE);
    expect(deps.attachmentService.uploadFile).toHaveBeenCalledWith(
      { buffer: JPEG, filename: 'bonaberi.jpg', mimeType: 'image/jpeg', size: JPEG.length },
      USER,
    );
    expect(deps.messagingService.handleMessage.mock.calls[0][0]).toMatchObject({ attachmentIds: ['att-1'] });
    expect(deps.broadcastNewMessage).toHaveBeenCalledTimes(1);
  });

  it('posts a text-only message when no image can be resolved', async () => {
    const deps = makeDeps();
    await handleAgentResponse(deps, makeResponse({ illustration: { sourceUrl: ARTICLE } }));
    expect(deps.attachmentService.uploadFile).not.toHaveBeenCalled();
    expect(deps.messagingService.handleMessage.mock.calls[0][0]).not.toHaveProperty('attachmentIds');
    expect(deps.broadcastNewMessage).toHaveBeenCalledTimes(1);
  });

  it('posts a text-only message when the resolver throws', async () => {
    const deps = makeDeps();
    deps.resolveIllustration.mockRejectedValue(new Error('dns'));
    await handleAgentResponse(deps, makeResponse({ illustration: { sourceUrl: ARTICLE } }));
    expect(deps.messagingService.handleMessage).toHaveBeenCalledTimes(1);
    expect(deps.messagingService.handleMessage.mock.calls[0][0]).not.toHaveProperty('attachmentIds');
  });

  it('posts a text-only message when the upload is refused (signature, size)', async () => {
    const deps = makeDeps();
    deps.resolveIllustration.mockResolvedValue({ buffer: JPEG, mimeType: 'image/jpeg', filename: 'x.jpg', sourceUrl: ARTICLE, imageUrl: 'https://cdn.example/x.jpg' });
    deps.attachmentService.uploadFile.mockRejectedValue(new Error('Signature ne correspond pas'));
    await handleAgentResponse(deps, makeResponse({ illustration: { sourceUrl: ARTICLE } }));
    expect(deps.messagingService.handleMessage).toHaveBeenCalledTimes(1);
    expect(deps.messagingService.handleMessage.mock.calls[0][0]).not.toHaveProperty('attachmentIds');
  });

  it('does not touch the resolver when the response carries no illustration', async () => {
    const deps = makeDeps();
    await handleAgentResponse(deps, makeResponse());
    expect(deps.resolveIllustration).not.toHaveBeenCalled();
  });
});
