/**
 * Le canal REST des accusés NOMINATIFS honore la loi de cercle (#19385,
 * MSG-04 de #14107).
 *
 * `filterReadReceiptVisible` était la forme que la loi de PRÉSENCE a
 * SUPPRIMÉE : un résolveur de confidentialité **sans viewer**
 * (`resolvePrefsOnly`, retiré par la directive du 2026-08-25 et interdit par
 * une garde de source). Une résolution aveugle au viewer ne PEUT PAS porter une
 * loi par paire, et c'est pourquoi `dm.readReceipts` n'avait nulle part où
 * s'appliquer.
 *
 * ─── LA PRÉCONDITION ────────────────────────────────────────────────────────
 *
 * Un sujet à `ACQUAINTANCE` ou au-dessus rend le même verdict avec et sans la
 * loi. Chaque témoin de masquage construit donc un sujet SOUS le plancher.
 *
 * Et le témoin exerce la VRAIE loi sur le monde en mémoire des cercles : un
 * double qui rendrait le verdict attesterait la garde à la place du code.
 *
 * @jest-environment node
 */
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { MessageReadStatusService } from '../../../services/MessageReadStatusService';
import { clearPrivacyPreferencesCache } from '../../../services/preferences/privacy-cache';
import { ADULT_BIRTH, messagingWorld, type CircleLink } from '../../helpers/messaging-circle-world';

const DEMANDEUR = '6400000000000000000000d1';
const CONNAISSANCE = '6400000000000000000000d2';
const INCONNU = '6400000000000000000000d3';

const P_DEMANDEUR = '7400000000000000000000d1';
const P_CONNAISSANCE = '7400000000000000000000d2';
const P_INCONNU = '7400000000000000000000d3';
const P_INVITE = '7400000000000000000000d4';

const IDENTITES = [
  { id: P_DEMANDEUR, userId: DEMANDEUR },
  { id: P_CONNAISSANCE, userId: CONNAISSANCE },
  { id: P_INCONNU, userId: INCONNU },
  // Un invité de lien : pas de compte, donc pas de cercle — jamais masqué par
  // la loi (seule sa préférence, qu'il n'a pas, pourrait le taire).
  { id: P_INVITE, userId: null },
];

const LIENS_NOMINAUX: readonly CircleLink[] = [[DEMANDEUR, CONNAISSANCE, 'ACQUAINTANCE']];

function service(options: { links?: readonly CircleLink[]; optOut?: readonly string[] } = {}) {
  const world = messagingWorld({
    links: options.links ?? LIENS_NOMINAUX,
    users: [DEMANDEUR, CONNAISSANCE, INCONNU].map((id) => ({
      id,
      birthDate: ADULT_BIRTH,
      username: id,
      displayName: id,
      blockedUserIds: [],
    })),
  });
  const prisma = {
    ...world.prisma,
    userPreferences: {
      findMany: jest.fn(async () =>
        (options.optOut ?? []).map((userId) => ({ userId, privacy: { showReadReceipts: false } }))
      ),
    },
    userPreference: { findMany: jest.fn(async () => [] as unknown[]) },
  };
  return new MessageReadStatusService(prisma as never);
}

const visibles = async (svc: MessageReadStatusService, viewer: string | null) =>
  (await svc.filterReadReceiptVisible(IDENTITES, viewer)).map((row) => row.id).sort();

describe('filterReadReceiptVisible — le cercle décide de QUI on voit les accusés (#19385)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    clearPrivacyPreferencesCache();
  });

  it('masque l\'INCONNU au demandeur, garde la Connaissance et l\'invité', async () => {
    expect(await visibles(service(), DEMANDEUR)).toEqual(
      [P_DEMANDEUR, P_CONNAISSANCE, P_INVITE].sort()
    );
  });

  it('ne masque personne quand tous les inscrits sont au moins Connaissance', async () => {
    const svc = service({
      links: [
        [DEMANDEUR, CONNAISSANCE, 'ACQUAINTANCE'],
        [DEMANDEUR, INCONNU, 'CLOSE'],
      ],
    });

    expect(await visibles(svc, DEMANDEUR)).toEqual(IDENTITES.map((i) => i.id).sort());
  });

  it('un demandeur SANS compte garde le régime d\'avant — la loi ne lui masque personne', async () => {
    expect(await visibles(service(), null)).toEqual(IDENTITES.map((i) => i.id).sort());
    // NON-VACUITÉ : le même monde masque bien l'inconnu à un demandeur inscrit.
    expect(await visibles(service(), DEMANDEUR)).not.toContain(P_INCONNU);
  });

  it('la LOI et la PRÉFÉRENCE se cumulent — aucune n\'annule l\'autre', async () => {
    // La Connaissance s'est retirée (préférence), l'inconnu est hors cercle
    // (loi) : les deux disparaissent, par deux gardes différentes.
    const svc = service({ optOut: [CONNAISSANCE] });

    expect(await visibles(svc, DEMANDEUR)).toEqual([P_DEMANDEUR, P_INVITE].sort());
  });

  it('la loi n\'OUVRE jamais ce que la préférence a tu', async () => {
    // Niveau largement suffisant, mais le sujet s'est retiré : il reste masqué.
    const svc = service({
      links: [
        [DEMANDEUR, CONNAISSANCE, 'BLOOD'],
        [DEMANDEUR, INCONNU, 'BLOOD'],
      ],
      optOut: [INCONNU],
    });

    expect(await visibles(svc, DEMANDEUR)).toEqual([P_DEMANDEUR, P_CONNAISSANCE, P_INVITE].sort());
  });

  it('LÈVE quand la loi de cercle est illisible — la porte ferme, elle ne sert pas', async () => {
    const world = messagingWorld({
      links: LIENS_NOMINAUX,
      users: [{ id: DEMANDEUR, birthDate: ADULT_BIRTH, username: 'd', displayName: 'd', blockedUserIds: [] }],
    });
    const prisma = {
      ...world.prisma,
      userRelation: {
        ...world.prisma.userRelation,
        findMany: () => Promise.reject(new Error('base indisponible')),
      },
      userPreferences: { findMany: jest.fn(async () => [] as unknown[]) },
      userPreference: { findMany: jest.fn(async () => [] as unknown[]) },
    };
    const svc = new MessageReadStatusService(prisma as never);

    await expect(svc.filterReadReceiptVisible(IDENTITES, DEMANDEUR)).rejects.toThrow(
      'base indisponible'
    );
  });
});
