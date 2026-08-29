/**
 * Le compteur d'acces par route et par version de client (#4275).
 *
 * ## Ce que son absence coutait
 *
 * Quatre issues — #4178, #4181, #4182, #4184 — font d'un « compteur d'acces a
 * zero sur deux versions publiees de chaque client » LE critere de retrait
 * d'une route depreciee, et **interdisent explicitement** de le prouver par
 * revue de code client. Le gateway n'avait ni `prom-client`, ni `/metrics`, ni
 * journal d'acces agrege : leur critere etait donc inatteignable par
 * construction. Aucune quantite de travail sur ces quatre lots ne pouvait le
 * satisfaire tant que la mesure n'existait pas.
 *
 * L'interdiction est justifiee : le depot a deja paye « rien n'emet X » comme
 * quantification universelle (les quatre clients, pas trois), et meme un
 * inventaire a quatre clients ne dit rien des **versions deja installees** —
 * un profil s'ouvre depuis un lien partage, et cette queue est longue.
 *
 * ## Ce que ce compteur repond, et ce qu'il ne repond pas
 *
 * Il repond a UNE question : *est-ce que quelqu'un, quelque part, appelle
 * encore cette adresse ?* Il ne repond pas a *qui* — et ne doit pas :
 * **c'est un compteur, pas un journal**. Aucune identite n'entre ici : ni
 * `userId`, ni IP, ni jeton, ni `User-Agent` BRUT (dont la chaine complete est
 * a la fois une empreinte d'appareil et une cardinalite non bornee). Ce qui
 * entre est un triplet ferme : la route MONTEE, une plateforme prise dans un
 * vocabulaire clos, et une version au format valide.
 *
 * ## Le zero OBSERVE n'est pas l'absence de seau
 *
 * C'est la piece maitresse, et elle decide de la valeur de tout le reste. Un
 * instantane qui ne montre rien pour `/api/v1/auth/me` est AMBIGU : personne
 * ne l'a appelee, ou bien le compteur ne l'a jamais vue (hook non pose, route
 * renommee, saturation de cardinalite) ? Les deux se rendraient a l'identique,
 * et la seconde autorise un retrait qui casse.
 *
 * D'ou trois mecanismes, dans cet ordre d'importance :
 *
 * 1. **Les routes surveillees sont PRE-SEMEES a zero** dans chaque tranche.
 *    Leur seau existe donc avant le premier appel : `count: 0` veut dire
 *    « observee, jamais appelee », et l'ABSENCE du seau veut dire « jamais
 *    observee » — deux verdicts distincts, lisibles.
 * 2. **Leur total echappe au plafond de cardinalite — par le pre-semis, pas
 *    par une derogation.** Le plafond ne refuse que les cles NEUVES, et un
 *    seau seme n'est jamais neuf : le total `*` / `*` d'une route surveillee
 *    est donc toujours incremente, meme quand un appelant sature la tranche.
 *    Seule la ventilation par plateforme/version se degrade. Une derogation
 *    explicite (« ne jamais refuser cette cle ») avait ete ecrite d'abord :
 *    la mutation qui la retire laissait les temoins VERTS, parce que le
 *    pre-semis faisait deja tout le travail. Une protection qui ne peut pas
 *    tomber n'en est pas une — elle fait croire que le mecanisme est ailleurs.
 * 3. **La liste surveillee est RECONCILIEE avec la table de routage** au
 *    demarrage (`onReady`). Une adresse surveillee qui n'est montee nulle part
 *    ressort `matched: false` — jamais comme un zero.
 *
 * ## Fenetre glissante, en memoire, sans minuterie
 *
 * Un anneau de `sliceCount` tranches de `windowMs / sliceCount`. La rotation
 * est PARESSEUSE : la tranche dont l'epoque a change est videe a l'ecriture
 * suivante, jamais par un `setInterval`. Une minuterie serait une retention
 * (dimension 3) et rendrait les temoins dependants d'une horloge reelle ;
 * l'horloge est injectable, donc la fenetre se MESURE au lieu de s'attendre.
 *
 * L'agregat est MUTABLE a dessein — c'est le mecanisme meme, et le chemin le
 * plus chaud du gateway le traverse a chaque reponse. Tout ce qui franchit la
 * frontiere (echantillon en entree, instantane en sortie) est `readonly`.
 */

/** Lecture d'horloge, en millisecondes. Injectable pour que la fenetre se teste. */
export type Horloge = () => number;

/** Une adresse depreciee sous surveillance, et l'issue qui attend son zero. */
export type RouteSurveillee = {
  readonly method: string;
  /** Le motif MONTE, prefixe compris — celui que rend `request.routeOptions.url`. */
  readonly route: string;
  /** Le numero d'issue qui fait de son zero un critere de retrait. */
  readonly issue: number;
};

/** L'echantillon tel que le hook `onResponse` le lit, sans aucune identite. */
export type EchantillonUsage = {
  readonly method: string;
  /** `undefined` quand la requete n'a matche aucune route (404, mauvaise methode). */
  readonly routePattern: string | undefined;
  readonly versionHeader?: string | undefined;
  readonly platformHeader?: string | undefined;
  readonly userAgent?: string | undefined;
};

/** Un seau servi : une route, une origine, un compte, une derniere vue. */
export type SeauUsage = {
  readonly method: string;
  readonly route: string;
  readonly platform: string;
  readonly version: string;
  readonly count: number;
  readonly lastSeenAt: string | null;
  /** Vrai pour le seau TOTAL d'une route surveillee (origine `*` / `*`). */
  readonly total: boolean;
};

/** L'etat d'une adresse surveillee face a la table de routage reelle. */
export type EtatSurveillee = RouteSurveillee & {
  /** `null` tant que la reconciliation `onReady` n'a pas eu lieu. */
  readonly matched: boolean | null;
  readonly count: number;
  readonly lastSeenAt: string | null;
};

export type InstantaneUsage = {
  readonly instrumented: boolean;
  readonly reconciled: boolean;
  readonly instanceId: string;
  readonly observingSince: string;
  readonly observedForMs: number;
  readonly windowMs: number;
  readonly sliceCount: number;
  readonly generatedAt: string;
  readonly saturated: boolean;
  readonly droppedSamples: number;
  readonly distinctKeys: number;
  readonly maxKeysPerSlice: number;
  readonly watched: readonly EtatSurveillee[];
  readonly entries: readonly SeauUsage[];
  readonly blindSpots: readonly string[];
};

export type OptionsCompteur = {
  readonly windowMs?: number;
  readonly sliceCount?: number;
  readonly maxKeysPerSlice?: number;
  readonly clock?: Horloge;
  readonly watched?: readonly RouteSurveillee[];
  readonly instanceId?: string;
};

/** L'origine `*` : le seau TOTAL d'une route surveillee, jamais refuse. */
const TOUTES = '*';

/** Ce qui remplace le motif quand la requete n'a matche aucune route. */
export const ROUTE_NON_MONTEE = '(unrouted)';

/**
 * Le vocabulaire CLOS des plateformes. Un en-tete hors de cette liste retombe
 * sur `other` : la cardinalite de la cle est ainsi bornee par CONSTRUCTION,
 * pas par un plafond qu'un appelant pourrait epuiser a volonte.
 */
const PLATEFORMES = new Set(['ios', 'android', 'web', 'desktop', 'bot']);

/** Le format accepte d'une version : quatre nombres au plus, quatre chiffres chacun. */
const FORMAT_VERSION = /^\d{1,4}(\.\d{1,4}){0,3}$/;

/**
 * Plateforme, dans l'ordre de ce qui est le plus fiable.
 *
 * L'en-tete d'abord : iOS pose `X-Meeshy-Platform` et `X-App-Platform`
 * (`packages/MeeshySDK/Sources/MeeshySDK/Networking/ClientInfoProvider.swift`).
 * Le `User-Agent` ensuite, reduit a une FAMILLE — jamais conserve tel quel :
 * la chaine brute est une empreinte d'appareil autant qu'une cardinalite
 * illimitee, et ce fichier ne collecte ni l'une ni l'autre.
 */
export function normaliserPlateforme(
  platformHeader: string | undefined,
  userAgent: string | undefined
): string {
  const declare = platformHeader?.trim().toLowerCase();
  if (declare && PLATEFORMES.has(declare)) return declare;

  const ua = userAgent?.toLowerCase();
  if (!ua) return 'absent';
  if (ua.includes('okhttp') || ua.includes('android')) return 'android';
  if (ua.includes('cfnetwork') || ua.includes('darwin')) return 'ios';
  if (ua.includes('bot') || ua.includes('spider') || ua.includes('crawl')) return 'bot';
  if (ua.includes('curl') || ua.includes('wget') || ua.includes('python') || ua.includes('node')) return 'script';
  if (ua.includes('mozilla')) return 'web';
  return 'other';
}

/**
 * Version, ou la raison pour laquelle il n'y en a pas.
 *
 * `absent` et `invalid` sont des verdicts SERVIS, pas des trous : c'est ce qui
 * rend lisible le point aveugle mesure au § « Ce qui n'est PAS mesure » — web
 * et Android ne posent aujourd'hui AUCUN en-tete de version, donc leur trafic
 * tombe entier dans `absent` et aucun seau `android:1.2.0` ne peut exister.
 */
export function normaliserVersion(versionHeader: string | undefined): string {
  const brut = versionHeader?.trim();
  if (!brut) return 'absent';
  return FORMAT_VERSION.test(brut) ? brut : 'invalid';
}

type Compte = { n: number; vuA: number };
type Tranche = { epoque: number; comptes: Map<string, Compte> };

function cle(method: string, route: string, platform: string, version: string): string {
  return `${method} ${route} ${platform} ${version}`;
}

function relire(k: string): { method: string; route: string; platform: string; version: string } {
  const [method = '', route = '', platform = '', version = ''] = k.split(' ');
  return { method, route, platform, version };
}

/**
 * Ce que ce compteur NE VOIT PAS (critere 5 de #4275).
 *
 * Servi DANS la charge, pas seulement ecrit ici : celui qui lit un zero doit
 * lire ses angles morts dans le meme souffle. Un commentaire que personne
 * n'ouvre ne protege de rien, et **un faux zero autorise un retrait qui casse**.
 */
export const ANGLES_MORTS: readonly string[] = Object.freeze([
  "web-et-android-ne-posent-aucun-en-tete-de-version : seul iOS envoie X-Meeshy-Version / X-App-Version (verifie 2026-08-29 — apps/web/services/api.service.ts et ClientCapabilitiesInterceptor.kt ne posent que X-Canvas-Caps). Tout le trafic web et Android tombe donc dans version=absent, et aucun seau android:1.2.0 ne peut exister. Un zero y prouve l'absence de la PLATEFORME, jamais l'extinction d'une version.",
  "agregat-en-memoire-et-par-instance : il meurt au redemarrage et ne totalise pas les repliques. Un zero ne vaut que pour CETTE instance (voir instanceId) depuis observingSince. Prouver « zero sur deux versions publiees » exige d'ECHANTILLONNER cette route periodiquement et de conserver la serie ailleurs.",
  "cache-navigateur-et-service-worker : une reponse servie depuis un cache client ou un service worker n'atteint jamais le gateway. Un 304 conditionnel, lui, EST compte — il traverse la route.",
  "trafic-socket-io : les trames WebSocket ne produisent aucune reponse Fastify. Un evenement deprecie ne se mesure pas ici.",
  "routes-deja-retirees : une requete qui ne matche aucune route est comptee sous (unrouted), sans son URL — l'URL brute est une cardinalite non bornee. Le detail d'un 404 n'est donc pas attribuable.",
  "ventilation-sous-saturation : au-dela de maxKeysPerSlice, les NOUVELLES ventilations plateforme/version sont refusees (saturated=true, droppedSamples>0). Les TOTAUX des routes surveillees, eux, ne le sont jamais.",
]);

export class RouteUsageCounter {
  private readonly windowMs: number;
  private readonly sliceCount: number;
  private readonly sliceMs: number;
  private readonly maxKeysPerSlice: number;
  private readonly clock: Horloge;
  private readonly watched: readonly RouteSurveillee[];
  private readonly watchedKeys: Set<string>;
  private readonly instanceIdValue: string;
  private readonly tranches: Tranche[];
  private readonly startedAt: number;
  private readonly matched = new Map<string, boolean>();

  private instrumented = false;
  private reconciled = false;
  private droppedSamples = 0;
  private saturated = false;

  constructor(options: OptionsCompteur = {}) {
    this.windowMs = Math.max(1, options.windowMs ?? 24 * 60 * 60 * 1000);
    this.sliceCount = Math.max(1, options.sliceCount ?? 24);
    this.sliceMs = Math.max(1, Math.floor(this.windowMs / this.sliceCount));
    this.maxKeysPerSlice = Math.max(1, options.maxKeysPerSlice ?? 5000);
    this.clock = options.clock ?? Date.now;
    this.watched = options.watched ?? [];
    this.watchedKeys = new Set(this.watched.map((w) => `${w.method} ${w.route}`));
    this.instanceIdValue = options.instanceId ?? `${process.pid}`;
    this.tranches = Array.from({ length: this.sliceCount }, (): Tranche => ({
      epoque: -1,
      comptes: new Map<string, Compte>(),
    }));
    this.startedAt = this.clock();
  }

  /**
   * Declare par le poseur du hook. Sans lui, l'instantane ne serait qu'un tapis
   * de zeros IMPOSSIBLES a distinguer d'un trafic nul — le faux zero le plus
   * couteux du lot, puisqu'il est total.
   */
  markInstrumented(): void {
    this.instrumented = true;
  }

  /**
   * Reconcilie la liste surveillee avec la table de routage REELLE. Une adresse
   * absente ressort `matched: false` : son zero ne prouve alors rien sur les
   * appelants, seulement que le motif ecrit ici ne designe plus rien.
   */
  reconcile(existe: (route: RouteSurveillee) => boolean): void {
    for (const w of this.watched) {
      this.matched.set(`${w.method} ${w.route}`, existe(w));
    }
    this.reconciled = true;
  }

  /**
   * Le chemin CHAUD : aucune E/S, aucune promesse, aucune allocation au-dela de
   * la cle et — au premier passage d'une cle dans une tranche — d'un objet de
   * deux nombres. Une ecriture reseau par requete etait l'anti-motif ecarte par
   * le critere 3 de #4275.
   */
  record(echantillon: EchantillonUsage): void {
    const maintenant = this.clock();
    const tranche = this.trancheCourante(maintenant);
    const route = echantillon.routePattern ?? ROUTE_NON_MONTEE;

    if (this.watchedKeys.has(`${echantillon.method} ${route}`)) {
      // Le seau TOTAL. Il existe deja — le pre-semis de `trancheCourante` l'a
      // pose — donc il passe par la branche « cle connue », que le plafond ne
      // regarde jamais.
      this.incrementer(tranche, cle(echantillon.method, route, TOUTES, TOUTES), maintenant);
    }

    const platform = normaliserPlateforme(echantillon.platformHeader, echantillon.userAgent);
    const version = normaliserVersion(echantillon.versionHeader);
    this.incrementer(tranche, cle(echantillon.method, route, platform, version), maintenant);
  }

  /**
   * L'instantane de la fenetre, tel que la route S5 le sert.
   *
   * `portee: 'watched'` ne MATERIALISE que les adresses surveillees. Ce n'est
   * pas un filtre de confort : sur une instance saturee (24 tranches au
   * plafond) la table complete fait 118 666 entrees, et les composer puis les
   * trier coute **154 ms de boucle d'evenements** — bloquantes pour TOUT le
   * service, a chaque ouverture d'un onglet d'administration. Le comptage,
   * lui, reste integral : `distinctKeys` compte ce qui a ete vu, pas ce qui a
   * ete rendu.
   */
  snapshot(options: { readonly portee?: 'watched' | 'all' } = {}): InstantaneUsage {
    const surveilleesSeules = options.portee === 'watched';
    const maintenant = this.clock();
    // Faire tourner AVANT de lire : sans trafic, aucune tranche n'aurait ete
    // semee et les routes surveillees manqueraient — un zero ABSENT au lieu
    // d'un zero OBSERVE, exactement l'ambiguite que ce lot supprime.
    this.trancheCourante(maintenant);

    const epoqueCourante = Math.floor(maintenant / this.sliceMs);
    const fusion = new Map<string, Compte>();
    for (const tranche of this.tranches) {
      if (tranche.epoque < 0) continue;
      // Un emplacement de l'anneau peut porter une epoque anterieure d'un tour
      // entier quand le trafic s'est tu : elle est HORS fenetre, et la compter
      // ferait remonter un appel d'il y a des jours comme s'il datait d'hier.
      if (epoqueCourante - tranche.epoque >= this.sliceCount) continue;
      for (const [k, c] of tranche.comptes) {
        const deja = fusion.get(k);
        if (deja) {
          deja.n += c.n;
          if (c.vuA > deja.vuA) deja.vuA = c.vuA;
        } else {
          fusion.set(k, { n: c.n, vuA: c.vuA });
        }
      }
    }

    const entries: SeauUsage[] = [];
    for (const [k, c] of fusion) {
      const { method, route, platform, version } = relire(k);
      if (surveilleesSeules && !this.watchedKeys.has(`${method} ${route}`)) continue;
      entries.push({
        method,
        route,
        platform,
        version,
        count: c.n,
        lastSeenAt: c.vuA > 0 ? new Date(c.vuA).toISOString() : null,
        total: platform === TOUTES,
      });
    }
    // Tri par comparaison NUE, jamais `localeCompare` : une instance saturee
    // fusionne jusqu'a `sliceCount x maxKeysPerSlice` entrees, et la collation
    // linguistique y coute deux ordres de grandeur pour un ordre qui n'a aucune
    // exigence de langue — ce sont des chemins ASCII.
    entries.sort((a, b) => {
      if (a.count !== b.count) return b.count - a.count;
      if (a.route !== b.route) return a.route < b.route ? -1 : 1;
      if (a.method !== b.method) return a.method < b.method ? -1 : 1;
      return 0;
    });

    const watched: EtatSurveillee[] = this.watched.map((w) => {
      const total = fusion.get(cle(w.method, w.route, TOUTES, TOUTES));
      return {
        method: w.method,
        route: w.route,
        issue: w.issue,
        matched: this.matched.get(`${w.method} ${w.route}`) ?? null,
        count: total?.n ?? 0,
        lastSeenAt: total && total.vuA > 0 ? new Date(total.vuA).toISOString() : null,
      };
    });

    return {
      instrumented: this.instrumented,
      reconciled: this.reconciled,
      instanceId: this.instanceIdValue,
      observingSince: new Date(this.startedAt).toISOString(),
      observedForMs: Math.max(0, maintenant - this.startedAt),
      windowMs: this.windowMs,
      sliceCount: this.sliceCount,
      generatedAt: new Date(maintenant).toISOString(),
      saturated: this.saturated,
      droppedSamples: this.droppedSamples,
      distinctKeys: fusion.size,
      maxKeysPerSlice: this.maxKeysPerSlice,
      watched,
      entries,
      blindSpots: ANGLES_MORTS,
    };
  }

  private incrementer(tranche: Tranche, k: string, maintenant: number): void {
    const existant = tranche.comptes.get(k);
    if (existant) {
      existant.n += 1;
      existant.vuA = maintenant;
      return;
    }
    if (tranche.comptes.size >= this.maxKeysPerSlice) {
      // Refuser la NOUVELLE cle, jamais amputer une cle deja comptee : sous
      // pression, ce qui se degrade est la finesse, jamais les totaux.
      this.droppedSamples += 1;
      this.saturated = true;
      return;
    }
    tranche.comptes.set(k, { n: 1, vuA: maintenant });
  }

  /**
   * Rotation PARESSEUSE : la tranche de l'anneau dont l'epoque a change est
   * videe puis RE-SEMEE des routes surveillees a zero. Pas de `setInterval`,
   * donc pas de minuterie a retenir ni a demonter.
   *
   * Le semis PRECEDE le plafond : la borne memoire est donc
   * `sliceCount x (maxKeysPerSlice + routes surveillees)`, et non
   * `sliceCount x maxKeysPerSlice`. C'est le prix du zero OBSERVE, il est
   * connu d'avance et il ne depend d'aucun appelant.
   */
  private trancheCourante(maintenant: number): Tranche {
    const epoque = Math.floor(maintenant / this.sliceMs);
    const tranche = this.tranches[epoque % this.sliceCount] as Tranche;
    if (tranche.epoque !== epoque) {
      tranche.epoque = epoque;
      tranche.comptes.clear();
      for (const w of this.watched) {
        tranche.comptes.set(cle(w.method, w.route, TOUTES, TOUTES), { n: 0, vuA: 0 });
      }
    }
    return tranche;
  }
}

const CATEGORIES_PREFERENCES = [
  'privacy',
  'audio',
  'message',
  'notification',
  'video',
  'document',
  'application',
] as const;

/**
 * Les adresses DEPRECIEES, instrumentees en priorite (critere 4 de #4275).
 *
 * Chacune a ete VERIFIEE montee dans le code au 2026-08-29 — et la
 * reconciliation `onReady` le reverifie a chaque demarrage, parce qu'un motif
 * ecrit ici et plus monte rendrait un zero parfait pour une raison qui n'a rien
 * a voir avec les appelants.
 *
 * Trois adresses citees par les issues ne figurent PAS ici, et c'est delibere :
 * `GET /api/v1/me/me` a ete corrigee en `GET /api/v1/me` (#4141),
 * `GET /api/v1/users/me/test` a ete retiree (#4185), et `DELETE /api/v1/me/preferences`
 * est desormais une route CIBLE, pas un alias — #4181 a repris l'adresse sous
 * `?categories=` (absent = tout), qui absorbe les sept DELETE par categorie.
 * Les surveiller aurait produit des verdicts PERMANENTS et faux : `matched: false`
 * pour les deux premieres, un compteur qui ne tombe JAMAIS a zero pour la
 * troisieme. Une alarme qui crie sans arret finit par ne plus rien dire.
 */
export const ROUTES_SURVEILLEES: readonly RouteSurveillee[] = Object.freeze([
  // #4178 — la lecture de soi converge sur `GET /api/v1/me`
  { method: 'GET', route: '/api/v1/auth/me', issue: 4178 },
  { method: 'GET', route: '/api/v1/me/preferences/encryption', issue: 4178 },

  // #4181 — les vingt-huit routes par categorie de preferences
  ...CATEGORIES_PREFERENCES.flatMap((categorie) =>
    (['GET', 'PUT', 'PATCH', 'DELETE'] as const).map((method) => ({
      method,
      route: `/api/v1/me/preferences/${categorie}`,
      issue: 4181,
    }))
  ),
  // `GET /api/v1/me/preferences` n'est PAS surveillee : depuis #4181 c'est
  // l'adresse CIBLE, celle qui absorbe les sept GET par categorie. Son compteur
  // ne peut pas tomber a zero — le surveiller serait un faux zero inverse.

  // #4182 — les categories de conversation quittent les preferences
  { method: 'GET', route: '/api/v1/me/preferences/categories', issue: 4182 },
  { method: 'POST', route: '/api/v1/me/preferences/categories', issue: 4182 },
  { method: 'GET', route: '/api/v1/me/preferences/categories/:categoryId', issue: 4182 },
  { method: 'PATCH', route: '/api/v1/me/preferences/categories/:categoryId', issue: 4182 },
  { method: 'DELETE', route: '/api/v1/me/preferences/categories/:categoryId', issue: 4182 },
  { method: 'POST', route: '/api/v1/me/preferences/categories/reorder', issue: 4182 },

  // #4184 — changer d'e-mail ou de telephone exige la preuve de possession
  { method: 'PATCH', route: '/api/v1/users/me', issue: 4184 },
  { method: 'POST', route: '/api/v1/users/me/change-email', issue: 4184 },
  { method: 'POST', route: '/api/v1/users/me/verify-email-change', issue: 4184 },
  { method: 'POST', route: '/api/v1/users/me/resend-email-change-verification', issue: 4184 },
  { method: 'POST', route: '/api/v1/users/me/change-phone', issue: 4184 },
  { method: 'POST', route: '/api/v1/users/me/verify-phone-change', issue: 4184 },

  // #4161 — les trois alias de profil, dont la queue installee est longue
  { method: 'GET', route: '/api/v1/users/:id', issue: 4161 },
  { method: 'GET', route: '/api/v1/users/id/:id', issue: 4161 },
  { method: 'GET', route: '/api/v1/u/:username', issue: 4161 },
  { method: 'GET', route: '/api/v1/users/:userId/stats', issue: 4161 },

  // #4155 — signaler un contenu n'est plus un geste d'administration
  { method: 'POST', route: '/api/v1/admin/reports', issue: 4155 },

  // #4154 — les dix adresses historiques d'ecriture de compte
  { method: 'PATCH', route: '/api/v1/admin/users/:userId/role', issue: 4154 },
  { method: 'PATCH', route: '/api/v1/admin/users/:userId/status', issue: 4154 },
  { method: 'POST', route: '/api/v1/admin/users/:userId/unlock', issue: 4154 },
  { method: 'POST', route: '/api/v1/admin/users/:userId/enable-2fa', issue: 4154 },
  { method: 'POST', route: '/api/v1/admin/users/:userId/disable-2fa', issue: 4154 },
  { method: 'POST', route: '/api/v1/admin/users/:userId/verify-email', issue: 4154 },
  { method: 'POST', route: '/api/v1/admin/users/:userId/verify-phone', issue: 4154 },
  { method: 'POST', route: '/api/v1/admin/users/:userId/verify-age', issue: 4154 },
  { method: 'POST', route: '/api/v1/admin/users/:userId/voice-consent', issue: 4154 },
  { method: 'POST', route: '/api/v1/admin/users/:userId/reset-password', issue: 4154 },
]);

let singleton: RouteUsageCounter | null = null;

/** Le compteur du processus. Construit a la premiere demande, jamais avant. */
export function getRouteUsageCounter(): RouteUsageCounter {
  if (!singleton) singleton = new RouteUsageCounter({ watched: ROUTES_SURVEILLEES });
  return singleton;
}

/** Remplace le singleton — reserve aux temoins, qui doivent partir d'un etat connu. */
export function setRouteUsageCounterForTests(compteur: RouteUsageCounter | null): void {
  singleton = compteur;
}
