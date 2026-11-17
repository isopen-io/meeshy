/**
 * LES JETONS D'ACTIVITÉ EN DIRECT ET LA POUSSÉE DE FIN (#19463).
 *
 * Un lecteur enregistre le jeton de l'Activité en direct qu'il affiche pour un sujet — et
 * seulement s'il est SERVI par le partage courant de ce sujet. À la fin servie, la poussée
 * silencieuse part vers lui seul, sa charge ne dit que qui et quand ; chaque jeton de CE
 * sujet reçoit `event: end` puis s'efface, les autres restent. Une poussée ratée ne lève pas.
 *
 * @jest-environment node
 */
import { describe, it, expect } from '@jest/globals';
import {
  LIVE_ACTIVITY_TOKENS_PER_ACCOUNT_MAX,
  LOCATION_SHARE_ENDED_PUSH_TYPE,
  liveActivityTokenRegistrationSchema,
} from '@meeshy/shared/types/shared-location-live-activity';
import { stopSharedLocation } from '../../../../services/sharedLocation/sharedLocationRelay';
import {
  pushSharedLocationEnd,
  purgeSharedLocationLiveActivityTokens,
  readSharedLocationLiveActivityTokens,
  registerSharedLocationLiveActivityToken,
  sharedLocationEndPusherOf,
  type SharedLocationEndPush,
} from '../../../../services/sharedLocation/sharedLocationLiveActivity';
import { AMI, CONNAISSANCE, demarrer, EMETTEUR, monde, NON_CHOISI, PROCHE, SANG, T0 } from '../../../helpers/shared-location-relay-world';

const MINUTE = 60_000;
const JETON = 'ab'.repeat(40);
const AUTRE_JETON = 'cd'.repeat(40);
const AUTRE_SUJET = '6300000000000000000000e9';

function pousseur(options: { readonly echoue?: boolean } = {}) {
  const silencieuses: { readerId: string; data: Record<string, string> }[] = [];
  const fins: { token: string; apnsEnvironment: string; state: Record<string, string> }[] = [];
  const push: SharedLocationEndPush = {
    silent: async (readerId, data) => {
      silencieuses.push({ readerId, data: { ...data } });
      if (options.echoue) throw new Error('fcm injoignable');
    },
    liveActivityEnd: async (target, state) => {
      fins.push({ token: target.token, apnsEnvironment: target.apnsEnvironment, state: { ...state } });
      if (options.echoue) throw new Error('apns injoignable');
    },
  };
  return { push, silencieuses, fins };
}

const enregistrer = (m: ReturnType<typeof monde>, readerId: string, subjectUserId = EMETTEUR, token = JETON) =>
  registerSharedLocationLiveActivityToken(m.deps, { readerId, registration: { kind: 'shared-location', subjectUserId, token } });

describe('l\'enregistrement d\'un jeton', () => {
  it('un lecteur servi enregistre son jeton, qui vit jusqu\'à SON échéance', async () => {
    const m = monde();
    await demarrer(m, [{ userId: SANG, expiresInSeconds: 1800 }, { userId: AMI }]);
    expect(await enregistrer(m, SANG)).toEqual({ expiresAt: new Date(T0 + 30 * MINUTE).toISOString() });
    expect(await enregistrer(m, AMI)).toEqual({ expiresAt: new Date(T0 + 60 * MINUTE).toISOString() });
  });

  it('qui n\'est pas servi est refusé : non choisi, sous Ami, ou sans partage en cours', async () => {
    const m = monde();
    expect(await enregistrer(m, AMI)).toBeNull();
    await demarrer(m);
    expect(await enregistrer(m, NON_CHOISI)).toBeNull();
    expect(await enregistrer(m, CONNAISSANCE)).toBeNull();
    expect(await readSharedLocationLiveActivityTokens(m.deps.cache, CONNAISSANCE, m.deps.now())).toEqual([]);
  });

  it('le jeton disparaît avec l\'échéance du lecteur', async () => {
    const m = monde();
    await demarrer(m);
    await enregistrer(m, AMI);
    m.avancer(61 * MINUTE);
    expect(await readSharedLocationLiveActivityTokens(m.deps.cache, AMI, m.deps.now())).toEqual([]);
  });

  it('un compte garde au plus un nombre borné de jetons, le plus ancien cède', async () => {
    const m = monde();
    await demarrer(m);
    for (let i = 0; i < LIVE_ACTIVITY_TOKENS_PER_ACCOUNT_MAX + 2; i += 1) {
      await enregistrer(m, AMI, EMETTEUR, i.toString(16).padStart(2, '0').repeat(20));
    }
    const jetons = await readSharedLocationLiveActivityTokens(m.deps.cache, AMI, m.deps.now());
    expect(jetons).toHaveLength(LIVE_ACTIVITY_TOKENS_PER_ACCOUNT_MAX);
    expect(jetons.map((jeton) => jeton.token)).not.toContain('00'.repeat(20));
  });

  it('le corps est validé : sorte connue, identifiant, jeton hexadécimal, rien d\'autre', () => {
    const valide = { kind: 'shared-location', subjectUserId: EMETTEUR, token: JETON };
    expect(liveActivityTokenRegistrationSchema.safeParse(valide).success).toBe(true);
    expect(liveActivityTokenRegistrationSchema.safeParse({ ...valide, kind: 'call' }).success).toBe(false);
    expect(liveActivityTokenRegistrationSchema.safeParse({ ...valide, token: 'pas-hex' }).success).toBe(false);
    expect(liveActivityTokenRegistrationSchema.safeParse({ ...valide, latitude: 1 }).success).toBe(false);
  });

  it('le jeton est rangé scellé : il ne se lit pas en clair dans le cache', async () => {
    const prev = process.env.SECRETS_AT_REST_KEY;
    process.env.SECRETS_AT_REST_KEY = 'a2tra2tra2tra2tra2tra2tra2tra2tra2tra2tra2s=';
    try {
      const m = monde();
      await demarrer(m);
      await enregistrer(m, AMI);
      const brut = await m.deps.cache.get(`shared-location-la:{${AMI}}`);
      expect(brut).not.toBeNull();
      expect(brut).not.toContain(JETON);
      expect(await readSharedLocationLiveActivityTokens(m.deps.cache, AMI, m.deps.now())).toHaveLength(1);
    } finally {
      if (prev === undefined) delete process.env.SECRETS_AT_REST_KEY;
      else process.env.SECRETS_AT_REST_KEY = prev;
    }
  });
});

describe('la poussée de fin', () => {
  it('la silencieuse part au lecteur seul, avec type, émetteur et heure — rien d\'autre', async () => {
    const m = monde();
    const { push, silencieuses } = pousseur();
    await pushSharedLocationEnd({ cache: m.deps.cache, push, now: m.deps.now }, { readerId: PROCHE, emitterId: EMETTEUR, endedAt: new Date(T0).toISOString() });
    expect(silencieuses).toEqual([{ readerId: PROCHE, data: { type: LOCATION_SHARE_ENDED_PUSH_TYPE, userId: EMETTEUR, endedAt: new Date(T0).toISOString() } }]);
  });

  it('les jetons de CE sujet reçoivent la fin et s\'effacent ; ceux d\'un autre sujet restent', async () => {
    const m = monde();
    await demarrer(m);
    await enregistrer(m, AMI);
    await registerSharedLocationLiveActivityToken(m.deps, { readerId: AMI, registration: { kind: 'shared-location', subjectUserId: EMETTEUR, token: AUTRE_JETON, apnsEnvironment: 'development' } });
    const { push, fins } = pousseur();
    await pushSharedLocationEnd({ cache: m.deps.cache, push, now: m.deps.now }, { readerId: AMI, emitterId: AUTRE_SUJET, endedAt: new Date(T0).toISOString() });
    expect(fins).toEqual([]);
    await pushSharedLocationEnd({ cache: m.deps.cache, push, now: m.deps.now }, { readerId: AMI, emitterId: EMETTEUR, endedAt: new Date(T0).toISOString() });
    expect(fins).toEqual([
      { token: JETON, apnsEnvironment: 'production', state: { endedAt: new Date(T0).toISOString() } },
      { token: AUTRE_JETON, apnsEnvironment: 'development', state: { endedAt: new Date(T0).toISOString() } },
    ]);
    expect(await readSharedLocationLiveActivityTokens(m.deps.cache, AMI, m.deps.now())).toEqual([]);
  });

  it('les jetons d\'un AUTRE lecteur ne reçoivent rien de la fin d\'un lecteur', async () => {
    const m = monde();
    await demarrer(m);
    await enregistrer(m, SANG);
    const { push, fins } = pousseur();
    await pushSharedLocationEnd({ cache: m.deps.cache, push, now: m.deps.now }, { readerId: AMI, emitterId: EMETTEUR, endedAt: new Date(T0).toISOString() });
    expect(fins).toEqual([]);
    expect(await readSharedLocationLiveActivityTokens(m.deps.cache, SANG, m.deps.now())).toHaveLength(1);
  });

  it('des poussées qui échouent ne lèvent pas, et le jeton consommé ne repart pas', async () => {
    const m = monde();
    await demarrer(m);
    await enregistrer(m, AMI);
    const { push, fins } = pousseur({ echoue: true });
    const reports: unknown[] = [];
    await expect(pushSharedLocationEnd({ cache: m.deps.cache, push, now: m.deps.now, report: (e) => reports.push(e) }, { readerId: AMI, emitterId: EMETTEUR, endedAt: new Date(T0).toISOString() })).resolves.toBeUndefined();
    expect(fins).toHaveLength(1);
    expect(reports.length).toBeGreaterThan(0);
    expect(await readSharedLocationLiveActivityTokens(m.deps.cache, AMI, m.deps.now())).toEqual([]);
  });

  it('de bout en bout : l\'arrêt branché pousse la fin au lecteur servi, et clôt son Activité', async () => {
    const m = monde();
    await demarrer(m, [{ userId: AMI }]);
    await enregistrer(m, AMI);
    const { push, silencieuses, fins } = pousseur();
    const ended = sharedLocationEndPusherOf({ cache: m.deps.cache, push, now: m.deps.now, report: () => undefined });
    await stopSharedLocation({ ...m.deps, ended: (end) => ended(end) }, EMETTEUR);
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(silencieuses.map((s) => s.readerId)).toEqual([AMI]);
    expect(fins.map((f) => f.token)).toEqual([JETON]);
  });

  it('la purge du compte efface ses jetons', async () => {
    const m = monde();
    await demarrer(m);
    await enregistrer(m, AMI);
    await purgeSharedLocationLiveActivityTokens(m.deps.cache, AMI);
    expect(await readSharedLocationLiveActivityTokens(m.deps.cache, AMI, m.deps.now())).toEqual([]);
  });
});
