import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  agentEventSchema,
  agentMessageSchema,
  type AgentEventInput,
  type AgentReaction,
  type AgentResponse,
} from '../agent/zmq-contract';

const repoRoot = resolve(__dirname, '../../..');

const newMessageAsGatewayComposesIt = (overrides: Partial<AgentEventInput> = {}): AgentEventInput => ({
  type: 'agent:new-message',
  conversationId: '507f1f77bcf86cd799439011',
  messageId: '507f1f77bcf86cd799439012',
  senderId: '507f1f77bcf86cd799439013',
  senderDisplayName: undefined,
  senderUsername: 'atabeth',
  content: 'Bonjour tout le monde',
  originalLanguage: 'fr',
  replyToId: undefined,
  mentionedUserIds: [],
  timestamp: 1_764_288_000_000,
  ...overrides,
} as AgentEventInput);

const responseAsAgentPublishesIt = (overrides: Partial<AgentResponse> = {}): AgentResponse => ({
  type: 'agent:response',
  conversationId: '507f1f77bcf86cd799439011',
  asUserId: '507f1f77bcf86cd799439014',
  content: 'Salut !',
  originalLanguage: 'fr',
  messageSource: 'agent',
  metadata: { agentType: 'animator', roleConfidence: 0.8 },
  ...overrides,
});

const reactionAsAgentPublishesIt = (): AgentReaction => ({
  type: 'agent:reaction',
  conversationId: '507f1f77bcf86cd799439011',
  asUserId: '507f1f77bcf86cd799439014',
  targetMessageId: '507f1f77bcf86cd799439012',
  emoji: '👍',
});

const overTheWire = (value: unknown): unknown => JSON.parse(JSON.stringify(value));

describe('contrat ZMQ passerelle → agent', () => {
  it('accepte le message tel que la passerelle le compose, une fois passé par le fil', () => {
    const result = agentEventSchema.safeParse(overTheWire(newMessageAsGatewayComposesIt()));
    expect(result.success).toBe(true);
  });

  it('rend mentionedUserIds vide quand la passerelle ne le porte pas', () => {
    const { mentionedUserIds: _omitted, ...event } = newMessageAsGatewayComposesIt() as Record<string, unknown>;
    const parsed = agentEventSchema.parse(overTheWire(event));
    expect(parsed.type === 'agent:new-message' && parsed.mentionedUserIds).toEqual([]);
  });

  it('accepte la mise à jour de configuration et le changement de présence', () => {
    const events = [
      { type: 'agent:config-updated', conversationId: '507f1f77bcf86cd799439011', config: { enabled: true } },
      { type: 'agent:user-status-changed', userId: '507f1f77bcf86cd799439013', isOnline: false, lastActiveAt: '2026-11-28T00:00:00Z' },
    ];
    expect(events.map((event) => agentEventSchema.safeParse(event).success)).toEqual([true, true]);
  });

  it('refuse un type inconnu et un message sans horodatage', () => {
    const { timestamp: _omitted, ...withoutTimestamp } = newMessageAsGatewayComposesIt() as Record<string, unknown>;
    const refused = [{ type: 'agent:unknown' }, withoutTimestamp];
    expect(refused.map((event) => agentEventSchema.safeParse(event).success)).toEqual([false, false]);
  });
});

describe('contrat ZMQ agent → passerelle', () => {
  it('accepte la réponse et la réaction telles que l’agent les publie', () => {
    const published = [
      responseAsAgentPublishesIt(),
      responseAsAgentPublishesIt({
        replyToId: '507f1f77bcf86cd799439012',
        mentionedUsernames: ['atabeth'],
        illustration: { sourceUrl: 'https://example.org/article' },
        metadata: { agentType: 'impersonator', roleConfidence: 1, archetypeId: 'curious' },
      }),
      reactionAsAgentPublishesIt(),
    ];
    expect(published.map((message) => agentMessageSchema.safeParse(overTheWire(message)).success)).toEqual([true, true, true]);
  });

  it('refuse une réponse vide, une confiance hors bornes et une illustration qui n’est pas une URL', () => {
    const refused = [
      responseAsAgentPublishesIt({ content: '' }),
      responseAsAgentPublishesIt({ metadata: { agentType: 'animator', roleConfidence: 1.2 } }),
      responseAsAgentPublishesIt({ illustration: { sourceUrl: 'pas-une-url' } }),
    ];
    expect(refused.map((message) => agentMessageSchema.safeParse(overTheWire(message)).success)).toEqual([false, false, false]);
  });
});

describe('une seule source', () => {
  const consumers = [
    'services/gateway/src/services/zmq-agent/ZmqAgentClient.ts',
    'services/agent/src/zmq/types.ts',
  ];
  const zmqDirectories = ['services/gateway/src/services/zmq-agent', 'services/agent/src/zmq'];
  const redeclaration = /z\.literal\(\s*['"`]agent:|type:\s*['"`]agent:(response|reaction)['"`]\s*;/;

  const sourcesUnder = (directory: string): readonly string[] =>
    readdirSync(resolve(repoRoot, directory), { withFileTypes: true }).flatMap((entry) => {
      const path = `${directory}/${entry.name}`;
      if (entry.isDirectory()) return entry.name === '__tests__' ? [] : sourcesUnder(path);
      return /\.ts$/.test(entry.name) && !/\.test\.ts$/.test(entry.name) ? [path] : [];
    });

  it.each(consumers)('%s consomme le contrat partagé', (path) => {
    expect(readFileSync(resolve(repoRoot, path), 'utf8')).toContain('@meeshy/shared/agent/zmq-contract');
  });

  it('aucun fichier ZMQ de la passerelle ni de l’agent ne redéclare un message du contrat', () => {
    const offenders = zmqDirectories
      .flatMap(sourcesUnder)
      .filter((path) => redeclaration.test(readFileSync(resolve(repoRoot, path), 'utf8')));
    expect(offenders).toEqual([]);
  });

  it('la passerelle type ce qu’elle envoie à l’agent par le contrat', () => {
    const sink = readFileSync(resolve(repoRoot, 'services/gateway/src/socketio/handlers/agentMessageNotification.ts'), 'utf8');
    expect(sink).toMatch(/sendEvent\(event: AgentEventInput\)/);
  });
});
