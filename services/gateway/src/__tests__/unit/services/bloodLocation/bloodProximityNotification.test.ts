/**
 * QUAND UN SANG S'APPROCHE, L'ALERTE ATTEINT AUSSI UNE APP FERMÉE (#20540) — la notification
 * `blood_proximity` part aux deux Sangs, au même endroit que `location:blood-proximity` et sous
 * EXACTEMENT ses gardes (fantôme, silence ciblé, cadence de 2 h prise une seule fois, drapeau,
 * consentement des deux). Titre et corps dans la langue de CADRAGE du destinataire ; l'objet remis
 * à `createNotification` est relu clé par clé : aucune coordonnée n'y voyage.
 *
 * @jest-environment node
 */
import { describe, it, expect } from '@jest/globals';
import { SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';
import { recordBloodLocation, updateBloodLocationSettings } from '../../../../services/bloodLocation/bloodLocationService';
import { bloodProximityNotifierOf } from '../../../../services/bloodLocation/bloodProximityNotice';
import { settled } from '../../../helpers/settled';
import { ADULT_BIRTH } from '../../../helpers/messaging-circle-world';
import {
  A_300_M,
  AMI,
  AUTRE_SANG,
  BLOQUE,
  HEURE,
  MINUTE,
  MOI,
  PARIS,
  PROCHE,
  SANG,
  TOUT_PARTAGE,
  bloodLocationWorld,
  bloodWorldAvecConsentements,
  type BloodLocationWorldSeed,
} from '../../../helpers/blood-location-world';

type Created = Record<string, unknown> & { userId: string; metadata: Record<string, unknown>; title: string; content: string };

const COUPE = new Date('2026-11-09T11:00:00.000Z');

const PERSONNES = [
  { id: MOI, username: 'moi', displayName: 'Moi', avatar: null, systemLanguage: 'fr' },
  { id: SANG, username: 'lina', displayName: 'Lina', avatar: 'https://cdn/lina.png', systemLanguage: 'en' },
  { id: AUTRE_SANG, username: 'awa', displayName: null, avatar: null, systemLanguage: 'de' },
  { id: PROCHE, username: 'proche', displayName: null, avatar: null },
  { id: AMI, username: 'ami', displayName: null, avatar: null },
  { id: BLOQUE, username: 'bloque', displayName: null, avatar: null, blockedUserIds: [MOI] },
].map((user) => ({ birthDate: ADULT_BIRTH, ...user }));

function monde(seed: BloodLocationWorldSeed = {}, options: { readonly consentements?: boolean; readonly echec?: boolean } = {}) {
  const w = (options.consentements === false ? bloodLocationWorld : bloodWorldAvecConsentements)({ users: PERSONNES, ...seed });
  const created: Created[] = [];
  const notifier = bloodProximityNotifierOf({
    prisma: w.deps.prisma,
    notifications: {
      createNotification: async (params: unknown) => {
        if (options.echec) throw new Error('mongo injoignable');
        created.push(params as Created);
        return { id: `n${created.length}` } as never;
      },
    },
    now: () => w.horloge(),
  });
  const world = { ...w, deps: { ...w.deps, notifyProximity: notifier } };
  return { ...world, created, vers: (userId: string) => created.filter((c) => c.userId === userId) };
}

type Monde = ReturnType<typeof monde>;

/** SANG enregistre à Paris, MOI y arrive à 300 m : une évaluation de la paire. */
async function rencontre(w: Monde, lecteur: string = MOI, emetteur: string = SANG): Promise<void> {
  await settled(recordBloodLocation(w.deps, emetteur, PARIS));
  w.poser(lecteur, A_300_M, w.horloge() - MINUTE);
  await settled(recordBloodLocation(w.deps, lecteur, A_300_M));
}

describe('#20540 — la notification poussée part aux deux Sangs', () => {
  it('chacun reçoit une notification nommant l\'autre, dans SA langue, au palier de l\'alerte socket', async () => {
    const w = monde();
    await rencontre(w);

    const versMoi = w.vers(MOI);
    const versSang = w.vers(SANG);
    expect(versMoi).toHaveLength(1);
    expect(versSang).toHaveLength(1);
    expect(versMoi[0]).toMatchObject({ type: 'blood_proximity', lang: 'fr', metadata: { action: 'view_profile', userId: SANG, distanceMeters: 500 } });
    expect(versSang[0]).toMatchObject({ type: 'blood_proximity', lang: 'en', metadata: { action: 'view_profile', userId: MOI, distanceMeters: 500 } });
    expect(versMoi[0].title).toBe('Lina est tout près');
    expect(versMoi[0].content).toMatch(/^À 500\sm — touche pour vous voir tous les deux sur la carte$/u);
    expect(versSang[0].title).toBe('Moi is nearby');
    expect(versSang[0].content).toMatch(/^500\sm away — tap to see you both on the map$/u);
    const socket = w.emissions.filter((e) => e.event === SERVER_EVENTS.BLOOD_PROXIMITY).map((e) => e.data.distanceMeters);
    expect(socket).toEqual([500, 500]);
    expect([...versMoi, ...versSang].map((c) => c.metadata.distanceMeters)).toEqual(socket);
  });

  it('un nom sans displayName retombe sur le pseudo, et la distance suit la langue (allemand)', async () => {
    const w = monde();
    await rencontre(w, MOI, AUTRE_SANG);
    expect(w.vers(AUTRE_SANG)[0].title).toBe('Moi ist in der Nähe');
    expect(w.vers(AUTRE_SANG)[0].content).toMatch(/^500\sm entfernt — /u);
    expect(w.vers(MOI)[0].title).toBe('awa est tout près');
  });

  it('l\'objet remis ne porte que ce qu\'il faut — aucune coordonnée, ni dans le titre, ni dans le corps, ni dans les métadonnées, ni dans le contexte', async () => {
    const w = monde();
    await rencontre(w);
    const remis = w.vers(MOI)[0];
    expect(Object.keys(remis).sort()).toEqual(['actor', 'collapseId', 'content', 'context', 'expiresAt', 'lang', 'metadata', 'priority', 'title', 'type', 'userId']);
    expect(remis.actor).toEqual({ id: SANG, username: 'lina', displayName: 'Lina', avatar: 'https://cdn/lina.png' });
    expect(remis.context).toEqual({});
    expect(Object.keys(remis.metadata).sort()).toEqual(['action', 'distanceMeters', 'userId']);
    expect(remis.collapseId).toBe(`blood-proximity-${SANG}`);
    expect(remis.expiresAt).toEqual(new Date(w.horloge() + 2 * HEURE));
    expect(JSON.stringify(w.created)).not.toMatch(/48\.8|2\.35|latitude|longitude|accuracy|sealed/);
  });

  it('la cadence de 2 h n\'est prise qu\'une fois : socket et notification partent ensemble, puis plus rien', async () => {
    const w = monde();
    await rencontre(w);
    w.avancer(30 * MINUTE);
    await rencontre(w);
    expect(w.vers(MOI)).toHaveLength(1);
    expect(w.emissions.filter((e) => e.event === SERVER_EVENTS.BLOOD_PROXIMITY)).toHaveLength(2);

    w.avancer(2 * HEURE);
    await rencontre(w);
    expect(w.vers(MOI)).toHaveLength(2);
    expect(w.vers(SANG)).toHaveLength(2);
  });

  it('un échec de création n\'arrête ni l\'alerte socket ni l\'enregistrement', async () => {
    const w = monde({}, { echec: true });
    await settled(recordBloodLocation(w.deps, SANG, PARIS));
    w.poser(MOI, A_300_M, w.horloge() - MINUTE);
    await expect(recordBloodLocation(w.deps, MOI, A_300_M)).resolves.toEqual({ recorded: true });
    await settled(Promise.resolve());
    expect(w.emissions.filter((e) => e.event === SERVER_EVENTS.BLOOD_PROXIMITY)).toHaveLength(2);
  });
});

describe('#20540 — rien ne part là où l\'alerte socket ne part pas', () => {
  it('rien pour un fantôme global', async () => {
    const w = monde();
    await updateBloodLocationSettings(w.deps, SANG, { ghost: true });
    await rencontre(w);
    expect(w.created).toEqual([]);
  });

  it('rien pour un fantôme ciblé', async () => {
    const w = monde();
    await settled(recordBloodLocation(w.deps, SANG, PARIS));
    await updateBloodLocationSettings(w.deps, SANG, { ghost: true, userId: MOI });
    w.poser(MOI, A_300_M, w.horloge() - MINUTE);
    await settled(recordBloodLocation(w.deps, MOI, A_300_M));
    expect(w.created).toEqual([]);
  });

  it('un Sang réduit au silence ne reçoit rien ; l\'autre reçoit la sienne', async () => {
    const w = monde();
    w.consentir(MOI, SANG, { ...TOUT_PARTAGE, bloodLocationMutedAt: COUPE });
    await rencontre(w);
    expect(w.vers(MOI)).toEqual([]);
    expect(w.vers(SANG).map((c) => c.metadata.userId)).toEqual([MOI]);
  });

  it('dans l\'autre sens aussi : l\'émetteur du point a coupé', async () => {
    const w = monde();
    w.consentir(SANG, MOI, { ...TOUT_PARTAGE, bloodLocationMutedAt: COUPE });
    await rencontre(w);
    expect(w.vers(SANG)).toEqual([]);
    expect(w.vers(MOI).map((c) => c.metadata.userId)).toEqual([SANG]);
  });

  it('rien quand le drapeau n\'admet pas l\'un des deux', async () => {
    const w = monde({ horsDrapeau: [SANG] });
    await rencontre(w);
    expect(w.created).toEqual([]);
  });

  it('rien sans le consentement « proximité » des deux', async () => {
    const w = monde({ consents: [[SANG, MOI, TOUT_PARTAGE], [MOI, SANG, { proximityShared: false }]] }, { consentements: false });
    await rencontre(w);
    expect(w.created).toEqual([]);
  });

  it('rien quand le magasin de cadence est en panne', async () => {
    const w = monde({ cooldownDown: true });
    await rencontre(w);
    expect(w.created).toEqual([]);
  });
});
