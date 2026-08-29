/**
 * Répertoire — carnet d'adresses appareil synchronisé et CONSERVÉ côté serveur.
 *
 * Deux responsabilités distinctes, volontairement séparées :
 *  - `match` : rapprochement pur (aucune écriture) entre des identifiants
 *    normalisés et les comptes Meeshy actifs. Sert aussi bien au matching
 *    éphémère (`POST /users/me/contacts/match`) qu'à la synchronisation.
 *  - `sync` / `list` / `clear` : persistance du répertoire, pour qu'il soit
 *    consultable depuis n'importe quel client sans re-scanner l'appareil.
 *
 * Ordre de rapprochement : téléphone > email > pseudo. Le téléphone est
 * l'identifiant le plus fiable d'un carnet d'adresses ; le pseudo (nickname
 * vCard) le plus faible — il n'intervient qu'à défaut des deux autres.
 */

import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { applyPresenceVisibilityAsOffline } from '@meeshy/shared/utils/presence-visibility';
import type { PresenceVisibility } from '@meeshy/shared/utils/presence-visibility';
import { enhancedLogger } from '../utils/logger-enhanced.js';
import type { NormalizedContact } from '../utils/contact-identifiers.js';
import { getBlockedUserIdsAmong } from '../utils/blocking.js';
import { getPresenceVisibilityService, type PresenceViewer } from './PresenceVisibilityService.js';

const logger = enhancedLogger.child({ module: 'ContactDirectory' });

/** Borne les tableaux `in` envoyés à MongoDB pour un carnet volumineux. */
const MAX_IDENTIFIERS_PER_QUERY = 5000;
/** Borne les clauses `OR` insensibles à la casse (une regex chacune). */
const MAX_USERNAME_CLAUSES = 200;
/** Écritures d'upsert menées de front pendant une synchronisation. */
const UPSERT_CONCURRENCY = 25;
const MAX_PAGE_SIZE = 200;
/**
 * Un filigrane (`syncStartedAt`) plus vieux que ceci n'autorise plus la purge
 * du lot final — une synchronisation reprise après une longue interruption
 * ne doit pas purger sur la foi d'une horloge de départ obsolète.
 */
const MAX_WATERMARK_AGE_MS = 24 * 60 * 60 * 1000;

export type MatchedBy = 'phone' | 'email' | 'username';

export type MatchedUserProfile = {
  id: string;
  username: string;
  firstName: string | null;
  lastName: string | null;
  displayName: string | null;
  avatar: string | null;
  isOnline: boolean;
  lastActiveAt: Date | null;
};

export type ContactMatch = {
  user: MatchedUserProfile;
  matchedBy: MatchedBy;
};

export type DirectoryEntry = {
  id: string;
  contactKey: string;
  displayName: string | null;
  phoneNumbers: string[];
  emails: string[];
  usernames: string[];
  isOnMeeshy: boolean;
  matchedBy: string | null;
  matchedAt: Date | null;
  lastSyncedAt: Date | null;
  matchedUser: MatchedUserProfile | null;
};

export type DirectoryFilter = 'all' | 'meeshy' | 'invitable';
export type SyncMode = 'merge' | 'replace';

const MATCH_USER_SELECT = {
  id: true,
  username: true,
  firstName: true,
  lastName: true,
  displayName: true,
  avatar: true,
  isOnline: true,
  lastActiveAt: true,
  phoneNumber: true,
  email: true,
} as const;

const PUBLIC_USER_SELECT = {
  id: true,
  username: true,
  firstName: true,
  lastName: true,
  displayName: true,
  avatar: true,
  isOnline: true,
  lastActiveAt: true,
} as const;

function toPublicProfile(user: Record<string, unknown> | null): MatchedUserProfile | null {
  if (!user) return null;
  return {
    id: user.id as string,
    username: user.username as string,
    firstName: (user.firstName as string) ?? null,
    lastName: (user.lastName as string) ?? null,
    displayName: (user.displayName as string) ?? null,
    avatar: (user.avatar as string) ?? null,
    isOnline: Boolean(user.isOnline),
    lastActiveAt: (user.lastActiveAt as Date) ?? null,
  };
}

function collect(contacts: NormalizedContact[], key: 'phoneNumbers' | 'emails' | 'usernames'): string[] {
  const seen = new Set<string>();
  for (const contact of contacts) {
    for (const value of contact[key]) {
      if (seen.size >= MAX_IDENTIFIERS_PER_QUERY) return Array.from(seen);
      seen.add(value);
    }
  }
  return Array.from(seen);
}

async function inBatches<T>(items: T[], size: number, run: (item: T) => Promise<unknown>): Promise<void> {
  for (let index = 0; index < items.length; index += size) {
    await Promise.all(items.slice(index, index + size).map(run));
  }
}

/**
 * La portée d'une recherche de personne par IDENTIFIANT DE CONTACT.
 *
 * Cette loi vivait uniquement dans `ContactDirectoryService.match()`, la
 * jumelle AUTHENTIFIÉE. Ses deux sœurs publiques — `GET /users/email/:email` et
 * `GET /users/phone/:phone` — répondaient à la même question sans aucun de ces
 * filtres : un compte désactivé restait consultable, et un utilisateur bloqué
 * retrouvait le profil de qui l'avait bloqué (#4160).
 *
 * Le blocage vaut dans les DEUX sens, et c'est le point : écarter seulement
 * « les comptes que j'ai bloqués » laisserait celui que j'ai bloqué me
 * retrouver. La symétrie n'est pas une politesse, c'est la protection.
 */
export function contactLookupScope(options: {
  viewerId: string;
  blockedByViewer: readonly string[];
}): Record<string, unknown> {
  return {
    isActive: true,
    deletedAt: null,
    id: { notIn: [...options.blockedByViewer] },
    NOT: { blockedUserIds: { has: options.viewerId } },
  };
}

/** Les identifiants que `viewerId` a bloqués. Lecture unique, réutilisable. */
export async function blockedIdsOfViewer(
  prisma: { user: { findUnique: (args: unknown) => Promise<{ blockedUserIds?: string[] } | null> } },
  viewerId: string
): Promise<string[]> {
  const owner = await prisma.user.findUnique({
    where: { id: viewerId },
    select: { blockedUserIds: true },
  } as never);
  return owner?.blockedUserIds ?? [];
}

export class ContactDirectoryService {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Rapproche des contacts normalisés des comptes Meeshy actifs.
   * Aucune écriture — la clé du résultat est le `contactKey`.
   */
  async match(options: {
    contacts: NormalizedContact[];
    excludeUserId: string;
  }): Promise<Map<string, ContactMatch>> {
    const { contacts, excludeUserId } = options;
    const phones = collect(contacts, 'phoneNumbers');
    const emails = collect(contacts, 'emails');
    const usernames = collect(contacts, 'usernames').slice(0, MAX_USERNAME_CLAUSES);

    const result = new Map<string, ContactMatch>();
    if (phones.length === 0 && emails.length === 0 && usernames.length === 0) return result;

    const blockedUserIds = await this.blockedIdsOf(excludeUserId);

    const candidates = await this.prisma.user.findMany({
      where: {
        id: { notIn: [excludeUserId, ...blockedUserIds] },
        isActive: true,
        deletedAt: null,
        // Un compte qui a bloqué le demandeur ne doit pas ressortir de son
        // carnet d'adresses — le blocage vaut dans les deux sens.
        NOT: { blockedUserIds: { has: excludeUserId } },
        OR: [
          ...(phones.length > 0 ? [{ phoneNumber: { in: phones } }] : []),
          ...(emails.length > 0 ? [{ email: { in: emails } }] : []),
          ...usernames.map((username) => ({
            username: { equals: username, mode: 'insensitive' as const },
          })),
        ],
      },
      select: MATCH_USER_SELECT,
    });

    const byPhone = new Map<string, typeof candidates[number]>();
    const byEmail = new Map<string, typeof candidates[number]>();
    const byUsername = new Map<string, typeof candidates[number]>();
    for (const candidate of candidates) {
      if (candidate.phoneNumber) byPhone.set(candidate.phoneNumber, candidate);
      if (candidate.email) byEmail.set(candidate.email.toLowerCase(), candidate);
      byUsername.set(candidate.username.toLowerCase(), candidate);
    }

    for (const contact of contacts) {
      const resolved = this.resolveMatch(contact, { byPhone, byEmail, byUsername });
      if (resolved) result.set(contact.contactKey, resolved);
    }

    return result;
  }

  /**
   * Synchronise le carnet : upsert idempotent sur `(ownerId, contactKey)`.
   *
   * Deux stratégies de purge, mutuellement exclusives :
   *  - **historique** (ni `syncStartedAt` ni `isFinalBatch` fourni) :
   *    `mode: 'replace'` purge les entrées absentes de CE lot unique
   *    (`contactKey notIn`) ; `'merge'` (défaut) ne supprime jamais rien —
   *    un envoi partiel ne doit pas amputer le répertoire. Adaptée à un
   *    appel unique, non paginé.
   *  - **par lots** (`syncStartedAt` et/ou `isFinalBatch` fourni) : la purge
   *    `contactKey notIn` est structurellement incompatible avec plusieurs
   *    requêtes successives pour un même carnet — chaque lot ne voit qu'une
   *    tranche. `mode` est alors ignoré pour la purge : aucun lot
   *    intermédiaire ne supprime rien, et seul le lot `isFinalBatch: true`
   *    purge — par FILIGRANE (`lastSyncedAt < syncStartedAt`, ou à défaut
   *    `receivedAt` pour un lot unique et final), déjà posé par chaque
   *    upsert des DEUX stratégies. Un filigrane plus vieux que 24h est
   *    ignoré (`removed: 0`).
   */
  async sync(options: {
    ownerId: string;
    contacts: NormalizedContact[];
    mode?: SyncMode;
    /** Filigrane client, identique sur tous les lots d'une même synchronisation. */
    syncStartedAt?: Date;
    /** `true` sur le dernier lot d'une synchronisation par lots. */
    isFinalBatch?: boolean;
    /** Horloge serveur prise à la réception de la requête, avant tout upsert. */
    receivedAt?: Date;
  }): Promise<{ synced: number; matched: number; removed: number }> {
    const { ownerId, contacts, mode = 'merge', syncStartedAt, isFinalBatch, receivedAt = new Date() } = options;
    const matches = await this.match({ contacts, excludeUserId: ownerId });
    const syncedAt = receivedAt;

    await inBatches(contacts, UPSERT_CONCURRENCY, async (contact) => {
      const match = matches.get(contact.contactKey);
      const identity = {
        displayName: contact.displayName,
        phoneNumbers: contact.phoneNumbers,
        emails: contact.emails,
        usernames: contact.usernames,
        // Un compte supprimé ou désactivé depuis la dernière sync doit faire
        // RETOMBER le contact côté « à inviter » : on réécrit toujours le
        // triplet de match, y compris quand il redevient null.
        matchedUserId: match?.user.id ?? null,
        matchedBy: match?.matchedBy ?? null,
        matchedAt: match ? syncedAt : null,
        lastSyncedAt: syncedAt,
      };
      await this.prisma.userContact.upsert({
        where: { ownerId_contactKey: { ownerId, contactKey: contact.contactKey } },
        create: { ownerId, contactKey: contact.contactKey, ...identity },
        update: identity,
      });
    });

    const batched = syncStartedAt !== undefined || isFinalBatch !== undefined;
    let removed = 0;

    if (batched) {
      if (isFinalBatch === true) {
        // Un filigrane demandé APRÈS `receivedAt` (horloge client en avance,
        // ou dérive NTP entre le premier et le dernier lot) doit être
        // ramené à `receivedAt` : au-delà, `watermarkAgeMs` deviendrait
        // négatif et la purge `lastSyncedAt < watermark` engloutirait les
        // upserts que CE lot vient d'estampiller — tous à `receivedAt`.
        const requested = syncStartedAt ?? receivedAt;
        const watermark = requested.getTime() > receivedAt.getTime() ? receivedAt : requested;
        const watermarkAgeMs = receivedAt.getTime() - watermark.getTime();
        if (watermarkAgeMs <= MAX_WATERMARK_AGE_MS) {
          const deletion = await this.prisma.userContact.deleteMany({
            where: { ownerId, lastSyncedAt: { lt: watermark } },
          });
          removed = deletion.count;
        }
      }
    } else if (mode === 'replace') {
      const deletion = await this.prisma.userContact.deleteMany({
        where: { ownerId, contactKey: { notIn: contacts.map((contact) => contact.contactKey) } },
      });
      removed = deletion.count;
    }

    logger.info('Répertoire synchronisé', {
      ownerId,
      synced: contacts.length,
      matched: matches.size,
      removed,
      mode: batched ? (isFinalBatch === true ? 'watermark-final' : 'watermark-batch') : mode,
    });

    return { synced: contacts.length, matched: matches.size, removed };
  }

  /**
   * Page du répertoire, profil Meeshy rapproché inclus.
   *
   * `match()` applique le blocage bidirectionnel à l'ÉCRITURE, une fois par
   * synchronisation d'appareil. La lecture doit le rejouer, parce que le blocage
   * bouge entre deux synchronisations et qu'aucune d'elles ne le rattrape : sans
   * ça, un compte bloqué APRÈS le dernier `sync` gardait son lien Meeshy — donc
   * le bouton « Lui écrire », vers un envoi que la passerelle rejette en
   * `USER_BLOCKED` — jusqu'au prochain scan du carnet.
   *
   * `viewer` est requis (et non optionnel) parce que la présence servie ici est
   * la MÊME donnée que partout ailleurs : elle passe par le gate STRICT de
   * `PresenceVisibilityService`, comme `/users/search`. Un appelant sans viewer
   * passe `null`, ce qui masque — la porte est fermée par défaut.
   */
  async list(options: {
    ownerId: string;
    viewer: PresenceViewer;
    offset: number;
    limit: number;
    filter?: DirectoryFilter;
    query?: string;
  }): Promise<{ contacts: DirectoryEntry[]; total: number }> {
    const { ownerId, viewer, offset, limit, filter = 'all', query } = options;
    const take = Math.min(Math.max(limit, 1), MAX_PAGE_SIZE);
    const search = query?.trim();

    const where = {
      ownerId,
      ...(filter === 'meeshy' ? { matchedUserId: { not: null } } : {}),
      ...(filter === 'invitable' ? { matchedUserId: null } : {}),
      ...(search
        ? {
            OR: [
              { displayName: { contains: search, mode: 'insensitive' as const } },
              { emails: { has: search.toLowerCase() } },
              { usernames: { has: search.toLowerCase() } },
              { phoneNumbers: { has: search } },
            ],
          }
        : {}),
    };

    const [rows, total] = await Promise.all([
      this.prisma.userContact.findMany({
        where,
        // Les contacts présents sur Meeshy remontent en tête : ce sont les
        // seuls sur lesquels l'utilisateur peut agir (« Lui écrire »).
        orderBy: [{ matchedUserId: 'desc' }, { displayName: 'asc' }],
        skip: Math.max(offset, 0),
        take,
        select: {
          id: true,
          contactKey: true,
          displayName: true,
          phoneNumbers: true,
          emails: true,
          usernames: true,
          matchedBy: true,
          matchedAt: true,
          lastSyncedAt: true,
          matchedUser: { select: PUBLIC_USER_SELECT },
        },
      }),
      this.prisma.userContact.count({ where }),
    ]);

    const matchedIds = [
      ...new Set(
        rows
          .map((row: Record<string, any>) => row.matchedUser?.id as string | undefined)
          .filter((id: string | undefined): id is string => typeof id === 'string'),
      ),
    ];
    // Une page sans aucun compte rapproché ne pose aucune question de blocage ni
    // de présence : ne pas ouvrir les requêtes pour rien.
    const blocked = matchedIds.length > 0
      ? await getBlockedUserIdsAmong(this.prisma, ownerId, matchedIds)
      : new Set<string>();
    const visibleIds = matchedIds.filter((id) => !blocked.has(id));
    const visibility = visibleIds.length > 0
      ? await getPresenceVisibilityService(this.prisma).resolveForTargets(viewer, visibleIds)
      : new Map<string, PresenceVisibility>();

    return {
      contacts: rows.map((row: Record<string, any>) => {
        const profile = toPublicProfile(row.matchedUser ?? null);
        // Un lien coupé rend EXACTEMENT ce qu'une re-synchronisation écrirait
        // pour ce contact (`matchedUserId`/`matchedBy`/`matchedAt` à null) : la
        // ligne du carnet reste — c'est l'entrée de l'utilisateur, pas celle du
        // compte bloqué — mais elle redevient « à inviter ».
        const severed = profile !== null && blocked.has(profile.id);
        const matchedUser = profile === null || severed
          ? null
          : applyPresenceVisibilityAsOffline(profile, visibility.get(profile.id));
        return {
          id: row.id,
          contactKey: row.contactKey,
          displayName: row.displayName ?? null,
          phoneNumbers: row.phoneNumbers ?? [],
          emails: row.emails ?? [],
          usernames: row.usernames ?? [],
          isOnMeeshy: matchedUser !== null,
          matchedBy: matchedUser === null ? null : (row.matchedBy ?? null),
          matchedAt: matchedUser === null ? null : (row.matchedAt ?? null),
          lastSyncedAt: row.lastSyncedAt ?? null,
          matchedUser,
        };
      }),
      total,
    };
  }

  /** Efface l'intégralité du répertoire de l'utilisateur (droit au retrait). */
  async clear(ownerId: string): Promise<number> {
    const deletion = await this.prisma.userContact.deleteMany({ where: { ownerId } });
    logger.info('Répertoire effacé', { ownerId, removed: deletion.count });
    return deletion.count;
  }

  private resolveMatch(
    contact: NormalizedContact,
    indexes: {
      byPhone: Map<string, Record<string, unknown>>;
      byEmail: Map<string, Record<string, unknown>>;
      byUsername: Map<string, Record<string, unknown>>;
    }
  ): ContactMatch | null {
    const lookups: Array<[MatchedBy, string[], Map<string, Record<string, unknown>>]> = [
      ['phone', contact.phoneNumbers, indexes.byPhone],
      ['email', contact.emails, indexes.byEmail],
      ['username', contact.usernames, indexes.byUsername],
    ];
    for (const [matchedBy, values, index] of lookups) {
      for (const value of values) {
        const user = index.get(value);
        if (user) {
          const profile = toPublicProfile(user);
          if (profile) return { user: profile, matchedBy };
        }
      }
    }
    return null;
  }

  private async blockedIdsOf(userId: string): Promise<string[]> {
    const owner = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { blockedUserIds: true },
    });
    return owner?.blockedUserIds ?? [];
  }
}
