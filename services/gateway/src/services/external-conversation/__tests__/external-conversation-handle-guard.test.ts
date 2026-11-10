/**
 * #17117 — GARDE DE SOURCE : le numéro en clair de l'ami d'une conversation
 * externe ne sort de son module par aucun chemin écrit.
 *
 * - Seul `services/external-conversation/` touche au délégué Prisma
 *   `externalConversationPeer` ou à la relation `externalPeer` : aucune liste,
 *   aucun détail, aucune route d'administration ni aucun export ne l'emporte par
 *   un `include` ou un `select` posé ailleurs.
 * - Ni ce module ni sa route ne journalisent : une erreur de base recopie ses
 *   arguments, donc le numéro. Le seul appel au journal de la route ne porte que
 *   le nom et le code de l'erreur (`errorTrace`) : `logError` recopierait sinon le message d'une erreur Prisma.
 *
 * @jest-environment node
 */
import { describe, it, expect } from '@jest/globals';
import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';

const SRC = join(__dirname, '../../..');

const OWNER = 'services/external-conversation/';
const ROUTE = 'routes/conversations/external.ts';

/**
 * Le délégué, la relation ET le nom de la collection, sans casse : un accès écrit
 * `prisma['externalConversationPeer']`, `$runCommandRaw({ find: 'ExternalConversationPeer' })`
 * ou `db.collection('ExternalConversationPeer')` tombe sous la garde comme
 * `prisma.externalConversationPeer`. Une chaîne ASSEMBLÉE à l'exécution lui
 * échappe : c'est la limite d'une garde de texte, et la revue la couvre.
 */
const PEER_ACCESS = /[eE]xternal_?[cC]onversation_?[pP]eer|\bexternalPeer\b/;

/** Les fichiers hors du module qui NOMMENT la collection sans lire une adresse, et pourquoi. */
const NAMES_WITHOUT_READING: Record<string, string> = {
  'migrations/named/external-conversation-peer-indexes.ts':
    'pose les index (unicités, TTL) de la collection ; ne lit ni n’écrit aucun document',
  'migrations/named/registry.ts':
    'inscrit la migration des index par son nom (`externalConversationPeerIndexes`) ; ne touche à aucun document',
};
const LOG_CALL = /\b(console|logger|enhancedLogger|log)\s*\.\s*(log|info|warn|error|debug|trace|fatal)\s*\(|\blog(Error|Warn|Info|Debug)\s*\(/;
const LOG_LINE = /(\b(console|logger|enhancedLogger|log)\s*\.\s*(log|info|warn|error|debug|trace|fatal)\s*\(|\blog(Error|Warn|Info|Debug)\s*\().*$/gm;

function productionFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === '__tests__' ? [] : productionFiles(path);
    return name.endsWith('.ts') && !name.endsWith('.test.ts') && !name.endsWith('.d.ts') ? [path] : [];
  });
}

const sources = productionFiles(SRC).map((path) => ({ file: relative(SRC, path), text: readFileSync(path, 'utf8') }));

describe('le numéro de l’ami ne sort pas de son module', () => {
  it('le balayage voit le module propriétaire (une garde qui ne voit rien reste verte)', () => {
    expect(sources.filter(({ text }) => PEER_ACCESS.test(text)).map(({ file }) => file)).toContain(
      `${OWNER}open-external-conversation.ts`,
    );
  });

  it('seul services/external-conversation/ touche à l’adresse du pair', () => {
    const outsiders = sources
      .filter(({ file, text }) => !file.startsWith(OWNER) && !(file in NAMES_WITHOUT_READING) && PEER_ACCESS.test(text))
      .map(({ file }) => file);

    expect(outsiders).toEqual([]);
  });

  it.each([
    "prisma['externalConversationPeer'].findMany()",
    "prisma.$runCommandRaw({ find: 'ExternalConversationPeer' })",
    "db.collection('ExternalConversationPeer').find()",
    'include: { externalPeer: true }',
  ])('le motif d’accès attrape %s', (source) => {
    expect(PEER_ACCESS.test(source)).toBe(true);
  });

  it('les exemptions nomment des fichiers qui existent et nomment vraiment la collection', () => {
    Object.keys(NAMES_WITHOUT_READING).forEach((file) => {
      expect(sources.find((source) => source.file === file)?.text).toMatch(PEER_ACCESS);
    });
  });

  it('le module propriétaire ne journalise rien', () => {
    const logging = sources.filter(({ file, text }) => file.startsWith(OWNER) && LOG_CALL.test(text)).map(({ file }) => file);

    expect(logging).toEqual([]);
  });

  it('la route ne journalise que la trace de l’erreur, jamais la demande', () => {
    const route = sources.find(({ file }) => file === ROUTE);
    const lines = route?.text.match(LOG_LINE) ?? [];

    expect(lines.length).toBeGreaterThan(0);
    expect(lines.filter((line) => !/errorTrace\(error\)/.test(line) || /request|body|handle|parsed/.test(line))).toEqual([]);
  });

  it('le motif de journal attrape les formes courantes', () => {
    expect(LOG_CALL.test('fastify.log.error({ handle }, "x")')).toBe(true);
    expect(LOG_CALL.test('console.warn(handle)')).toBe(true);
    expect(LOG_CALL.test('logError(fastify.log, "x", error)')).toBe(true);
    expect(LOG_CALL.test('logger.info`x`')).toBe(false);
  });
});
