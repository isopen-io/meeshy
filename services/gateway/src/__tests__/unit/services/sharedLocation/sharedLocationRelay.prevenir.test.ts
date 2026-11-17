/**
 * « PRÉVENIR LÉO — IL REÇOIT UNE NOTIFICATION » (#19204). Au démarrage, `notifyRecipients` fait
 * partir `location_share_started` vers chaque destinataire SERVI : la loi `location.temporary`
 * (dès Ami, sans blocage), un compte utilisable, un émetteur hors fantôme. Un nom et une durée,
 * jamais une position. Remplacer le partage ne prévient que les nouveaux venus. Sans la clé
 * (ancien client), rien ne part.
 *
 * @jest-environment node
 */
import { describe, it, expect } from '@jest/globals';
import { startSharedLocation, type SharedLocationStartedNotice } from '../../../../services/sharedLocation/sharedLocationRelay';
import { AMI, CONNAISSANCE, EMETTEUR, HEURE, monde, PARIS, PROCHE, SANG, T0, TOUS } from '../../../helpers/shared-location-relay-world';

const prevenu = () => {
  const m = monde();
  const notices: SharedLocationStartedNotice[] = [];
  const deps = { ...m.deps, notifyStarted: async (batch: readonly SharedLocationStartedNotice[]) => { notices.push(...batch); } };
  const demarrer = (overrides: Record<string, unknown> = {}, recipients: readonly object[] = TOUS) =>
    startSharedLocation(deps, EMETTEUR, { recipients, durationMinutes: 60, position: PARIS, ...overrides });
  return { m, notices, demarrer };
};

const lecteurs = (notices: readonly SharedLocationStartedNotice[]) => notices.map((n) => n.readerId).sort();

describe('prévenir les destinataires au démarrage (#19204)', () => {
  it('chaque destinataire servi est prévenu — ni la Connaissance, ni le bloqueur', async () => {
    const { notices, demarrer } = prevenu();

    const ack = await demarrer({ notifyRecipients: true });

    expect(ack.success).toBe(true);
    expect(lecteurs(notices)).toEqual([AMI, PROCHE, SANG].sort());
    expect(notices.every((n) => n.emitterId === EMETTEUR && n.durationMinutes === 60 && n.expiresAt === new Date(T0 + HEURE).toISOString())).toBe(true);
  });

  it('l\'avis ne porte aucune position, ni précision, ni autre destinataire', async () => {
    const { notices, demarrer } = prevenu();

    await demarrer({ notifyRecipients: true });

    for (const notice of notices) {
      expect(Object.keys(notice).sort()).toEqual(['durationMinutes', 'emitterId', 'expiresAt', 'readerId']);
    }
    expect(JSON.stringify(notices)).not.toMatch(/48\.8|2\.35|latitude|longitude|precision|exact|city|neighborhood/);
  });

  it('sans la clé, ou à faux, personne n\'est prévenu — l\'ancien client est inchangé', async () => {
    const sans = prevenu();
    expect((await sans.demarrer()).success).toBe(true);
    expect(sans.notices).toEqual([]);

    const faux = prevenu();
    expect((await faux.demarrer({ notifyRecipients: false })).success).toBe(true);
    expect(faux.notices).toEqual([]);
  });

  it('remplacer le partage ne prévient que les nouveaux venus', async () => {
    const { notices, demarrer } = prevenu();
    await demarrer({ notifyRecipients: true }, [{ userId: AMI, precision: 'exact' }]);
    notices.length = 0;

    await demarrer({ notifyRecipients: true }, [{ userId: AMI, precision: 'exact' }, { userId: PROCHE }]);

    expect(lecteurs(notices)).toEqual([PROCHE]);
  });

  it('un émetteur en fantôme ne prévient personne : nul ne voit sa position', async () => {
    const { m, notices, demarrer } = prevenu();
    await m.ecrireCompte(EMETTEUR, { locationGhostAt: new Date(T0) });

    await demarrer({ notifyRecipients: true });

    expect(notices).toEqual([]);
  });

  it('une Connaissance seule choisie : le partage démarre, personne n\'est prévenu', async () => {
    const { notices, demarrer } = prevenu();

    const ack = await demarrer({ notifyRecipients: true }, [{ userId: CONNAISSANCE, precision: 'exact' }]);

    expect(ack.success).toBe(true);
    expect(notices).toEqual([]);
  });

  it('un avis qui échoue n\'empêche pas le partage', async () => {
    const { m } = prevenu();
    const deps = { ...m.deps, notifyStarted: async () => { throw new Error('push en panne'); } };

    const ack = await startSharedLocation(deps, EMETTEUR, { recipients: TOUS, durationMinutes: 60, position: PARIS, notifyRecipients: true });

    expect(ack.success).toBe(true);
  });
});
