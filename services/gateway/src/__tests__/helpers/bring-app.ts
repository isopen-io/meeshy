/**
 * Une application Fastify de TÉMOIN pour le Bring (#13936) : les routes `/bring`,
 * le réglage par personne `/relations/:userId/settings` et le blocage d'annuaire,
 * sur les doubles EN MÉMOIRE de `userRelation` / `friendRequest` (`relationStore`)
 * et de `relationFeatureSetting`, avec un `io` qui NOTE ce qui part à qui et un
 * push qui note ce qu'on lui remet. Le limiteur de débit est le VRAI, sur son
 * magasin mémoire (aucun Redis) : c'est le quota réel qui parle.
 */
import { jest } from '@jest/globals';
import Fastify from 'fastify';
import { relationStore, type RelationStore } from './user-relation-store';
import { AUTRE, MOI, NOW, TIERS, lien } from './relation-app';

export { AUTRE, MOI, NOW, TIERS, lien };

export type Emission = { readonly room: string; readonly event: string; readonly payload: Record<string, unknown> };

export type Personne = {
  readonly timezone?: string | null;
  readonly deactivatedAt?: Date | null;
  readonly isActive?: boolean;
  readonly deletedAt?: Date | null;
  readonly birthDate?: Date | null;
  readonly blockedUserIds?: readonly string[];
  readonly systemLanguage?: string;
  readonly notification?: Record<string, unknown>;
  readonly role?: string;
};

export type BringAppOptions = {
  readonly liens?: ReadonlyArray<Record<string, unknown>>;
  readonly demandes?: ReadonlyArray<Record<string, unknown>>;
  readonly personnes?: Readonly<Record<string, Personne>>;
  readonly reglages?: ReadonlyArray<{ ownerId: string; otherId: string; bringBlockedAt: Date | null } & Record<string, unknown>>;
};

export type BringTestApp = {
  readonly store: RelationStore;
  readonly emissions: Emission[];
  readonly reglages: Map<string, Record<string, unknown>>;
  /** Le double Prisma lui-même, pour compter les écritures. */
  readonly prisma: any;
  readonly users: Map<string, Record<string, unknown>>;
  readonly call: (
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    url: string,
    body?: unknown,
    as?: string,
  ) => Promise<{ status: number; body: any }>;
  readonly close: () => Promise<void>;
};

const cleDe = (ownerId: string, otherId: string) => `${ownerId}:${otherId}`;

export async function buildBringApp(
  register: (app: ReturnType<typeof Fastify>) => Promise<void>,
  options: BringAppOptions = {},
): Promise<BringTestApp> {
  const store = relationStore({ friendRequests: options.demandes ?? [], relations: options.liens ?? [] });
  const emissions: Emission[] = [];
  const reglages = new Map<string, Record<string, unknown>>(
    (options.reglages ?? []).map((r) => [cleDe(r.ownerId, r.otherId), { ...r }]),
  );
  const users = new Map<string, Record<string, unknown>>(
    [MOI, AUTRE, TIERS].map((id) => {
      const p = options.personnes?.[id] ?? {};
      return [id, {
        id,
        role: p.role ?? 'USER',
        username: `u${id.slice(-2)}`,
        displayName: `U${id.slice(-2)}`,
        firstName: 'A',
        lastName: 'B',
        avatar: null,
        deactivatedAt: p.deactivatedAt ?? null,
        isActive: p.isActive ?? true,
        deletedAt: p.deletedAt ?? null,
        timezone: p.timezone ?? null,
        birthDate: p.birthDate ?? null,
        blockedUserIds: [...(p.blockedUserIds ?? [])],
        systemLanguage: p.systemLanguage ?? 'fr',
        regionalLanguage: null,
        customDestinationLanguage: null,
        deviceLocale: null,
      }];
    }),
  );

  const prisma = {
    user: {
      findUnique: jest.fn(async (args: { where: { id: string } }) => users.get(args.where.id) ?? null),
      // Honore `blockedUserIds: { has }` (qui m'a bloqué ?) : sans lui, tous les candidats se lisaient bloqués.
      findMany: jest.fn(async (args: { where: { id: { in: string[] }; blockedUserIds?: { has: string } } }) =>
        args.where.id.in
          .map((id) => users.get(id))
          .filter((u) => u !== undefined)
          .filter((u) => args.where.blockedUserIds === undefined || ((u.blockedUserIds as string[]) ?? []).includes(args.where.blockedUserIds.has))),
      findFirst: jest.fn(async (args: { where: { OR: Array<{ id: string; blockedUserIds: { has: string } }> } }) =>
        args.where.OR.map((branch) => users.get(branch.id)).find((u, i) =>
          u !== undefined && ((u.blockedUserIds as string[]) ?? []).includes(args.where.OR[i].blockedUserIds.has),
        ) ?? null),
      update: jest.fn(async (args: { where: { id: string }; data: { blockedUserIds?: { push?: string } } }) => {
        const u = users.get(args.where.id)!;
        const pushed = args.data.blockedUserIds?.push;
        if (pushed) u.blockedUserIds = [...(u.blockedUserIds as string[]), pushed];
        return u;
      }),
    },
    friendRequest: store.prisma.friendRequest,
    userRelation: store.prisma.userRelation,
    relationFeatureSetting: {
      findUnique: jest.fn(async (args: { where: { ownerId_otherId: { ownerId: string; otherId: string } } }) => {
        const { ownerId, otherId } = args.where.ownerId_otherId;
        return reglages.get(cleDe(ownerId, otherId)) ?? null;
      }),
      upsert: jest.fn(async (args: {
        where: { ownerId_otherId: { ownerId: string; otherId: string } };
        create: Record<string, unknown>;
        update: Record<string, unknown>;
      }) => {
        const { ownerId, otherId } = args.where.ownerId_otherId;
        const key = cleDe(ownerId, otherId);
        const next = { ...(reglages.get(key) ?? args.create), ...(reglages.has(key) ? args.update : {}) };
        reglages.set(key, next);
        return next;
      }),
      // Honore l'égalité de colonne et un `OR` de telles égalités, les seules formes que la passerelle écrit ici.
      findMany: jest.fn(async (args: { where: Record<string, unknown> & { OR?: ReadonlyArray<Record<string, unknown>> } }) => {
        const { OR, ...egalites } = args.where;
        const egal = (row: Record<string, unknown>, conditions: Record<string, unknown>) =>
          Object.entries(conditions).every(([colonne, valeur]) => row[colonne] === valeur);
        return [...reglages.values()].filter((row) => egal(row, egalites) && (OR === undefined || OR.some((branche) => egal(row, branche))));
      }),
      updateMany: jest.fn(async (args: { where: { ownerId: string; otherId: string }; data: Record<string, unknown> }) => {
        const key = cleDe(args.where.ownerId, args.where.otherId);
        const row = reglages.get(key);
        if (!row) return { count: 0 };
        reglages.set(key, { ...row, ...args.data });
        return { count: 1 };
      }),
    },
    userPreferences: {
      findUnique: jest.fn(async (args: { where: { userId: string } }) => {
        const notification = options.personnes?.[args.where.userId]?.notification;
        return notification ? { notification } : null;
      }),
    },
    mutationLog: {
      findUnique: jest.fn(async () => null),
      create: jest.fn(async () => ({})),
    },
  };
  const io = {
    to: (room: string) => ({
      emit: (event: string, payload: Record<string, unknown>) => { emissions.push({ room, event, payload }); },
    }),
  };

  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('prisma', prisma as never);
  app.decorate('redis', null as never);
  app.decorate('socketIOHandler', { getManager: () => ({ getIO: () => io }) } as never);
  let acting = MOI;
  app.decorate('authenticate', async (req: object) => {
    Object.assign(req, {
      user: { userId: acting },
      authContext: { isAuthenticated: true, type: 'user', userId: acting, registeredUser: { id: acting, role: 'USER' } },
    });
  });
  await register(app);
  await app.ready();

  return {
    store, emissions, reglages, users, prisma,
    call: async (method, url, body, as) => {
      acting = as ?? MOI;
      const res = await app.inject({
        method, url,
        headers: body === undefined ? {} : { 'content-type': 'application/json' },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      return { status: res.statusCode, body: res.body ? JSON.parse(res.body) : null };
    },
    close: () => app.close(),
  };
}
