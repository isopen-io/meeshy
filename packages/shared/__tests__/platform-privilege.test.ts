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

/**
 * La forme du défaut d'ORIGINE de #11217 n'était pas le trio : c'était une
 * liste — ou une chaîne de `===` — qui nomme ADMIN et BIGBOSS et OUBLIE
 * MODERATOR. La garde ci-dessus ne la voyait pas ; le retrait d'une pièce
 * jointe d'autrui et celui d'un son l'ont traversée après le lot.
 *
 * Le rang d'ADMINISTRATION reste légitime là où une AUTRE décision le garde :
 * chaque fichier de la liste ci-dessous porte son motif. Un nouveau site qui
 * écrit `role === 'ADMIN' || role === 'BIGBOSS'` fait tomber ce témoin : il lit
 * la table (`isPrivilegedPlatformRole`) s'il modère du contenu, ou il rejoint
 * cette liste, avec sa décision, s'il administre la plateforme.
 */
const ADMINISTRATION_RANK_SITES: Readonly<Record<string, string>> = {
  'packages/shared/types/role-types.ts': '`isGlobalAdmin` — console et visibilité de la présence (directive 2026-08-25)',
  'packages/shared/utils/participant-helpers.ts': 'champs de console du contrat participant (`canAccessAdmin`, `canViewAuditLogs`…)',
  'packages/shared/utils/message-edit-attribution.ts': 'qui rend compte d’une modération lit l’identité du modérateur — ADMIN et BIGBOSS, jamais un pair MODERATOR (#11375)',
  'services/gateway/src/jobs/backup-status-check.ts': 'alertes de sauvegarde, exploitation',
  'services/gateway/src/middleware/auth.ts': '`requireAdmin` — console d’administration',
  'services/gateway/src/middleware/authorize.ts': '`requireAdminRank` — rang d’administration (directive 2026-09-16)',
  'services/gateway/src/routes/admin/dashboard.ts': 'console d’administration',
  'services/gateway/src/routes/admin/oversight-viewer.ts': 'lecture de supervision journalisée (rang d’administration)',
  'services/gateway/src/routes/notifications.ts': 'purge de TOUTES les notifications de l’instance, exploitation',
  'services/gateway/src/services/world/worldReservedMembers.ts': 'identités réservées de l’amorçage',
  'services/gateway/src/socketio/evictFromAdminRooms.ts': 'rooms de la console d’administration',
  'services/gateway/src/socketio/handlers/AdminAgentHandler.ts': 'agent de la console d’administration',
  'apps/web/src/lib/admin/sections.ts': 'sections de la console d’administration',
};

const MODERATOR_ROLE = new RegExp(ROLE('MODERATOR'));
const ADMIN_ROLE = new RegExp(ROLE('ADMIN'));
const BIGBOSS_ROLE = new RegExp(ROLE('BIGBOSS'));
const COMPARED = (name: string): RegExp => new RegExp(`[!=]==\\s*${ROLE(name)}|${ROLE(name)}\\s*[!=]==`);

/** Les listes et chaînes de comparaison qui privilégient ADMIN et BIGBOSS en oubliant MODERATOR. */
function adminOnlyPrivilegesIn(source: string): readonly string[] {
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const lists = (code.match(/\[[^[\]]*\]/g) ?? []).filter(
    (list) => ADMIN_ROLE.test(list) && BIGBOSS_ROLE.test(list) && !MODERATOR_ROLE.test(list) && !ORDINARY_ROLE.test(list),
  );
  const chains = code.split(/[;{}]/).filter(
    (statement) => COMPARED('ADMIN').test(statement) && COMPARED('BIGBOSS').test(statement) && !COMPARED('MODERATOR').test(statement),
  );
  return [...lists, ...chains];
}

describe('la garde : aucun privilège ADMIN/BIGBOSS qui oublie MODERATOR hors des sites d’administration', () => {
  it('la garde attrape les deux formes du défaut d’origine', () => {
    expect(adminOnlyPrivilegesIn("const ROLES = new Set(['ADMIN', 'BIGBOSS']);")).toHaveLength(1);
    expect(adminOnlyPrivilegesIn("const ok = role === 'ADMIN' || role === 'BIGBOSS';")).toHaveLength(1);
    expect(adminOnlyPrivilegesIn("if (u.role !== UserRoleEnum.BIGBOSS && u.role !== UserRoleEnum.ADMIN) {")).toHaveLength(1);
    expect(adminOnlyPrivilegesIn("const ok = isPrivilegedPlatformRole(role);")).toHaveLength(0);
    expect(adminOnlyPrivilegesIn("z.enum(['USER', 'ADMIN', 'BIGBOSS'])")).toHaveLength(0);
    expect(adminOnlyPrivilegesIn("const sovereign = role === 'BIGBOSS';")).toHaveLength(0);
  });

  it('seuls les sites d’administration motivés gardent ADMIN et BIGBOSS sans MODERATOR', () => {
    const offenders = SCANNED_ROOTS.flatMap((root) => sourcesUnder(join(REPO, root)))
      .map((path) => relative(REPO, path))
      .filter((path) => !isTestPath(path) && !(path in ADMINISTRATION_RANK_SITES))
      .filter((path) => adminOnlyPrivilegesIn(readFileSync(join(REPO, path), 'utf-8')).length > 0);
    expect(offenders).toEqual([]);
  });

  it('chaque site d’administration motivé en porte encore un — la liste ne garde pas de mort', () => {
    const stale = Object.keys(ADMINISTRATION_RANK_SITES)
      .filter((path) => adminOnlyPrivilegesIn(readFileSync(join(REPO, path), 'utf-8')).length === 0);
    expect(stale).toEqual([]);
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
