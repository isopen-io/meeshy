/**
 * Le compteur d'acces par route et par version (#4275).
 *
 * Ce que ces temoins protegent, dans l'ordre de ce que leur absence coutait :
 *
 * 1. **Un zero OBSERVE se distingue d'un seau ABSENT.** C'est la raison d'etre
 *    du lot : quatre issues font d'un compteur a zero LE critere de retrait
 *    d'une route. Un instantane muet sur une adresse est ambigu — jamais
 *    appelee, ou jamais vue ? Les temoins « pre-semee a zero », « matched »
 *    et « instrumented » ferment les trois formes de cette ambiguite.
 * 2. **Aucune identite n'est collectee.** Ni IP, ni compte, ni `User-Agent`
 *    brut. Le temoin est une assertion d'ABSENCE sur la charge serialisee : une
 *    liste de champs attendus ne rougirait pas le jour ou l'on en ajoute un.
 * 3. **La cardinalite est bornee, et les TOTAUX surveilles y echappent.** Un
 *    plafond qui amputerait les totaux fabriquerait exactement le faux zero
 *    que le lot existe pour interdire.
 * 4. **La fenetre glisse vraiment.** Une fenetre qui n'oublie rien rend un
 *    compteur qui ne retombe jamais a zero, donc un retrait jamais autorise.
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';

import {
  ANGLES_MORTS,
  RouteUsageCounter,
  ROUTES_SURVEILLEES,
  ROUTE_NON_MONTEE,
  normaliserPlateforme,
  normaliserVersion,
  servieSousApi,
  surveilleesMalDeclarees,
  type EchantillonUsage,
  type RouteSurveillee,
} from '../../../services/route-usage.service';

const SURVEILLEE = { method: 'GET', route: '/api/v1/auth/me', issue: 4178 } as const;

/** Une horloge qu'on avance a la main : la fenetre se MESURE, elle ne s'attend pas. */
function horlogeMobile(depart = 1_000_000_000_000) {
  let t = depart;
  return {
    now: () => t,
    avancer: (ms: number) => {
      t += ms;
    },
  };
}

function echantillon(over: Partial<EchantillonUsage> = {}): EchantillonUsage {
  return {
    method: 'GET',
    routePattern: '/api/v1/users/:id',
    ...over,
  };
}

function seau(instantane: ReturnType<RouteUsageCounter['snapshot']>, route: string, platform: string, version: string) {
  return instantane.entries.find((e) => e.route === route && e.platform === platform && e.version === version);
}

// ───────────────────────────────────────────────────────────────────────────
// Le comptage lui-meme
// ───────────────────────────────────────────────────────────────────────────

describe('RouteUsageCounter — le compte par route et par version', () => {
  it('compte par MOTIF de route, plateforme et version', () => {
    const c = new RouteUsageCounter();
    c.record(echantillon({ platformHeader: 'ios', versionHeader: '1.4.2' }));
    c.record(echantillon({ platformHeader: 'ios', versionHeader: '1.4.2' }));
    c.record(echantillon({ platformHeader: 'ios', versionHeader: '1.5.0' }));

    const vu = c.snapshot();
    expect(seau(vu, '/api/v1/users/:id', 'ios', '1.4.2')?.count).toBe(2);
    expect(seau(vu, '/api/v1/users/:id', 'ios', '1.5.0')?.count).toBe(1);
  });

  it('range une requete non routee sous un seau unique, sans son URL', () => {
    // `request.url` porte les identifiants et la chaine de requete : une cle
    // par appelant, donc une croissance memoire sans plafond. Le detail d'un
    // 404 n'est pas attribuable, et c'est un angle mort DECLARE.
    const c = new RouteUsageCounter();
    c.record(echantillon({ routePattern: undefined }));
    const vu = c.snapshot();
    expect(vu.entries.some((e) => e.route === ROUTE_NON_MONTEE)).toBe(true);
  });

  it('date la derniere vue de chaque seau', () => {
    const h = horlogeMobile();
    const c = new RouteUsageCounter({ clock: h.now });
    c.record(echantillon({ platformHeader: 'web' }));
    h.avancer(60_000);
    c.record(echantillon({ platformHeader: 'web' }));

    const vu = c.snapshot();
    expect(seau(vu, '/api/v1/users/:id', 'web', 'absent')?.lastSeenAt).toBe(
      new Date(h.now()).toISOString()
    );
  });
});

// ───────────────────────────────────────────────────────────────────────────
// C'est un compteur, pas un journal (critere 1)
// ───────────────────────────────────────────────────────────────────────────

describe('RouteUsageCounter — aucune identite ne rentre', () => {
  it('ne conserve NULLE PART le User-Agent brut', () => {
    const ua =
      'Meeshy/1.4.2 (iPhone15,3; iOS 18.2; fr-FR; deviceId=8F2A-4C1B-…) CFNetwork/1568 Darwin/24.2.0';
    const c = new RouteUsageCounter();
    c.record(echantillon({ userAgent: ua }));

    // Assertion d'ABSENCE sur la charge SERIALISEE entiere, en INSENSIBLE A LA
    // CASSE : la normalisation minuscule le `User-Agent`, donc une fuite y
    // arriverait en `iphone15`, et une assertion sensible a la casse resterait
    // verte devant elle. Mesure : la premiere version de ce temoin ne rougissait
    // PAS sous la mutation « rendre le User-Agent brut ».
    const serialise = JSON.stringify(c.snapshot()).toLowerCase();
    expect(serialise).not.toContain('iphone15');
    expect(serialise).not.toContain('deviceid');
    expect(serialise).not.toContain('cfnetwork');
    expect(serialise).not.toContain(ua.toLowerCase());
  });

  it('ne sert jamais une plateforme hors du vocabulaire CLOS', () => {
    // La garde STRUCTURELLE, celle qui survit a l'oubli d'un temoin par chaine :
    // quoi qu'on lui envoie, la valeur servie appartient a un ensemble fini.
    // C'est elle, et pas la liste de sous-chaines ci-dessus, qui rougit devant
    // n'IMPORTE quelle valeur non bornee glissee dans cet emplacement.
    const admis = new Set([
      'ios', 'android', 'web', 'desktop', 'bot', 'script', 'other', 'absent', '*',
    ]);
    const c = new RouteUsageCounter();
    for (const userAgent of [
      'Meeshy/1.4.2 (iPhone15,3; deviceId=8F2A) CFNetwork/1568 Darwin/24.2.0',
      'Mozilla/5.0 (X11; Linux x86_64) Firefox/141.0',
      'okhttp/4.12.0',
      'PostmanRuntime/7.44.1',
      '',
    ]) {
      c.record(echantillon({ userAgent }));
    }
    for (const e of c.snapshot().entries) {
      expect(admis.has(e.platform)).toBe(true);
    }
  });

  it("reduit le User-Agent a une FAMILLE fermee, jamais a sa chaine", () => {
    expect(normaliserPlateforme(undefined, 'okhttp/4.12.0')).toBe('android');
    expect(normaliserPlateforme(undefined, 'Meeshy/1.4 CFNetwork/1568 Darwin/24.2.0')).toBe('ios');
    expect(normaliserPlateforme(undefined, 'Mozilla/5.0 (Macintosh) Chrome/131')).toBe('web');
    expect(normaliserPlateforme(undefined, 'curl/8.7.1')).toBe('script');
    expect(normaliserPlateforme(undefined, 'Googlebot/2.1')).toBe('bot');
    expect(normaliserPlateforme(undefined, 'quelque-chose-de-jamais-vu/9')).toBe('other');
    expect(normaliserPlateforme(undefined, undefined)).toBe('absent');
  });

  it("prefere l'en-tete declare au User-Agent, et refuse une plateforme inventee", () => {
    expect(normaliserPlateforme('ios', 'Mozilla/5.0')).toBe('ios');
    // Une plateforme hors vocabulaire ne cree pas de cle : sans ce repli, un
    // appelant fabriquerait autant de seaux qu'il envoie de valeurs.
    expect(normaliserPlateforme('plateforme-inventee-par-lappelant', 'Mozilla/5.0')).toBe('web');
  });

  it('borne le format de version, et DIT quand il n’y en a pas', () => {
    expect(normaliserVersion('1.4.2')).toBe('1.4.2');
    expect(normaliserVersion('2026')).toBe('2026');
    expect(normaliserVersion(undefined)).toBe('absent');
    expect(normaliserVersion('')).toBe('absent');
    expect(normaliserVersion('1.4.2-beta-<script>')).toBe('invalid');
    expect(normaliserVersion('9'.repeat(400))).toBe('invalid');
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Le zero OBSERVE — le coeur du lot
// ───────────────────────────────────────────────────────────────────────────

describe('RouteUsageCounter — un zero observe n’est pas un seau absent', () => {
  it('pre-seme les routes surveillees a zero, meme sans le moindre trafic', () => {
    const c = new RouteUsageCounter({ watched: [SURVEILLEE] });
    const vu = c.snapshot();

    const suivie = vu.watched.find((w) => w.route === SURVEILLEE.route);
    expect(suivie).toBeDefined();
    expect(suivie?.count).toBe(0);
    expect(suivie?.lastSeenAt).toBeNull();
    // Le seau TOTAL existe dans les entrees : c'est lui qui dit « observee,
    // jamais appelee ». Sans lui, l'absence de ligne serait le seul signal, et
    // elle veut dire tout autre chose.
    expect(seau(vu, SURVEILLEE.route, '*', '*')).toBeDefined();
  });

  it('ne MATERIALISE que les adresses surveillees en portee `watched`', () => {
    // Ce n'est pas un filtre de confort. Sur une instance saturee, composer et
    // trier la table complete coute 154 ms de boucle d'evenements — bloquantes
    // pour TOUT le service, a chaque ouverture d'un onglet d'administration.
    // Mesure apres ce filtre : 47 ms et 16 Ko, contre 148 ms et 16 Mo.
    const c = new RouteUsageCounter({ watched: [SURVEILLEE] });
    for (let i = 0; i < 400; i++) c.record(echantillon({ routePattern: `/api/v1/bruit${i}` }));
    c.record({ method: 'GET', routePattern: SURVEILLEE.route });

    const restreint = c.snapshot({ portee: 'watched' });
    expect(restreint.entries.every((e) => e.route === SURVEILLEE.route)).toBe(true);
    // Le COMPTAGE reste integral : ce qui se restreint est ce qu'on RESTITUE.
    // Un `distinctKeys` rabote mentirait sur la saturation, donc sur la valeur
    // des zeros voisins.
    expect(restreint.distinctKeys).toBeGreaterThan(400);
    expect(c.snapshot().entries.length).toBeGreaterThan(400);
  });

  it("n'invente aucun seau pour une adresse NON surveillee", () => {
    const c = new RouteUsageCounter({ watched: [SURVEILLEE] });
    const vu = c.snapshot();
    expect(vu.entries.some((e) => e.route === '/api/v1/jamais/appelee')).toBe(false);
  });

  it('rend `instrumented: false` tant que le hook global n’est pas pose', () => {
    // Sans ce drapeau, une charge de zeros parfaitement credible autoriserait
    // le retrait de toutes les routes du service.
    const c = new RouteUsageCounter({ watched: [SURVEILLEE] });
    expect(c.snapshot().instrumented).toBe(false);
    c.markInstrumented();
    expect(c.snapshot().instrumented).toBe(true);
  });

  it('rend `matched: false` pour une adresse surveillee qui n’est montee nulle part', () => {
    const c = new RouteUsageCounter({
      watched: [SURVEILLEE, { method: 'GET', route: '/api/v1/route/disparue', issue: 4178 }],
    });
    c.reconcile((r) => r.route === SURVEILLEE.route);

    const vu = c.snapshot();
    expect(vu.reconciled).toBe(true);
    expect(vu.watched.find((w) => w.route === SURVEILLEE.route)?.matched).toBe(true);
    expect(vu.watched.find((w) => w.route === '/api/v1/route/disparue')?.matched).toBe(false);
  });

  it('rend `matched: null` avant toute reconciliation', () => {
    const c = new RouteUsageCounter({ watched: [SURVEILLEE] });
    expect(c.snapshot().watched[0]?.matched).toBeNull();
    expect(c.snapshot().reconciled).toBe(false);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Cardinalite bornee, totaux inviolables (critere 3)
// ───────────────────────────────────────────────────────────────────────────

describe('RouteUsageCounter — la memoire est bornee', () => {
  it('refuse les NOUVELLES cles au-dela du plafond et le DIT', () => {
    const c = new RouteUsageCounter({ maxKeysPerSlice: 10, sliceCount: 1 });
    for (let i = 0; i < 500; i++) {
      c.record(echantillon({ routePattern: `/api/v1/r${i}` }));
    }
    const vu = c.snapshot();
    expect(vu.distinctKeys).toBeLessThanOrEqual(10);
    expect(vu.saturated).toBe(true);
    expect(vu.droppedSamples).toBeGreaterThan(0);
  });

  it("n'ampute jamais une cle DEJA comptee quand le plafond est atteint", () => {
    const c = new RouteUsageCounter({ maxKeysPerSlice: 2, sliceCount: 1 });
    c.record(echantillon({ routePattern: '/api/v1/premiere' }));
    for (let i = 0; i < 100; i++) c.record(echantillon({ routePattern: `/api/v1/bruit${i}` }));
    c.record(echantillon({ routePattern: '/api/v1/premiere' }));

    expect(seau(c.snapshot(), '/api/v1/premiere', 'absent', 'absent')?.count).toBe(2);
  });

  it('compte le TOTAL d’une route surveillee meme sous saturation totale', () => {
    // Le defaut que ce temoin interdit : un appelant qui sature le compteur
    // ferait retomber a zero le total d'une route depreciee, et ce zero
    // autoriserait son retrait. Le plafond degrade la FINESSE, jamais le total.
    const c = new RouteUsageCounter({ maxKeysPerSlice: 1, sliceCount: 1, watched: [SURVEILLEE] });
    for (let i = 0; i < 200; i++) c.record(echantillon({ routePattern: `/api/v1/bruit${i}` }));

    c.record({ method: 'GET', routePattern: SURVEILLEE.route, platformHeader: 'ios', versionHeader: '1.4.2' });
    c.record({ method: 'GET', routePattern: SURVEILLEE.route, platformHeader: 'ios', versionHeader: '1.4.2' });

    const vu = c.snapshot();
    expect(vu.saturated).toBe(true);
    expect(vu.watched.find((w) => w.route === SURVEILLEE.route)?.count).toBe(2);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// La fenetre glisse
// ───────────────────────────────────────────────────────────────────────────

describe('RouteUsageCounter — la fenetre glissante oublie', () => {
  it('oublie un appel sorti de la fenetre', () => {
    const h = horlogeMobile();
    const c = new RouteUsageCounter({ windowMs: 4_000, sliceCount: 4, clock: h.now });
    c.record(echantillon({ platformHeader: 'ios', versionHeader: '1.0.0' }));
    expect(seau(c.snapshot(), '/api/v1/users/:id', 'ios', '1.0.0')?.count).toBe(1);

    h.avancer(10_000);
    expect(seau(c.snapshot(), '/api/v1/users/:id', 'ios', '1.0.0')).toBeUndefined();
  });

  it('garde un appel encore DANS la fenetre', () => {
    const h = horlogeMobile();
    const c = new RouteUsageCounter({ windowMs: 4_000, sliceCount: 4, clock: h.now });
    c.record(echantillon({ platformHeader: 'ios', versionHeader: '1.0.0' }));
    h.avancer(2_000);
    expect(seau(c.snapshot(), '/api/v1/users/:id', 'ios', '1.0.0')?.count).toBe(1);
  });

  it('re-seme les routes surveillees a chaque rotation de tranche', () => {
    const h = horlogeMobile();
    const c = new RouteUsageCounter({ windowMs: 4_000, sliceCount: 4, clock: h.now, watched: [SURVEILLEE] });
    c.record({ method: 'GET', routePattern: SURVEILLEE.route });
    h.avancer(60_000);

    const vu = c.snapshot();
    // Le compte est retombe a zero (la fenetre a glisse) mais le seau EXISTE :
    // « observee, jamais appelee sur cette fenetre », pas « jamais observee ».
    expect(vu.watched.find((w) => w.route === SURVEILLEE.route)?.count).toBe(0);
    expect(seau(vu, SURVEILLEE.route, '*', '*')).toBeDefined();
  });

  it('ne fait pas remonter un appel vieux d’un tour entier de l’anneau', () => {
    const h = horlogeMobile();
    const c = new RouteUsageCounter({ windowMs: 4_000, sliceCount: 4, clock: h.now });
    c.record(echantillon({ platformHeader: 'ios', versionHeader: '1.0.0' }));
    // Exactement un tour : sans le filtre d'epoque, la tranche reoccuperait le
    // meme emplacement et son compte d'il y a des jours reapparaitrait comme
    // s'il datait d'aujourd'hui.
    h.avancer(4_000);
    expect(seau(c.snapshot(), '/api/v1/users/:id', 'ios', '1.0.0')).toBeUndefined();
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Ce que le compteur ne mesure PAS (critere 5)
// ───────────────────────────────────────────────────────────────────────────

describe('RouteUsageCounter — la charge porte ses angles morts', () => {
  it('sert ses angles morts DANS l’instantane', () => {
    const vu = new RouteUsageCounter().snapshot();
    expect(vu.blindSpots).toEqual(ANGLES_MORTS);
    expect(vu.blindSpots.length).toBeGreaterThanOrEqual(6);
  });

  it('nomme les deux angles morts qui produiraient un FAUX ZERO', () => {
    const texte = ANGLES_MORTS.join(' | ');
    // Web et Android ne posent aucun en-tete de version (verifie 2026-08-29) :
    // un zero sur `android:1.2.0` ne peut pas exister, donc ne prouve rien.
    expect(texte).toContain('web-et-android-ne-posent-aucun-en-tete-de-version');
    // Le cache navigateur / service worker ne traverse jamais le gateway.
    expect(texte).toContain('cache-navigateur-et-service-worker');
    // L'agregat meurt au redemarrage et ne totalise pas les repliques.
    expect(texte).toContain('agregat-en-memoire-et-par-instance');
  });

  it('dit depuis quand il observe, et sur quelle instance', () => {
    // Un zero sans duree d'observation ni identite d'instance n'autorise rien :
    // il peut valoir pour trois secondes, sur une replique parmi N.
    const h = horlogeMobile();
    const c = new RouteUsageCounter({ clock: h.now, instanceId: 'gw-7' });
    h.avancer(90_000);
    const vu = c.snapshot();
    expect(vu.instanceId).toBe('gw-7');
    expect(vu.observedForMs).toBe(90_000);
    expect(vu.observingSince).toBeTruthy();
  });
});

// ───────────────────────────────────────────────────────────────────────────
// La liste surveillee (critere 4)
// ───────────────────────────────────────────────────────────────────────────

describe('ROUTES_SURVEILLEES — les adresses depreciees, instrumentees en priorite', () => {
  it('couvre les vingt-quatre issues qui attendent un zero', () => {
    // Quatre sont arrivees avec #4470 : les issues des alias servis HORS
    // `/api/v1/`, dont le zero de ce compteur est le seul argument de retrait
    // — #4277 (alias racine de l'analyse vocale), #4317 (delete-for-me de
    // conversation), #4324 (lecture d'octets legacy), #4376 (gestes Socket.IO
    // non versionnes).
    //
    // Douze sont arrivees avec #4488, qui a pris le probleme par l'autre bout :
    // trente-sept adresses SOUS le prefixe posaient `depreciee(...)` sans
    // figurer ici. Cette liste-ci reste un INVENTAIRE, donc une liste en
    // retard par construction — ce qui garantit la couverture est le balayage
    // `__tests__/security/deprecation-coverage-sweep.ts`, qui part du CODE.
    // #4370 est la vingt-quatrieme, et elle attend un zero d'une nature
    // differente des autres : les deux couples TUS ne sont pas DEPRECIES, ils
    // sont montes sans appelant CONFIRME. #4190 avait pose la bonne regle — la
    // confirmation precede le retrait — sans l'instrument qui la rend possible.
    const issues = new Set(ROUTES_SURVEILLEES.map((r) => r.issue));
    expect([...issues].sort()).toEqual([
      4149, 4154, 4155, 4158, 4161, 4164, 4167, 4169, 4170, 4178, 4181, 4182,
      4184, 4277, 4283, 4317, 4324, 4346, 4349, 4350, 4351, 4353, 4370, 4376,
    ]);
  });

  it('porte les vingt-huit routes par categorie de preferences (#4181)', () => {
    const parCategorie = ROUTES_SURVEILLEES.filter(
      (r) => r.issue === 4181 && r.route !== '/api/v1/me/preferences'
    );
    expect(parCategorie).toHaveLength(28);
  });

  it('porte les dix adresses historiques d’ecriture de compte (#4154)', () => {
    expect(ROUTES_SURVEILLEES.filter((r) => r.issue === 4154)).toHaveLength(10);
  });

  it("ne surveille AUCUNE adresse deja retiree du depot", () => {
    // Trois adresses citees par les issues n'existent plus : `/me/me` (#4141),
    // `/users/me/test` (#4185), `DELETE /me/preferences`. Les surveiller aurait
    // produit trois `matched: false` PERMANENTS — une alarme qui crie sans
    // arret finit par ne plus rien dire.
    const adresses = ROUTES_SURVEILLEES.map((r) => `${r.method} ${r.route}`);
    expect(adresses).not.toContain('GET /api/v1/me/me');
    expect(adresses).not.toContain('GET /api/v1/users/me/test');
    expect(adresses).not.toContain('DELETE /api/v1/me/preferences');
  });

  it('declare chaque adresse : prefixee, ou justifiee', () => {
    // Le garde precedent exigeait `route.startsWith('/api/v1/')` sur TOUTES les
    // entrees. Il rendait par construction impossible de surveiller les huit
    // alias depreciees servies hors du prefixe — c'est-a-dire le mecanisme
    // meme cense gouverner leur retrait (#4470).
    expect(surveilleesMalDeclarees()).toEqual([]);
  });

  it('porte les neuf alias depreciees hors /api/v1, chacune declaree', () => {
    // Le decompte est POSE, jamais derive : « pour chaque element d'une liste
    // vide » ne tombe jamais, et c'est exactement l'etat que #4470 corrige.
    const alias = ROUTES_SURVEILLEES.filter((r) => !r.route.startsWith('/api/v1/'));
    expect(alias).toHaveLength(9);
    expect(alias.filter((r) => r.horsPrefixe?.famille === 'alias-racine')).toHaveLength(5);
    expect(alias.filter((r) => r.horsPrefixe?.famille === 'alias-non-versionne')).toHaveLength(4);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Le garde de declaration (#4470) — il doit savoir TOMBER
// ───────────────────────────────────────────────────────────────────────────

describe('surveilleesMalDeclarees — la raison ecrite remplace la forme du chemin', () => {
  const PREFIXEE: RouteSurveillee = { method: 'GET', route: '/api/v1/auth/me', issue: 4178 };
  const RACINE: RouteSurveillee = {
    method: 'GET',
    route: '/voice/analysis',
    issue: 4277,
    horsPrefixe: { famille: 'alias-racine', raison: 'Alias racine de GET /api/v1/voice/analysis.' },
  };

  it('accepte une adresse prefixee sans declaration', () => {
    expect(surveilleesMalDeclarees([PREFIXEE])).toEqual([]);
  });

  it('accepte une adresse hors prefixe DECLAREE', () => {
    expect(surveilleesMalDeclarees([RACINE])).toEqual([]);
  });

  it('REFUSE une adresse hors prefixe sans declaration — la contrainte que le garde precedent portait', () => {
    const nue: RouteSurveillee = { method: 'GET', route: '/voice/analysis', issue: 4277 };
    expect(surveilleesMalDeclarees([nue])).toEqual([
      { method: 'GET', route: '/voice/analysis', motif: 'hors-prefixe-sans-declaration' },
    ]);
  });

  it('REFUSE une raison vide — une declaration sans motif n’en est pas une', () => {
    const creuse: RouteSurveillee = { ...RACINE, horsPrefixe: { famille: 'alias-racine', raison: '   ' } };
    expect(surveilleesMalDeclarees([creuse])).toEqual([
      { method: 'GET', route: '/voice/analysis', motif: 'raison-vide' },
    ]);
  });

  it('REFUSE une declaration posee sur une adresse prefixee — elle ne justifie plus rien', () => {
    const perimee: RouteSurveillee = {
      ...PREFIXEE,
      horsPrefixe: { famille: 'alias-racine', raison: 'au cas ou' },
    };
    expect(surveilleesMalDeclarees([perimee])).toEqual([
      { method: 'GET', route: '/api/v1/auth/me', motif: 'declaration-perimee' },
    ]);
  });

  it('REFUSE une famille que le CHEMIN dement, dans les deux sens', () => {
    // Sans cette confrontation, `famille` serait un commentaire : on pourrait
    // ecrire n'importe lequel des deux mots sans qu'aucun temoin ne rougisse.
    const menteuse: RouteSurveillee = {
      ...RACINE,
      horsPrefixe: { famille: 'alias-non-versionne', raison: 'Alias racine de GET /api/v1/voice/analysis.' },
    };
    expect(surveilleesMalDeclarees([menteuse])).toEqual([
      { method: 'GET', route: '/voice/analysis', motif: 'famille-dementie' },
    ]);

    const inverse: RouteSurveillee = {
      method: 'GET',
      route: '/api/socketio/stats',
      issue: 4376,
      horsPrefixe: { famille: 'alias-racine', raison: 'Alias non versionne de GET /api/v1/socketio/stats.' },
    };
    expect(surveilleesMalDeclarees([inverse])).toEqual([
      { method: 'GET', route: '/api/socketio/stats', motif: 'famille-dementie' },
    ]);
  });

  it('REFUSE un chemin non absolu, declare ou non — il ne designerait aucune route', () => {
    const relative: RouteSurveillee = {
      method: 'GET',
      route: 'voice/analysis',
      issue: 4277,
      horsPrefixe: { famille: 'alias-racine', raison: 'Alias racine.' },
    };
    expect(surveilleesMalDeclarees([relative])).toEqual([
      { method: 'GET', route: 'voice/analysis', motif: 'chemin-non-absolu' },
    ]);
  });

  it('range `/apiary` hors du perimetre `/api` — un prefixe se compare par SEGMENT', () => {
    expect(servieSousApi('/api')).toBe(true);
    expect(servieSousApi('/api/socketio/stats')).toBe(true);
    expect(servieSousApi('/apiary/analysis')).toBe(false);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Le cout par requete (critere 3)
// ───────────────────────────────────────────────────────────────────────────

describe('RouteUsageCounter — le chemin chaud ne paie aucune E/S', () => {
  it('absorbe 200 000 echantillons sans sortir du processus', () => {
    // Le critere 3 ecarte explicitement une ecriture reseau par requete. La
    // borne est GENEREUSE (10 us/echantillon, ~100x le cout mesure) : elle
    // n'existe pas pour chronometrer une machine, mais pour rougir le jour ou
    // quelqu'un glisse un `await`, un `JSON.stringify` ou un appel Redis ici.
    const c = new RouteUsageCounter({ watched: [SURVEILLEE] });
    const debut = process.hrtime.bigint();
    for (let i = 0; i < 200_000; i++) {
      c.record({
        method: 'GET',
        routePattern: SURVEILLEE.route,
        platformHeader: 'ios',
        versionHeader: '1.4.2',
        userAgent: 'Meeshy/1.4.2 CFNetwork/1568 Darwin/24.2.0',
      });
    }
    const microsecondesParEchantillon = Number(process.hrtime.bigint() - debut) / 1_000 / 200_000;
    expect(microsecondesParEchantillon).toBeLessThan(10);
    expect(c.snapshot().watched[0]?.count).toBe(200_000);
  });
});
