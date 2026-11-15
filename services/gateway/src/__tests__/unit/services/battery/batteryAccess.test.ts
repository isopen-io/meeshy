/**
 * QUI REÇOIT LA BATTERIE (#14147, spec § 2) — jugé sur les lectures vraies du monde des
 * cercles (`messagingWorld`), jamais sur un verdict injecté : Ami rien, Proche seulement
 * consenti, Sang par défaut sauf refus, équipe comme entre Sangs, bloqué et désactivé rien.
 *
 * @jest-environment node
 */
import { describe, it, expect } from '@jest/globals';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { batteryAccessAmong, batteryCandidatesOf, isServed } from '../../../../services/battery/batteryAccess';
import { withdrawRitualSharesOfUser, withdrawSharesAfterDrop, withdrawSharesTheLinkDoesNotOpen } from '../../../../services/relations/ritualShareWithdrawal';
import { ADULT_BIRTH, messagingWorld, table, type CircleLink, type Row } from '../../../helpers/messaging-circle-world';

const EMETTEUR = '6300000000000000000000e1';
const AMI = '6300000000000000000000f1';
const PROCHE = '6300000000000000000000c1';
const PROCHE_CONSENTI = '6300000000000000000000c2';
const SANG = '6300000000000000000000b1';
const SANG_REFUSE = '6300000000000000000000b2';
const BLOQUEUR = '6300000000000000000000d1';
const DESACTIVE = '6300000000000000000000d2';
const ANALYSTE = '6300000000000000000000a1';
const ADMIN = '6300000000000000000000a2';
const ORDINAIRE = '6300000000000000000000a3';

const LIENS: readonly CircleLink[] = [
  [EMETTEUR, AMI, 'FRIEND'],
  [EMETTEUR, PROCHE, 'CLOSE'],
  [EMETTEUR, PROCHE_CONSENTI, 'CLOSE'],
  [EMETTEUR, SANG, 'BLOOD'],
  [EMETTEUR, SANG_REFUSE, 'BLOOD'],
  [EMETTEUR, BLOQUEUR, 'BLOOD'],
  [EMETTEUR, DESACTIVE, 'BLOOD'],
];

function monde(options: { readonly settings?: readonly Row[]; readonly emetteur?: Row; readonly roles?: Readonly<Record<string, string>> } = {}) {
  const roles: Readonly<Record<string, string>> = { [ANALYSTE]: 'ANALYST', [ADMIN]: 'ADMIN', ...options.roles };
  const world = messagingWorld({
    links: LIENS,
    users: [EMETTEUR, AMI, PROCHE, PROCHE_CONSENTI, SANG, SANG_REFUSE, BLOQUEUR, DESACTIVE, ANALYSTE, ADMIN, ORDINAIRE].map((id) => ({
      id,
      birthDate: ADULT_BIRTH,
      role: roles[id] ?? 'USER',
      ...(id === BLOQUEUR ? { blockedUserIds: [EMETTEUR] } : {}),
      ...(id === DESACTIVE ? { deactivatedAt: new Date('2026-11-01T00:00:00.000Z') } : {}),
      ...(id === EMETTEUR ? options.emetteur ?? {} : {}),
    })),
  });
  const rows = table([
    { ownerId: EMETTEUR, otherId: PROCHE_CONSENTI, batteryShared: true },
    { ownerId: EMETTEUR, otherId: SANG_REFUSE, batteryShared: false },
    { ownerId: EMETTEUR, otherId: AMI, batteryShared: true },
    ...(options.settings ?? []),
  ]);
  const settings = { ...rows, findUnique: (args: { where: Row; select?: Record<string, unknown> }) => rows.findUnique({ ...args, where: (args.where.ownerId_otherId as Row | undefined) ?? args.where }) };
  return { prisma: { ...world.prisma, relationFeatureSetting: settings } as unknown as PrismaClient };
}

const now = new Date('2026-11-15T10:00:00.000Z');

async function servis(m: ReturnType<typeof monde>, subjectId = EMETTEUR, otherIds: readonly string[] = [AMI, PROCHE, PROCHE_CONSENTI, SANG, SANG_REFUSE, BLOQUEUR, DESACTIVE]) {
  const access = await batteryAccessAmong(m.prisma as never, { subjectId, otherIds, subjectIs: 'target', now });
  return otherIds.filter((id) => isServed(access.get(id)));
}

describe('la loi de la batterie, personne par personne', () => {
  it('Ami : rien, même avec un accord stocké ; Proche : seulement s\'il a reçu l\'accord ; Sang : par défaut, sauf refus', async () => {
    expect(await servis(monde())).toEqual([PROCHE_CONSENTI, SANG]);
  });

  it('bloqué ou désactivé : rien, même entre Sangs', async () => {
    const served = await servis(monde());
    expect(served).not.toContain(BLOQUEUR);
    expect(served).not.toContain(DESACTIVE);
  });

  it('la coupure globale de l\'émetteur ferme tout, accords compris', async () => {
    expect(await servis(monde({ emetteur: { batterySharingDisabledAt: new Date('2026-11-10T00:00:00.000Z') } }))).toEqual([]);
  });

  it('un lecteur qui a choisi « rien » pour cette personne n\'est pas servi ; « critique seulement » l\'est', async () => {
    const m = monde({ settings: [
      { ownerId: SANG, otherId: EMETTEUR, batteryReceive: 'none' },
      { ownerId: PROCHE_CONSENTI, otherId: EMETTEUR, batteryReceive: 'critical' },
    ] });
    const access = await batteryAccessAmong(m.prisma as never, { subjectId: EMETTEUR, otherIds: [SANG, PROCHE_CONSENTI], subjectIs: 'target', now });
    expect(isServed(access.get(SANG))).toBe(false);
    expect(access.get(PROCHE_CONSENTI)).toEqual({ allowed: true, receive: 'critical' });
  });

  it('dans le sens du lecteur, le verdict est le même', async () => {
    const m = monde();
    const access = await batteryAccessAmong(m.prisma as never, { subjectId: SANG, otherIds: [EMETTEUR], subjectIs: 'viewer', now });
    expect(isServed(access.get(EMETTEUR))).toBe(true);
    const refuse = await batteryAccessAmong(m.prisma as never, { subjectId: SANG_REFUSE, otherIds: [EMETTEUR], subjectIs: 'viewer', now });
    expect(isServed(refuse.get(EMETTEUR))).toBe(false);
  });
});

describe('l\'équipe (#16623) — la batterie s\'y applique comme entre Sangs', () => {
  it('ANALYST et ADMIN, sans aucun lien : accordée par défaut, dans les deux sens', async () => {
    const m = monde();
    expect(await servis(m, ANALYSTE, [ADMIN])).toEqual([ADMIN]);
    expect(await servis(m, ADMIN, [ANALYSTE])).toEqual([ANALYSTE]);
  });

  it('l\'équipe face à un utilisateur ordinaire : rien', async () => {
    const m = monde();
    expect(await servis(m, ADMIN, [ORDINAIRE])).toEqual([]);
    expect(await servis(m, ORDINAIRE, [ADMIN])).toEqual([]);
  });

  it('un collègue refusé explicitement ne reçoit rien', async () => {
    const m = monde({ settings: [{ ownerId: ANALYSTE, otherId: ADMIN, batteryShared: false }] });
    expect(await servis(m, ANALYSTE, [ADMIN])).toEqual([]);
  });

  it('les collègues sont des candidats de l\'éventail, à côté des liens', async () => {
    const m = monde();
    expect([...(await batteryCandidatesOf(m.prisma as never, ANALYSTE))]).toEqual([ADMIN]);
    expect([...(await batteryCandidatesOf(m.prisma as never, EMETTEUR))].sort()).toEqual([PROCHE, PROCHE_CONSENTI, SANG, SANG_REFUSE, BLOQUEUR, DESACTIVE].sort());
  });
});

describe('le relevé à la demande — Sang seulement', () => {
  it('un Sang peut le demander, un Proche consenti non, ni un Sang refusé', async () => {
    const m = monde();
    const access = await batteryAccessAmong(m.prisma as never, {
      subjectId: EMETTEUR,
      otherIds: [SANG, PROCHE_CONSENTI, SANG_REFUSE],
      subjectIs: 'target',
      now,
      feature: 'device.battery.pull',
    });
    expect([SANG, PROCHE_CONSENTI, SANG_REFUSE].filter((id) => access.get(id)?.allowed)).toEqual([SANG]);
  });
});

describe('un accord donné à un Proche ne survit pas au cercle d\'en dessous', () => {
  const remonte = (settings: ReturnType<typeof table>) => {
    const world = messagingWorld({
      links: [[EMETTEUR, PROCHE_CONSENTI, 'CLOSE']],
      users: [EMETTEUR, PROCHE_CONSENTI].map((id) => ({ id, birthDate: ADULT_BIRTH, role: 'USER' })),
    });
    return { ...world.prisma, relationFeatureSetting: settings } as unknown as PrismaClient;
  };
  const voit = async (prisma: PrismaClient) =>
    (await batteryAccessAmong(prisma as never, { subjectId: EMETTEUR, otherIds: [PROCHE_CONSENTI], subjectIs: 'target', now })).get(PROCHE_CONSENTI)?.allowed;

  it('baisse sous Proche puis remontée : refusé sans nouvel accord', async () => {
    const m = monde();
    const settings = (m.prisma as unknown as { relationFeatureSetting: ReturnType<typeof table> }).relationFeatureSetting;
    await withdrawSharesAfterDrop(m.prisma as never, { actorId: EMETTEUR, otherId: PROCHE_CONSENTI, level: 'FRIEND', at: now });
    expect(await voit(remonte(settings))).toBe(false);
  });

  it('daté chez l\'acteur, sans date chez l\'autre ; un refus garde sa valeur', async () => {
    const m = monde({ settings: [
      { ownerId: PROCHE_CONSENTI, otherId: EMETTEUR, batteryShared: true },
      { ownerId: EMETTEUR, otherId: PROCHE, batteryShared: false },
    ] });
    const rows = (m.prisma as unknown as { relationFeatureSetting: ReturnType<typeof table> }).relationFeatureSetting.rows;
    await withdrawSharesAfterDrop(m.prisma as never, { actorId: EMETTEUR, otherId: PROCHE_CONSENTI, level: 'ACQUAINTANCE', at: now });
    await withdrawSharesAfterDrop(m.prisma as never, { actorId: EMETTEUR, otherId: PROCHE, level: 'FRIEND', at: now });
    const row = (owner: string, other: string) => rows.find((r) => r.ownerId === owner && r.otherId === other);
    expect(row(EMETTEUR, PROCHE_CONSENTI)).toMatchObject({ batteryShared: null, batteryWithdrawnAt: now });
    expect(row(PROCHE_CONSENTI, EMETTEUR)?.batteryShared).toBeNull();
    expect(row(PROCHE_CONSENTI, EMETTEUR)?.batteryWithdrawnAt).toBeUndefined();
    expect(row(EMETTEUR, PROCHE)?.batteryShared).toBe(false);
  });

  it('une baisse qui reste au Proche garde l\'accord', async () => {
    const m = monde();
    await withdrawSharesAfterDrop(m.prisma as never, { actorId: EMETTEUR, otherId: PROCHE_CONSENTI, level: 'CLOSE', at: now });
    expect(await servis(m, EMETTEUR, [PROCHE_CONSENTI])).toEqual([PROCHE_CONSENTI]);
  });

  it('un compte qui part éteint les accords qu\'il a donnés et reçus ; une réactivation ne les rallume pas', async () => {
    const m = monde({ settings: [{ ownerId: SANG, otherId: EMETTEUR, batteryShared: true }] });
    const settings = (m.prisma as unknown as { relationFeatureSetting: ReturnType<typeof table> }).relationFeatureSetting;
    await withdrawRitualSharesOfUser(m.prisma as never, { userId: EMETTEUR });
    expect(await voit(remonte(settings))).toBe(false);
    expect(settings.rows.find((r) => r.ownerId === SANG)?.batteryShared).toBeNull();
    expect(settings.rows.find((r) => r.otherId === SANG_REFUSE)?.batteryShared).toBe(false);
  });

  it('la fin d\'un accord d\'équipe éteint l\'accord que le lien réel n\'ouvre pas, et garde celui qu\'il ouvre', async () => {
    const m = monde();
    const settings = (m.prisma as unknown as { relationFeatureSetting: ReturnType<typeof table> }).relationFeatureSetting;
    await withdrawSharesTheLinkDoesNotOpen(m.prisma as never, { userId: EMETTEUR, at: now });
    expect(settings.rows.find((r) => r.otherId === AMI)).toMatchObject({ batteryShared: null, batteryWithdrawnAt: now });
    expect(settings.rows.find((r) => r.otherId === PROCHE_CONSENTI)?.batteryShared).toBe(true);
  });
});
