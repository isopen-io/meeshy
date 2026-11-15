/**
 * L'ATTENTE D'UNE PREUVE (#8083) — l'appareil qui a demandé un code apprend
 * que l'adresse a été prouvée ailleurs, et RIEN d'autre.
 *
 * Décision porteur « si et seulement si » : l'app ne se connecte que par le
 * code saisi sur elle ou le lien ouvert sur elle. Le jeton d'attente ne rend
 * donc qu'un ÉTAT (`pending` / `proven`) : jamais une session, jamais
 * l'adresse, jamais l'existence d'un compte.
 *
 * Le magasin est un faux EN MÉMOIRE qui applique les `where` que le module
 * écrit : un témoin qui n'assert que sur les arguments laisserait passer un
 * filtre juste en apparence et faux sur les lignes.
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';
import crypto from 'crypto';

import {
  issueEmailVerificationWatch,
  markEmailVerificationWatchesProven,
  pendingSessionTokenFor,
  readEmailVerificationWatch,
  EMAIL_VERIFICATION_WATCH_FALLBACK_TTL_MS,
} from '../../../services/auth/email-verification-watch';

type WatchRow = { tokenHash: string; userId: string | null; expiresAt: Date; provenAt: Date | null };
type UserRow = { id: string; email: string; isActive: boolean; emailVerificationExpiry: Date | null };

const MAINTENANT = new Date('2026-09-26T12:00:00Z');
const dans = (minutes: number) => new Date(MAINTENANT.getTime() + minutes * 60_000);
const sha256 = (v: string) => crypto.createHash('sha256').update(v).digest('hex');

const magasin = (users: UserRow[] = []) => {
  const watches: WatchRow[] = [];
  const store = {
    user: {
      findFirst: async (args: { where: { email: { equals: string }; isActive: boolean } }) =>
        users.find(
          (u) => u.email.toLowerCase() === args.where.email.equals.toLowerCase() && u.isActive === args.where.isActive,
        ) ?? null,
    },
    emailVerificationWatch: {
      create: async (args: { data: WatchRow }) => {
        watches.push({ ...args.data });
        return args.data;
      },
      findUnique: async (args: { where: { tokenHash: string } }) =>
        watches.find((w) => w.tokenHash === args.where.tokenHash) ?? null,
      updateMany: async (args: { where: { userId: string; provenAt: null; expiresAt: { gt: Date } }; data: { provenAt: Date } }) => {
        const cibles = watches.filter(
          (w) => w.userId === args.where.userId && w.provenAt === null && w.expiresAt.getTime() > args.where.expiresAt.gt.getTime(),
        );
        cibles.forEach((w) => {
          w.provenAt = args.data.provenAt;
        });
        return { count: cibles.length };
      },
    },
  };
  return { store: store as never, watches };
};

const MARIE: UserRow = { id: 'user-marie', email: 'marie@example.com', isActive: true, emailVerificationExpiry: dans(15) };

describe('émettre une attente', () => {
  it('rend un jeton opaque d’au moins 32 octets, base64url, et ne stocke que son empreinte', async () => {
    const { store, watches } = magasin([MARIE]);
    const jeton = await issueEmailVerificationWatch(store, { email: 'Marie@Example.com', now: MAINTENANT });

    expect(jeton).toMatch(/^[A-Za-z0-9_-]{43,}$/);
    expect(watches).toHaveLength(1);
    expect(watches[0].tokenHash).toBe(sha256(jeton));
    expect(JSON.stringify(watches)).not.toContain(jeton);
  });

  it('se lie au compte et expire avec le code en cours', async () => {
    const { store, watches } = magasin([MARIE]);
    await issueEmailVerificationWatch(store, { email: 'marie@example.com', now: MAINTENANT });

    expect(watches[0]).toMatchObject({ userId: 'user-marie', expiresAt: dans(15), provenAt: null });
  });

  it('deux demandes rendent deux jetons distincts', async () => {
    const { store } = magasin([MARIE]);
    const a = await issueEmailVerificationWatch(store, { email: 'marie@example.com', now: MAINTENANT });
    const b = await issueEmailVerificationWatch(store, { email: 'marie@example.com', now: MAINTENANT });

    expect(a).not.toBe(b);
  });

  it('sans compte actif : une attente NON liée, qui ne sera jamais prouvée — la réponse ne dit pas qu’il manque un compte', async () => {
    const supprime: UserRow = { ...MARIE, isActive: false };
    const { store, watches } = magasin([supprime]);
    const jeton = await issueEmailVerificationWatch(store, { email: 'marie@example.com', now: MAINTENANT });

    expect(jeton).toMatch(/^[A-Za-z0-9_-]{43,}$/);
    expect(watches[0]).toMatchObject({ userId: null, expiresAt: new Date(MAINTENANT.getTime() + EMAIL_VERIFICATION_WATCH_FALLBACK_TTL_MS) });
    expect(await readEmailVerificationWatch(store, jeton, MAINTENANT)).toEqual({ kind: 'pending' });
  });

  it('un code déjà expiré : l’attente prend la durée de repli, jamais une date passée', async () => {
    const { store, watches } = magasin([{ ...MARIE, emailVerificationExpiry: dans(-1) }]);
    await issueEmailVerificationWatch(store, { email: 'marie@example.com', now: MAINTENANT });

    expect(watches[0].expiresAt.getTime()).toBe(MAINTENANT.getTime() + EMAIL_VERIFICATION_WATCH_FALLBACK_TTL_MS);
  });
});

describe('lire une attente', () => {
  it('« pending » tant que l’adresse n’est pas prouvée', async () => {
    const { store } = magasin([MARIE]);
    const jeton = await issueEmailVerificationWatch(store, { email: 'marie@example.com', now: MAINTENANT });

    expect(await readEmailVerificationWatch(store, jeton, dans(1))).toEqual({ kind: 'pending' });
  });

  it('« proven » dès que la preuve (code ou lien, où que ce soit) a marqué le compte', async () => {
    const { store } = magasin([MARIE]);
    const jeton = await issueEmailVerificationWatch(store, { email: 'marie@example.com', now: MAINTENANT });
    await markEmailVerificationWatchesProven(store, { userId: 'user-marie', now: dans(2) });

    expect(await readEmailVerificationWatch(store, jeton, dans(3))).toEqual({ kind: 'proven' });
  });

  it('la preuve d’un AUTRE compte ne marque rien', async () => {
    const { store } = magasin([MARIE]);
    const jeton = await issueEmailVerificationWatch(store, { email: 'marie@example.com', now: MAINTENANT });
    await markEmailVerificationWatchesProven(store, { userId: 'user-paul', now: dans(2) });

    expect(await readEmailVerificationWatch(store, jeton, dans(3))).toEqual({ kind: 'pending' });
  });

  it('une attente EXPIRÉE ne se marque plus et se lit « expired »', async () => {
    const { store } = magasin([MARIE]);
    const jeton = await issueEmailVerificationWatch(store, { email: 'marie@example.com', now: MAINTENANT });
    await markEmailVerificationWatchesProven(store, { userId: 'user-marie', now: dans(16) });

    expect(await readEmailVerificationWatch(store, jeton, dans(16))).toEqual({ kind: 'expired' });
  });

  it('une attente prouvée reste « proven » après son expiration — l’écran peut encore le dire', async () => {
    const { store } = magasin([MARIE]);
    const jeton = await issueEmailVerificationWatch(store, { email: 'marie@example.com', now: MAINTENANT });
    await markEmailVerificationWatchesProven(store, { userId: 'user-marie', now: dans(2) });

    expect(await readEmailVerificationWatch(store, jeton, dans(30))).toEqual({ kind: 'proven' });
  });

  it.each([['inconnu', 'pas-un-jeton-emis'], ['vide', ''], ['blanc', '   ']])('un jeton %s se lit « unknown »', async (_cas, jeton) => {
    const { store } = magasin([MARIE]);

    expect(await readEmailVerificationWatch(store, jeton, MAINTENANT)).toEqual({ kind: 'unknown' });
  });

  it('la lecture ne rend ni l’adresse ni le compte', async () => {
    const { store } = magasin([MARIE]);
    const jeton = await issueEmailVerificationWatch(store, { email: 'marie@example.com', now: MAINTENANT });
    const lu = await readEmailVerificationWatch(store, jeton, MAINTENANT);

    expect(JSON.stringify(lu)).not.toMatch(/marie|user-marie/);
  });
});

describe('la réponse « vérification requise » porte le jeton, sans en dépendre', () => {
  it('rend `{ pendingSessionToken }` à étaler dans la réponse', async () => {
    const { store, watches } = magasin([MARIE]);
    const champ = await pendingSessionTokenFor(store, 'marie@example.com');

    expect(champ.pendingSessionToken).toMatch(/^[A-Za-z0-9_-]{43,}$/);
    expect(watches).toHaveLength(1);
  });

  it('une panne du magasin rend `{}` : le code est parti, la réponse part sans le jeton', async () => {
    const enPanne = {
      user: { findFirst: async () => { throw new Error('mongo'); } },
      emailVerificationWatch: {},
    };

    expect(await pendingSessionTokenFor(enPanne as never, 'marie@example.com')).toEqual({});
  });
});
