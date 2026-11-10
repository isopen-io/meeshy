/**
 * #17117 — DEUX lois de la conversation externe qu'un lot futur casserait en
 * ajoutant une porte de bonne foi (audit adversarial du 2026-11-10) :
 *
 * 1. **Un seul membre Meeshy.** Toute porte qui fait entrer quelqu'un dans une
 *    conversation existante — celles qui décident l'entrée par
 *    `resolveConversationEntry`, la jonction par lien (`admitLinkEntry`) et la
 *    création d'un lien (`mayMintShareLink`) — consulte le prédicat UNIQUE
 *    `conversationAdmitsNewMembers`. Le discriminant est l'appel à la loi
 *    d'entrée : une cinquième porte qui l'appelle entre dans ce balayage sans
 *    que personne y pense.
 * 2. **Le numéro ne survit pas au fil.** Tout site qui FERME une conversation
 *    appelle déjà le site unique `deactivateShareLinksOnClose` (#3740) ; il
 *    appelle aussi `eraseExternalPeerOnClose`.
 *
 * Les témoins de COMPORTEMENT vivent dans
 * `__tests__/unit/routes/conversations/external-conversation-doors-17117.test.ts`.
 *
 * @jest-environment node
 */
import { describe, it, expect, jest } from '@jest/globals';
import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';
import { conversationAdmitsNewMembers, EXTERNAL_CONVERSATION_TYPE } from '@meeshy/shared/types/external-conversation';
import { eraseExternalPeerOnClose } from '../erase-external-peers';

const SRC = join(__dirname, '../../..');

function productionFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === '__tests__' ? [] : productionFiles(path);
    return name.endsWith('.ts') && !name.endsWith('.test.ts') && !name.endsWith('.d.ts') ? [path] : [];
  });
}

const codeOf = (text: string): string =>
  text
    .split('\n')
    .filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line))
    .join('\n');

const sources = productionFiles(SRC).map((path) => ({ file: relative(SRC, path), code: codeOf(readFileSync(path, 'utf8')) }));

const ENTRY_LAWS = ['resolveConversationEntry(', 'admitLinkEntry(', 'mayMintShareLink('];

/** Les fichiers qui DÉFINISSENT une loi d'entrée, sans être une porte. */
const DEFINES_ENTRY_LAW = new Set([
  'services/conversations/conversationEntryAdmission.ts',
]);

const SINGLE_MEMBER_LAW = 'conversationAdmitsNewMembers(';

describe('un seul membre Meeshy : chaque porte d’entrée consulte la loi unique', () => {
  const doors = sources
    .filter(({ file, code }) => !DEFINES_ENTRY_LAW.has(file) && ENTRY_LAWS.some((law) => code.includes(law)))
    .map(({ file }) => file)
    .sort();

  it('le balayage trouve les portes connues (une garde qui ne voit rien reste verte)', () => {
    expect(doors).toEqual(expect.arrayContaining([
      'routes/conversations/participants-writes.ts',
      'routes/conversations/sharing-invite.ts',
      'routes/links/utils/share-link-mint.ts',
      'services/conversations/linkAdmission.ts',
    ]));
  });

  it('chaque porte appelle conversationAdmitsNewMembers', () => {
    const silent = doors.filter((file) => !sources.find((source) => source.file === file)?.code.includes(SINGLE_MEMBER_LAW));

    expect(silent).toEqual([]);
  });

  it('la loi refuse le seul type externe', () => {
    expect(conversationAdmitsNewMembers(EXTERNAL_CONVERSATION_TYPE)).toBe(false);
    ['direct', 'group', 'public', 'global', 'broadcast'].forEach((type) => expect(conversationAdmitsNewMembers(type)).toBe(true));
  });
});

describe('le numéro ne survit pas au fil : chaque clôture efface l’adresse du pair', () => {
  const closers = sources.filter(({ code }) => code.includes('deactivateShareLinksOnClose(')).map(({ file }) => file).sort();

  it('le balayage trouve les cinq sites de clôture', () => {
    expect(closers).toEqual(expect.arrayContaining([
      'routes/admin/conversation-settings-sovereign.ts',
      'routes/conversations/core-lifecycle.ts',
      'routes/conversations/delete-for-me.ts',
      'routes/conversations/leave.ts',
      'services/conversations/obsoleteConversation.ts',
    ]));
  });

  it('chaque site de clôture appelle eraseExternalPeerOnClose', () => {
    const forgetful = closers
      .filter((file) => file !== 'services/conversations/shareLinkClosure.ts')
      .filter((file) => !sources.find((source) => source.file === file)?.code.includes('eraseExternalPeerOnClose('));

    expect(forgetful).toEqual([]);
  });
});

describe('eraseExternalPeerOnClose', () => {
  const prismaDouble = () => ({ externalConversationPeer: { deleteMany: jest.fn(async () => ({ count: 1 })) } });

  it('efface l’adresse d’une conversation externe', async () => {
    const prisma = prismaDouble();

    await expect(eraseExternalPeerOnClose(prisma as never, { id: 'c1', type: EXTERNAL_CONVERSATION_TYPE })).resolves.toBe(1);
    expect(prisma.externalConversationPeer.deleteMany).toHaveBeenCalledWith({ where: { conversationId: 'c1' } });
  });

  it.each(['direct', 'group', undefined, null])('ne touche à rien pour une conversation %s', async (type) => {
    const prisma = prismaDouble();

    await expect(eraseExternalPeerOnClose(prisma as never, { id: 'c1', type })).resolves.toBe(0);
    expect(prisma.externalConversationPeer.deleteMany).not.toHaveBeenCalled();
  });
});
