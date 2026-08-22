/**
 * DMA Signal Protocol — un message chiffré par un bout se déchiffre à l'autre
 *
 * C'est le témoin que la « quatrième famille » réclamait depuis le cycle 94 :
 * rien ne gardait contre deux moitiés d'un même protocole chacune COHÉRENTE
 * AVEC ELLE-MÊME et fausses l'une contre l'autre. Le cycle 97 a construit la
 * confrontation au niveau de X3DH ; elle s'arrêtait au HKDF. Tout ce qui compose
 * ce résultat ensuite — l'orientation des chaînes, le choix des DH — restait
 * hors de portée, et c'est là que vivaient les défauts que ce fichier expose.
 *
 * Les deux bouts sont ici des PRODUCTIONS réelles : deux `SignalProtocolEngine`
 * distincts, chacun avec son `SignalKeyManager`, son X3DH et son Double Ratchet,
 * au-dessus de tables en mémoire. Aucun corps de méthode de production n'est
 * recopié — la seule chose que ce fichier fabrique est la BASE, c'est-à-dire ce
 * que chaque partie publie de soi et que l'autre lit.
 *
 * Les affirmations sont SÉPARÉES, et la séparation est le diagnostic :
 *
 *   1. le secret partagé coïncide          → les quatre DH sont bien disposés
 *   2. les chaînes sont CROISÉES           → l'émission d'un bout est la
 *                                            réception de l'autre
 *   3. le texte clair fait l'aller-retour  → la composition entière tient
 *
 * Un unique `expect` sur le texte clair laisserait chercher dans les trois.
 *
 * @see services/gateway/src/dma-interoperability/signal-protocol/SignalProtocolEngine.ts
 * @see services/gateway/src/__tests__/unit/dma-x3dh-derivation-symmetry.test.ts (cycle 97)
 */

import * as crypto from 'crypto';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { SignalProtocolEngine } from '../../dma-interoperability/signal-protocol/SignalProtocolEngine';
import type { DoubleRatchetSession } from '../../dma-interoperability/signal-protocol/DoubleRatchet';

const ALICE_USER_ID = '507f1f77bcf86cd799439011';
const BOB_USER_ID = '507f1f77bcf86cd799439012';
const ALICE_DMA_ID = 'wa-alice';
const BOB_DMA_ID = 'wa-bob';

/**
 * Ce que `SignalKeyManager` écrit et relit de lui-même. Une seule table suffit :
 * c'est la seule que le gestionnaire de clés touche.
 */
type BundleRow = {
  userId: string;
  identityKey: string;
  identityKeyPrivate: string;
  registrationId: number;
  signedPreKeyId: number;
  signedPreKeyPublic: string;
  signedPreKeyPrivate?: string;
  signedPreKeySignature: string;
  preKeyPool?: string | null;
  lastRotatedAt?: Date;
  isActive?: boolean;
};

type PreKeyPoolEntry = { id: number; publicKey: string; privateKey: string };

/**
 * La table `SignalPreKeyBundle` en mémoire, avec les trois seules opérations que
 * le gestionnaire de clés en demande. Elle se comporte comme la vraie sur le
 * point qui compte : `update` sur une ligne absente LÈVE, ce qui impose l'ordre
 * réel (identité d'abord, pré-clés ensuite).
 */
const createBundleTable = () => {
  const rows = new Map<string, BundleRow>();

  return {
    rows,
    findUnique: jest.fn(async ({ where }: { where: { userId: string } }) => rows.get(where.userId) ?? null),
    update: jest.fn(async ({ where, data }: { where: { userId: string }; data: Partial<BundleRow> }) => {
      const row = rows.get(where.userId);
      if (!row) {
        throw new Error(`SignalPreKeyBundle not found for ${where.userId}`);
      }
      Object.assign(row, data);
      return row;
    }),
    upsert: jest.fn(
      async ({
        where,
        update,
        create,
      }: {
        where: { userId: string };
        update: Partial<BundleRow>;
        create: BundleRow;
      }) => {
        const existing = rows.get(where.userId);
        if (existing) {
          Object.assign(existing, update);
          return existing;
        }
        const row: BundleRow = { ...create, preKeyPool: null, lastRotatedAt: new Date(), isActive: true };
        rows.set(where.userId, row);
        return row;
      }
    ),
  };
};

type BundleTable = ReturnType<typeof createBundleTable>;

/**
 * Le client Prisma d'UNE partie. `directory` est ce que la partie d'en face
 * publie : l'annuaire, c'est-à-dire le seul canal par lequel les deux bouts se
 * connaissent.
 */
const createPrismaDouble = (bundles: BundleTable, directory: () => { enrollment: Record<string, unknown>; preKeyRow: Record<string, unknown> | null }) =>
  ({
    signalPreKeyBundle: bundles,
    dMASession: {
      findMany: jest.fn(async () => []),
      upsert: jest.fn(async () => ({})),
    },
    // Ce que l'INITIATEUR lit du destinataire : une pré-clé libre, et
    // l'inscription qui la porte.
    preKey: {
      findMany: jest.fn(async () => {
        const row = directory().preKeyRow;
        return row ? [row] : [];
      }),
    },
    // Ce que le RÉPONDEUR lit de l'expéditeur.
    dMAEnrollment: {
      findUnique: jest.fn(async () => directory().enrollment),
    },
  } as unknown as PrismaClient);

/**
 * L'inscription publiée par une partie, dérivée de sa ligne de bundle — donc de
 * ce que sa PRODUCTION a réellement écrit, jamais d'une valeur fabriquée ici.
 */
const publishedEnrollment = (row: BundleRow) => ({
  whatsappInternalId: row.userId === ALICE_USER_ID ? ALICE_DMA_ID : BOB_DMA_ID,
  identityKey: row.identityKey,
  signedPreKey: row.signedPreKeyPublic,
  signedPreKeySignature: row.signedPreKeySignature,
  signedPreKeyId: row.signedPreKeyId,
  registrationId: row.registrationId,
});

const publishedPreKey = (row: BundleRow) => {
  const pool = row.preKeyPool ? (JSON.parse(row.preKeyPool) as PreKeyPoolEntry[]) : [];
  const first = pool[0];
  if (!first) {
    return null;
  }
  return {
    id: `prekey-${first.id}`,
    preKeyId: first.id,
    keyData: first.publicKey,
    isUsed: false,
    signalEnrollment: publishedEnrollment(row),
  };
};

/**
 * Une partie complète : sa production, et l'accès en LECTURE à l'état de session
 * que cette production tient. L'observation passe par le champ privé parce que
 * le moteur n'expose pas ses sessions ; elle n'y SUBSTITUE rien — la production
 * reste seule à écrire.
 */
const createParty = async (userId: string, directory: () => { enrollment: Record<string, unknown>; preKeyRow: Record<string, unknown> | null }) => {
  const bundles = createBundleTable();
  const prisma = createPrismaDouble(bundles, directory);
  const engine = new SignalProtocolEngine(prisma);
  engine.setUserId(userId);
  await engine.initialize();

  return {
    engine,
    bundles,
    row: () => bundles.rows.get(userId) as BundleRow,
    session: (peerDmaId: string): DoubleRatchetSession | undefined =>
      (engine as unknown as { ratchetSessions: Map<string, DoubleRatchetSession> }).ratchetSessions.get(peerDmaId),
  };
};

describe('DMA Signal Protocol — aller-retour entre deux productions', () => {
  jest.setTimeout(30000);

  let alice: Awaited<ReturnType<typeof createParty>>;
  let bob: Awaited<ReturnType<typeof createParty>>;

  beforeEach(async () => {
    // L'annuaire est résolu PARESSEUSEMENT : chaque partie doit exister avant
    // que l'autre puisse la lire, et les deux se lisent mutuellement.
    let bobRow: () => BundleRow;
    let aliceRow: () => BundleRow;

    bob = await createParty(BOB_USER_ID, () => ({
      enrollment: publishedEnrollment(aliceRow()),
      preKeyRow: publishedPreKey(aliceRow()),
    }));
    bobRow = () => bob.row();

    alice = await createParty(ALICE_USER_ID, () => ({
      enrollment: publishedEnrollment(bobRow()),
      preKeyRow: publishedPreKey(bobRow()),
    }));
    aliceRow = () => alice.row();
  });

  it('établit un secret partagé IDENTIQUE des deux côtés', async () => {
    const message = await alice.engine.encryptMessage('Bonjour', BOB_DMA_ID);
    await bob.engine.decryptMessage(message, ALICE_DMA_ID);

    const aliceSession = alice.session(BOB_DMA_ID);
    const bobSession = bob.session(ALICE_DMA_ID);

    expect(aliceSession).toBeDefined();
    expect(bobSession).toBeDefined();
    // La clé racine est ce que les quatre DH et le HKDF produisent ensemble :
    // elle diverge dès qu'un seul DH est disposé autrement d'un bout à l'autre.
    expect(bobSession!.rootKey.equals(aliceSession!.rootKey)).toBe(true);
  });

  it('CROISE les chaînes : ce qu\'un bout émet est ce que l\'autre reçoit', async () => {
    const message = await alice.engine.encryptMessage('Bonjour', BOB_DMA_ID);
    await bob.engine.decryptMessage(message, ALICE_DMA_ID);

    const aliceSession = alice.session(BOB_DMA_ID)!;
    const bobSession = bob.session(ALICE_DMA_ID)!;

    // Les deux chaînes ont avancé du MÊME pas (un message émis d'un côté, le
    // même reçu de l'autre), donc l'égalité qui les lie survit à l'avance : la
    // chaîne d'émission d'Alice est toujours la chaîne de réception de Bob.
    expect(bobSession.chainKeyReceive.equals(aliceSession.chainKeySend)).toBe(true);
    // Et le sens inverse, qu'aucun message n'a encore fait avancer.
    expect(bobSession.chainKeySend.equals(aliceSession.chainKeyReceive)).toBe(true);

    // La forme EXACTE du défaut : le double croisement rendait les deux sessions
    // SEMBLABLES au lieu de complémentaires — même moitié, même rôle.
    expect(bobSession.chainKeySend.equals(aliceSession.chainKeySend)).toBe(false);
  });

  it('déchiffre à l\'autre bout le texte clair chiffré par le premier', async () => {
    const plaintext = 'Bonjour, ceci traverse le prisme linguistique.';

    const message = await alice.engine.encryptMessage(plaintext, BOB_DMA_ID);
    const decrypted = await bob.engine.decryptMessage(message, ALICE_DMA_ID);

    expect(decrypted).toBe(plaintext);
  });

  it('déchiffre une SUITE de messages dans l\'ordre', async () => {
    const sent = ['un', 'deux', 'trois'];
    const received: string[] = [];

    for (const text of sent) {
      const message = await alice.engine.encryptMessage(text, BOB_DMA_ID);
      received.push(await bob.engine.decryptMessage(message, ALICE_DMA_ID));
    }

    expect(received).toEqual(sent);
  });

  it('vérifie la signature de l\'expéditeur quand la clé d\'identité est fournie', async () => {
    const plaintext = 'signé';
    const message = await alice.engine.encryptMessage(plaintext, BOB_DMA_ID);
    const aliceIdentityKey = Buffer.from(alice.row().identityKey, 'base64');

    await expect(bob.engine.decryptMessage(message, ALICE_DMA_ID, aliceIdentityKey)).resolves.toBe(plaintext);

    // Et une signature RETIRÉE ne franchit pas la garde (cycle 96).
    const stripped = { ...message, signature: Buffer.alloc(0) };
    await expect(
      bob.engine.decryptMessage(stripped, ALICE_DMA_ID, aliceIdentityKey)
    ).rejects.toThrow(/signature/i);
  });
});
