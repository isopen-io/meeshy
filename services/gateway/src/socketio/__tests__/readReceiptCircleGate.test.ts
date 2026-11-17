/**
 * La loi de CERCLE des accusés de lecture, exercée CHEZ ELLE (#19385, MSG-04
 * de #14107).
 *
 * `dm.readReceipts` était déclarée au catalogue (`relation-levels.ts`) et
 * appliquée NULLE PART, quand son jumeau `dm.typing` — même lot, même plancher
 * `ACQUAINTANCE` — l'était. Ces témoins exercent la descente contre la VRAIE
 * loi (`pairAccessAmong` → `resolveRelationAccess`) sur le monde en mémoire des
 * cercles : un double qui rendrait le verdict attesterait la garde à la place
 * du code qui la porte.
 *
 * ─── LA PRÉCONDITION, ÉCRITE AVANT LE PREMIER TÉMOIN ────────────────────────
 *
 * Un témoin posé sur une paire à `ACQUAINTANCE` ou au-dessus NE PEUT PAS
 * tomber : la loi juste et l'absence de loi y rendent le même verdict
 * (`allowed: true`). Chaque témoin de REFUS construit donc explicitement une
 * paire SOUS le plancher — `PUBLIC` (aucun lien) ou `COMMUNITY` — et c'est la
 * seule forme capable d'accuser un gate manquant (leçon 261 : un témoin de RANG
 * s'écrit sur un rang AUTRE que le premier).
 *
 * @jest-environment node
 */
import { describe, it, expect } from '@jest/globals';
import {
  readReceiptDeniedAmong,
  readReceiptHiddenFromViewer,
  receiptViewerOf,
} from '../readReceiptCircleGate';
import { ADULT_BIRTH, messagingWorld, type CircleLink } from '../../__tests__/helpers/messaging-circle-world';

const LECTEUR = '6400000000000000000000b1';
const CONNAISSANCE = '6400000000000000000000b2';
const INCONNU = '6400000000000000000000b3';
const COMMUNAUTE = '6400000000000000000000b4';
const BLOQUEUR = '6400000000000000000000b5';

const TOUS = [LECTEUR, CONNAISSANCE, INCONNU, COMMUNAUTE, BLOQUEUR];

function monde(links: readonly CircleLink[]) {
  return messagingWorld({
    links,
    users: TOUS.map((id) => ({
      id,
      birthDate: ADULT_BIRTH,
      username: id,
      displayName: id,
      blockedUserIds: id === BLOQUEUR ? [LECTEUR] : [],
    })),
  });
}

const LIENS_NOMINAUX: readonly CircleLink[] = [
  [LECTEUR, CONNAISSANCE, 'ACQUAINTANCE'],
  [LECTEUR, COMMUNAUTE, 'COMMUNITY'],
  [LECTEUR, BLOQUEUR, 'CLOSE'],
];

describe('readReceiptDeniedAmong — le cercle décide qui voit un accusé (#19385)', () => {
  it('refuse l\'INCONNU (aucun lien ⇒ PUBLIC) — le rang qui accuse le gate manquant', async () => {
    const { prisma } = monde(LIENS_NOMINAUX);

    const refuses = await readReceiptDeniedAmong(prisma as never, LECTEUR, [CONNAISSANCE, INCONNU]);

    expect([...refuses]).toEqual([INCONNU]);
  });

  it('refuse la COMMUNAUTÉ — un groupe ne débloque rien (RG-22)', async () => {
    const { prisma } = monde(LIENS_NOMINAUX);

    const refuses = await readReceiptDeniedAmong(prisma as never, LECTEUR, [COMMUNAUTE]);

    expect([...refuses]).toEqual([COMMUNAUTE]);
  });

  it('admet la CONNAISSANCE et au-dessus', async () => {
    const { prisma } = monde([
      [LECTEUR, CONNAISSANCE, 'ACQUAINTANCE'],
      [LECTEUR, INCONNU, 'CLOSE'],
      [LECTEUR, COMMUNAUTE, 'BLOOD'],
    ]);

    const refuses = await readReceiptDeniedAmong(prisma as never, LECTEUR, [CONNAISSANCE, INCONNU, COMMUNAUTE]);

    expect([...refuses]).toEqual([]);
  });

  it('refuse un BLOQUEUR même à CLOSE — le blocage prime le niveau', async () => {
    const { prisma } = monde(LIENS_NOMINAUX);

    const refuses = await readReceiptDeniedAmong(prisma as never, LECTEUR, [BLOQUEUR]);

    expect([...refuses]).toEqual([BLOQUEUR]);
  });

  it('n\'interroge rien pour une liste vide, et ne se refuse jamais à lui-même', async () => {
    const { prisma } = monde(LIENS_NOMINAUX);

    expect([...(await readReceiptDeniedAmong(prisma as never, LECTEUR, []))]).toEqual([]);
    expect([...(await readReceiptDeniedAmong(prisma as never, LECTEUR, [LECTEUR]))]).toEqual([]);

    // NON-VACUITÉ : les deux ensembles vides ci-dessus ne valent que si CE
    // monde sait refuser quelqu'un. Sans cette ligne, un gate qui ne refuserait
    // JAMAIS rien passerait les deux assertions précédentes.
    expect([...(await readReceiptDeniedAmong(prisma as never, LECTEUR, [INCONNU]))]).toEqual([INCONNU]);
  });

  it('LÈVE quand la lecture des niveaux échoue — l\'appelant ferme, la loi ne devine pas', async () => {
    const { prisma } = monde(LIENS_NOMINAUX);
    const aveugle = {
      ...prisma,
      userRelation: {
        ...prisma.userRelation,
        findMany: () => Promise.reject(new Error('base indisponible')),
      },
    };

    await expect(readReceiptDeniedAmong(aveugle as never, LECTEUR, [CONNAISSANCE])).rejects.toThrow(
      'base indisponible'
    );
  });
});

describe('readReceiptHiddenFromViewer — l\'autre sens de la loi (#19385)', () => {
  it('cache l\'inconnu au demandeur, garde la Connaissance', async () => {
    const { prisma } = monde(LIENS_NOMINAUX);

    const caches = await readReceiptHiddenFromViewer(prisma as never, LECTEUR, [CONNAISSANCE, INCONNU]);

    expect([...caches]).toEqual([INCONNU]);
  });

  it('cache la COMMUNAUTÉ — un groupe ne débloque rien, dans ce sens non plus', async () => {
    const { prisma } = monde(LIENS_NOMINAUX);

    expect([...(await readReceiptHiddenFromViewer(prisma as never, LECTEUR, [COMMUNAUTE]))]).toEqual([
      COMMUNAUTE,
    ]);
  });

  it('cache un bloqueur, et ne se cache jamais à lui-même', async () => {
    const { prisma } = monde(LIENS_NOMINAUX);

    expect([...(await readReceiptHiddenFromViewer(prisma as never, LECTEUR, [BLOQUEUR]))]).toEqual([
      BLOQUEUR,
    ]);
    expect([...(await readReceiptHiddenFromViewer(prisma as never, LECTEUR, [LECTEUR]))]).toEqual([]);
  });

  it('un demandeur SANS compte garde le régime d\'avant : la loi ne lui cache personne', async () => {
    const { prisma } = monde(LIENS_NOMINAUX);

    const caches = await readReceiptHiddenFromViewer(prisma as never, null, [INCONNU, COMMUNAUTE]);

    expect([...caches]).toEqual([]);
    // NON-VACUITÉ : le même monde CACHE bien ces deux-là à un demandeur inscrit.
    expect([...(await readReceiptHiddenFromViewer(prisma as never, LECTEUR, [INCONNU, COMMUNAUTE]))]).toEqual([
      INCONNU,
      COMMUNAUTE,
    ]);
  });

  it('LÈVE quand la loi est illisible — l\'appelant ferme', async () => {
    const { prisma } = monde(LIENS_NOMINAUX);
    const aveugle = {
      ...prisma,
      userRelation: { ...prisma.userRelation, findMany: () => Promise.reject(new Error('base indisponible')) },
    };

    await expect(
      readReceiptHiddenFromViewer(aveugle as never, LECTEUR, [CONNAISSANCE])
    ).rejects.toThrow('base indisponible');
  });
});

/**
 * `receiptViewerOf` — le dérivateur du viewer, et le seul maillon entre le
 * contexte d'authentification et la loi.
 *
 * Il a SA suite parce qu'une campagne de mutation a mesuré qu'il n'en avait
 * pas : « le viewer est toujours nul » laissait les 22 témoins du lot VERTS,
 * alors que cette mutation retire la loi des TROIS portes REST d'un coup —
 * celles-ci passant par lui et non par un viewer écrit à la main. Un correctif
 * dont la valeur n'atteint aucune porte n'a corrigé personne.
 */
describe('receiptViewerOf — le viewer de la loi, dérivé une fois (#19385)', () => {
  it('rend le `User.id` d\'un inscrit', () => {
    expect(receiptViewerOf({ userId: LECTEUR, isAnonymous: false })).toBe(LECTEUR);
  });

  it('rend `null` pour un invité de lien — son `userId` est un `Participant.id`', () => {
    // Le `gateway/CLAUDE.md` avertit que recopier cette clé dans un champ qui
    // déclare un `User.id` est une faute : elle nomme une ROOM, pas un compte.
    expect(receiptViewerOf({ userId: '7400000000000000000000zz', isAnonymous: true })).toBeNull();
  });

  it('rend `null` sur un contexte absent ou sans identité', () => {
    expect(receiptViewerOf(null)).toBeNull();
    expect(receiptViewerOf(undefined)).toBeNull();
    expect(receiptViewerOf({})).toBeNull();
    expect(receiptViewerOf({ userId: '' })).toBeNull();
  });

  it('un contexte inscrit SANS drapeau est un inscrit — `isAnonymous` absent n\'anonymise pas', () => {
    expect(receiptViewerOf({ userId: LECTEUR })).toBe(LECTEUR);
  });
});
