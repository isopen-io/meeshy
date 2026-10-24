/**
 * LE RÔLE DE PLATEFORME PRIVILÉGIÉ (#11217, décision porteur du 2026-10-24) :
 * MODERATOR, ADMIN et BIGBOSS, d'UNE table, lue EXACTEMENT par toutes les
 * admissions. AUDIT et ANALYST lisent des journaux, ils ne modèrent pas.
 *
 * Deux témoins, deux questions :
 *  - la TABLE dit qui est privilégié, sans plier la casse (`User.role` est un
 *    enum Prisma en majuscules ; un « moderator » ne vient que d'une charge
 *    forgée, et elle ne modère pas) ;
 *  - la GARDE tombe si une liste littérale de ces trois rôles renaît ailleurs
 *    que dans la table — c'est la jumelle écrite à côté qui avait laissé la
 *    passerelle se contredire sur MODERATOR.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { GlobalUserRole } from '../types/role-types.js';
import { conversationActionsFor } from '../utils/conversation-action-policy.js';
import { messageActionsFor, type ActionConversation, type ActionViewer, type MessageActionSubject } from '../utils/message-action-policy.js';
import { PRIVILEGED_PLATFORM_ROLES, isPrivilegedPlatformRole } from '../utils/platform-privilege.js';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

describe('la table des rôles de plateforme privilégiés', () => {
  it('compte exactement MODERATOR, ADMIN et BIGBOSS', () => {
    expect([...PRIVILEGED_PLATFORM_ROLES].sort()).toEqual(['ADMIN', 'BIGBOSS', 'MODERATOR']);
  });

  it.each(['MODERATOR', 'ADMIN', 'BIGBOSS'])('%s est privilégié', (role) => {
    expect(isPrivilegedPlatformRole(role)).toBe(true);
  });

  it.each(['AUDIT', 'ANALYST', 'USER', 'AGENT'])('%s reste ordinaire', (role) => {
    expect(isPrivilegedPlatformRole(role)).toBe(false);
  });

  it.each(['moderator', 'Admin', 'bigboss', 'PIRATE', '', ' MODERATOR'])('« %s » ne se lit pas : comparaison EXACTE, fermée', (role) => {
    expect(isPrivilegedPlatformRole(role)).toBe(false);
  });

  it('un rôle absent ne donne rien', () => {
    expect(isPrivilegedPlatformRole(null)).toBe(false);
    expect(isPrivilegedPlatformRole(undefined)).toBe(false);
  });

  it('ne range que des rôles de plateforme connus', () => {
    const known: readonly string[] = Object.values(GlobalUserRole);
    expect(PRIVILEGED_PLATFORM_ROLES.every((role) => known.includes(role))).toBe(true);
  });
});

const SCANNED_ROOTS = ['packages/shared/utils', 'packages/shared/types', 'services/gateway/src', 'apps/web/src'];
const TABLE_FILE = 'packages/shared/utils/platform-privilege.ts';

const isTestPath = (path: string): boolean => /__tests__|\.test\.|\.spec\./.test(path);

function sourcesUnder(dir: string): readonly string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (entry === 'node_modules' || entry === 'dist') return [];
    if (statSync(path).isDirectory()) return sourcesUnder(path);
    return /\.(ts|tsx)$/.test(entry) && !entry.endsWith('.d.ts') ? [path] : [];
  });
}

const ROLE = (name: string): string => `(?:['"\`]${name}['"\`]|(?:GlobalUserRole|UserRoleEnum|UserRole)\\.${name})`;
const PRIVILEGED_TRIO = [ROLE('MODERATOR'), ROLE('ADMIN'), ROLE('BIGBOSS')].map((pattern) => new RegExp(pattern));
/** Une liste qui nomme aussi un rôle ordinaire ÉNUMÈRE les rôles (schéma, formulaire) : elle ne privilégie personne. */
const ORDINARY_ROLE = new RegExp([ROLE('USER'), ROLE('AUDIT'), ROLE('ANALYST')].join('|'));

/** Une liste littérale (`[...]`) qui énumère les trois rôles privilégiés et eux seuls, hors commentaire. */
function literalTriosIn(source: string): readonly string[] {
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const lists = code.match(/\[[^[\]]*\]/g) ?? [];
  return lists.filter((list) => PRIVILEGED_TRIO.every((pattern) => pattern.test(list)) && !ORDINARY_ROLE.test(list));
}

describe('la garde : aucune autre liste de rôles privilégiés', () => {
  it('la garde attrape une liste écrite à la main', () => {
    expect(literalTriosIn("const X = new Set(['ADMIN', 'BIGBOSS', 'MODERATOR']);")).toHaveLength(1);
    expect(literalTriosIn("requireRole([UserRoleEnum.BIGBOSS, UserRoleEnum.ADMIN, UserRoleEnum.MODERATOR])")).toHaveLength(1);
    expect(literalTriosIn("const ADMINS = ['ADMIN', 'BIGBOSS'];")).toHaveLength(0);
    expect(literalTriosIn("z.enum(['USER', 'ADMIN', 'MODERATOR', 'BIGBOSS', 'AUDIT', 'ANALYST'])")).toHaveLength(0);
  });

  it('seule la table énumère MODERATOR, ADMIN et BIGBOSS', () => {
    const offenders = SCANNED_ROOTS.flatMap((root) => sourcesUnder(join(REPO, root)))
      .map((path) => relative(REPO, path))
      .filter((path) => path !== TABLE_FILE && !isTestPath(path))
      .filter((path) => literalTriosIn(readFileSync(join(REPO, path), 'utf-8')).length > 0);
    expect(offenders).toEqual([]);
  });
});

const reader = (overrides: Partial<ActionViewer> = {}): ActionViewer => ({
  id: 'user-viewer', participantId: 'part-viewer', hasAccount: true, isAnonymous: false, platformRole: 'USER',
  conversationRole: 'member', isActiveMember: true, canSendMessages: true, isDeclaredMinor: false, ...overrides,
});

const room = (type: string): ActionConversation => ({
  type, encryptionMode: null, isActive: true, closedAt: null, isAnnouncementChannel: false, defaultWriteRole: 'everyone',
});

const NOW = Date.parse('2026-10-20T12:00:00.000Z');
const othersMessage: MessageActionSubject = {
  id: '65f000000000000000000001', senderId: 'part-author', authorUserId: 'user-author', content: 'Bonjour à tous',
  messageType: 'text', createdAt: new Date(NOW - 3_600_000).toISOString(),
};

const TYPES = ['group', 'public', 'global', 'broadcast'] as const;
const MEMBERSHIPS: readonly (readonly [string, Partial<ActionViewer>])[] = [
  ['membre', {}],
  ['non membre', { isActiveMember: false, conversationRole: null }],
];

type ConversationVerdicts = ReturnType<typeof conversationActionsFor>;

/**
 * La modération, sans ce que d'autres décisions gardent à ADMIN/BIGBOSS : la
 * console (`adminOpen`, `isGlobalAdmin`) et l'appel dans une conversation
 * publique (`canStartCall`, directive du 2026-10-11 : un modérateur n'en lance pas).
 */
const moderationOf = (actions: ConversationVerdicts): Omit<ConversationVerdicts, 'adminOpen' | 'call' | 'videoCall'> => {
  const { adminOpen: _console, call: _call, videoCall: _video, ...rest } = actions;
  return rest;
};

describe('la loi des actions lit la table : MODERATOR de plateforme vaut ADMIN, AUDIT vaut USER (#11217)', () => {
  describe.each(TYPES)('%s', (type) => {
    it.each(MEMBERSHIPS)('%s : MODERATOR a sur le message d’autrui les verdicts d’ADMIN', (_label, membership) => {
      const as = (platformRole: string) =>
        messageActionsFor({ message: othersMessage, conversation: room(type), viewer: reader({ platformRole, ...membership }), now: NOW });
      expect(as('MODERATOR')).toEqual(as('ADMIN'));
    });

    it.each(MEMBERSHIPS)('%s : MODERATOR a sur la conversation les droits d’ADMIN, hors console', (_label, membership) => {
      const as = (platformRole: string) => conversationActionsFor({ conversation: room(type), viewer: reader({ platformRole, ...membership }) });
      expect(moderationOf(as('MODERATOR'))).toEqual(moderationOf(as('ADMIN')));
    });

    it.each(['AUDIT', 'ANALYST'])('%s reste un lecteur ordinaire', (platformRole) => {
      const message = (role: string) => messageActionsFor({ message: othersMessage, conversation: room(type), viewer: reader({ platformRole: role }), now: NOW });
      const conv = (role: string) => conversationActionsFor({ conversation: room(type), viewer: reader({ platformRole: role }) });
      expect(message(platformRole)).toEqual(message('USER'));
      expect(conv(platformRole)).toEqual(conv('USER'));
    });
  });

  it('MODERATOR membre d’un groupe en est le créateur : il le renomme et le supprime pour tous', () => {
    const actions = conversationActionsFor({ conversation: room('group'), viewer: reader({ platformRole: 'MODERATOR' }) });
    expect(actions.rename).toBe(true);
    expect(actions.deleteForAll).toBe(true);
    expect(actions.adminOpen).toBe(false);
  });
});
