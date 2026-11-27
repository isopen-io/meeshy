/**
 * #20542 — une alerte de proximité entre Sangs ne survit ni à l'effacement de l'historique, ni au
 * retrait du consentement `location.proximity`. Les lignes sont SUPPRIMÉES puis ANNONCÉES ; le monde
 * de la base évalue le filtre reçu (type, destinataire, acteur), il ne rend pas une liste fixée.
 *
 * @jest-environment node
 */
import { describe, it, expect } from '@jest/globals';
import { BLOOD_PROXIMITY_NOTIFICATION_TYPE } from '@meeshy/shared/types/blood-location';
import { eraseBloodLocationHistory } from '../../../../services/bloodLocation/bloodLocationService';
import {
  bloodProximityRetractionFilter,
  retractBloodProximityNotices,
  type BloodProximityRetraction,
} from '../../../../services/bloodLocation/bloodProximityRetraction';
import type { RetractedNotification } from '../../../../services/notifications/retractedNotifications';
import { MOI, SANG, AUTRE_SANG, bloodWorldAvecConsentements } from '../../../helpers/blood-location-world';

type Ligne = { readonly id: string; readonly userId: string; readonly type: string; readonly acteur: string; readonly pushSent: boolean };

const ligne = (id: string, userId: string, acteur: string, type: string = BLOOD_PROXIMITY_NOTIFICATION_TYPE): Ligne => ({ id, userId, type, acteur, pushSent: true });

type Clause = Record<string, unknown>;
const oid = (value: unknown): unknown => (value && typeof value === 'object' && '$oid' in value ? (value as { $oid: string }).$oid : value);
const matches = (row: Ligne, clause: Clause): boolean =>
  Object.entries(clause).every(([key, value]) => {
    if (key === '$or') return (value as Clause[]).some((branch) => matches(row, branch));
    if (key === 'type') return row.type === value;
    if (key === 'userId') return row.userId === oid(value);
    if (key === 'actor.id') return row.acteur === value;
    throw new Error(`clause inattendue : ${key}`);
  });

function base(rows: readonly Ligne[]) {
  const restantes = [...rows];
  const annonces: RetractedNotification[][] = [];
  const prisma = {
    notification: {
      findRaw: async (args: { filter: Clause }) =>
        restantes.filter((row) => matches(row, args.filter)).map((row) => ({ _id: { $oid: row.id }, userId: { $oid: row.userId }, type: row.type, context: {}, delivery: { pushSent: row.pushSent } })),
      deleteMany: async (args: { where: { id: { in: string[] } } }) => {
        const ids = new Set(args.where.id.in);
        const avant = restantes.length;
        restantes.splice(0, restantes.length, ...restantes.filter((row) => !ids.has(row.id)));
        return { count: avant - restantes.length };
      },
    },
  };
  const announcer = { announceNotificationsRetracted: async (r: readonly RetractedNotification[]) => { annonces.push([...r]); } };
  return { prisma: prisma as never, announcer, restantes, annonces };
}

const AILLEURS = '6900000000000000000000c9';

describe('#20542 — le retrait des alertes de proximité', () => {
  const monde = () =>
    base([
      ligne('n1', SANG, MOI),
      ligne('n2', AUTRE_SANG, MOI),
      ligne('n3', MOI, SANG),
      ligne('n4', SANG, AUTRE_SANG),
      ligne('n5', SANG, MOI, 'device_unreachable'),
      ligne('n6', AILLEURS, AUTRE_SANG),
    ]);

  it('effacer mon historique retire toute alerte qui me nomme, chez tous mes Sangs, et celles de ma cloche', async () => {
    const m = monde();
    await expect(retractBloodProximityNotices(m.prisma, m.announcer, { kind: 'everywhere', ownerId: MOI })).resolves.toBe(3);
    expect(m.restantes.map((row) => row.id)).toEqual(['n4', 'n5', 'n6']);
    expect(m.annonces).toEqual([[{ id: 'n1', userId: SANG, pushSent: true }, { id: 'n2', userId: AUTRE_SANG, pushSent: true }, { id: 'n3', userId: MOI, pushSent: true }]]);
  });

  it('retirer la proximité à UN Sang ne retire que les alertes qui me nomment chez lui', async () => {
    const m = monde();
    await expect(retractBloodProximityNotices(m.prisma, m.announcer, { kind: 'at', ownerId: MOI, readerId: SANG })).resolves.toBe(1);
    expect(m.restantes.map((row) => row.id)).toEqual(['n2', 'n3', 'n4', 'n5', 'n6']);
  });

  it('aucune ligne : rien supprimé, rien annoncé', async () => {
    const m = base([ligne('n4', SANG, AUTRE_SANG)]);
    await expect(retractBloodProximityNotices(m.prisma, m.announcer, { kind: 'everywhere', ownerId: MOI })).resolves.toBe(0);
    expect(m.restantes).toHaveLength(1);
    expect(m.annonces).toEqual([]);
  });

  it('une annonce en panne ne rend pas le retrait douteux : les lignes sont déjà parties', async () => {
    const m = monde();
    const enPanne = { announceNotificationsRetracted: async () => { throw new Error('socket'); } };
    await expect(retractBloodProximityNotices(m.prisma, enPanne, { kind: 'at', ownerId: MOI, readerId: SANG })).resolves.toBe(1);
  });

  it('le filtre ne vise jamais un autre type, et nomme le destinataire par son ObjectId', () => {
    const scopes: BloodProximityRetraction[] = [{ kind: 'everywhere', ownerId: MOI }, { kind: 'at', ownerId: MOI, readerId: SANG }];
    expect(scopes.map(bloodProximityRetractionFilter)).toEqual([
      { type: BLOOD_PROXIMITY_NOTIFICATION_TYPE, $or: [{ 'actor.id': MOI }, { userId: { $oid: MOI } }] },
      { type: BLOOD_PROXIMITY_NOTIFICATION_TYPE, userId: { $oid: SANG }, 'actor.id': MOI },
    ]);
  });
});

describe('#20542 — effacer l\'historique efface aussi ses alertes', () => {
  it('l\'effacement demande le retrait de toute alerte qui nomme le titulaire', async () => {
    const w = bloodWorldAvecConsentements();
    const retraits: BloodProximityRetraction[] = [];
    await eraseBloodLocationHistory({ ...w.deps, retractProximityNotices: async (scope) => { retraits.push(scope); return 0; } }, MOI);
    expect(retraits).toEqual([{ kind: 'everywhere', ownerId: MOI }]);
  });

  it('un retrait en panne fait échouer l\'effacement : le titulaire le sait et peut le rejouer', async () => {
    const w = bloodWorldAvecConsentements();
    await expect(eraseBloodLocationHistory({ ...w.deps, retractProximityNotices: async () => { throw new Error('mongo'); } }, MOI)).rejects.toThrow('mongo');
  });
});
