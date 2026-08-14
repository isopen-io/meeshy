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
import { enhancedLogger } from '../utils/logger-enhanced.js';
import type { NormalizedContact } from '../utils/contact-identifiers.js';

const logger = enhancedLogger.child({ module: 'ContactDirectory' });

/** Borne les tableaux `in` envoyés à MongoDB pour un carnet volumineux. */
const MAX_IDENTIFIERS_PER_QUERY = 5000;
/** Borne les clauses `OR` insensibles à la casse (une regex chacune). */
const MAX_USERNAME_CLAUSES = 200;
/** Écritures d'upsert menées de front pendant une synchronisation. */
const UPSERT_CONCURRENCY = 25;
const MAX_PAGE_SIZE = 200;

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
   * `mode: 'replace'` (synchronisation complète du carnet) purge les entrées
   * absentes du lot ; `'merge'` (défaut) ne supprime jamais rien — un envoi
   * partiel ne doit pas amputer le répertoire.
   */
  async sync(options: {
    ownerId: string;
    contacts: NormalizedContact[];
    mode?: SyncMode;
  }): Promise<{ synced: number; matched: number; removed: number }> {
    const { ownerId, contacts, mode = 'merge' } = options;
    const matches = await this.match({ contacts, excludeUserId: ownerId });
    const syncedAt = new Date();

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

    let removed = 0;
    if (mode === 'replace') {
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
      mode,
    });

    return { synced: contacts.length, matched: matches.size, removed };
  }

  /** Page du répertoire, profil Meeshy rapproché inclus. */
  async list(options: {
    ownerId: string;
    offset: number;
    limit: number;
    filter?: DirectoryFilter;
    query?: string;
  }): Promise<{ contacts: DirectoryEntry[]; total: number }> {
    const { ownerId, offset, limit, filter = 'all', query } = options;
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

    return {
      contacts: rows.map((row: Record<string, any>) => {
        const matchedUser = toPublicProfile(row.matchedUser ?? null);
        return {
          id: row.id,
          contactKey: row.contactKey,
          displayName: row.displayName ?? null,
          phoneNumbers: row.phoneNumbers ?? [],
          emails: row.emails ?? [],
          usernames: row.usernames ?? [],
          isOnMeeshy: matchedUser !== null,
          matchedBy: row.matchedBy ?? null,
          matchedAt: row.matchedAt ?? null,
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
