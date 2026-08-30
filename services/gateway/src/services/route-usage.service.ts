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
 * ## Une adresse hors `/api/v1/` se DECLARE, elle ne se devine pas (#4470)
 *
 * Un alias deprecie n'est servi que pour la duree de son sursis, et le depot
 * fait du zero de ce compteur — jamais d'une date posee a la main — le critere
 * de son retrait. Les neuf alias hors `/api/v1/` sont donc precisement les
 * adresses dont l'existence ne se justifie QUE par ce compteur : les omettre
 * rendait la question « les appelle-t-on encore ? » sans reponse possible la
 * ou elle est la plus utile.
 *
 * Le garde qui les excluait exigeait une FORME de chemin. Son remplacant exige
 * une RAISON : `horsPrefixe` porte la famille et le motif, `surveilleesMalDeclarees`
 * les confronte au chemin. Il est strictement plus contraignant — voir le
 * doc-comment de cette fonction.
 *
 * Le defaut etait CIRCULAIRE, et sa forme merite d'etre retenue : la table
 * brute comptait bien ces neuf adresses (`record()` n'a jamais regarde le
 * prefixe), mais la portee `watched` — la SEULE que la route S5 sert par
 * defaut — ne les MATERIALISAIT pas. Un temoin pose sur le comptage serait
 * donc reste vert des deux cotes du correctif. **La question a poser a un
 * compteur n'est pas « compte-t-il ? » mais « SERT-il ce qu'il compte, a qui
 * doit en decider ? »**
 *
 * ## Fenetre glissante, en memoire, sans minuterie
 *
 * Un anneau de `sliceCount` tranches de `windowMs / sliceCount`. La rotation
 * est PARESSEUSE : la tranche dont l'epoque a change est videe a l'ecriture
 * suivante, jamais par un `setInterval`. Une minuterie serait une retention
 * (dimension 3) et rendrait les temoins dependants d'une horloge reelle ;
 * l'horloge est injectable, donc la fenetre se MESURE au lieu de s'attendre.
 *
 * ## Non-persistance — la limite qu'aucun reglage de fenetre ne referme
 *
 * Cet agregat vit EN MEMOIRE du processus et disparait a chaque redeploiement.
 * Ce n'est pas un detail : un compte a zero peut vouloir dire « personne
 * n'appelle plus cette route » OU « le gateway a redemarre il y a moins que la
 * fenetre » — indiscernables depuis le seul compte. C'est pourquoi l'instantane
 * porte `observingSince`, `observedForMs` et `instanceId` : un lecteur voit
 * combien de trafic l'instantane reflete REELLEMENT, et un redemarrage change
 * l'identifiant d'instance, donc se REMARQUE au lieu de se deguiser en preuve.
 * Allonger la fenetre ne referme pas ce point — elle rendrait la configuration
 * malhonnete pour un agregat qui ne survit pas au redeploiement. Le fermer
 * demande une persistance (Redis, metriques scrapees) : hors de portee ici.
 *
 * L'agregat est MUTABLE a dessein — c'est le mecanisme meme, et le chemin le
 * plus chaud du gateway le traverse a chaque reponse. Tout ce qui franchit la
 * frontiere (echantillon en entree, instantane en sortie) est `readonly`.
 */

/** Lecture d'horloge, en millisecondes. Injectable pour que la fenetre se teste. */
export type Horloge = () => number;

/**
 * Ou vit une adresse surveillee qui n'est PAS sous `/api/v1/`.
 *
 * `alias-racine` : servie hors de `/api` — donc hors de toute regle ancree sur
 * ce prefixe (proxy, WAF, journal). `alias-non-versionne` : servie sous `/api`
 * mais sans version. La distinction n'est pas decorative : `surveilleesMalDeclarees`
 * la CONFRONTE au chemin, de sorte qu'une famille fausse rougisse.
 */
export type FamilleHorsPrefixe = 'alias-racine' | 'alias-non-versionne';

/** Ce qu'une adresse hors `/api/v1/` doit DIRE pour figurer dans la liste. */
export type DeclarationHorsPrefixe = {
  readonly famille: FamilleHorsPrefixe;
  /** Pourquoi cette adresse existe hors du prefixe, et ce que son zero autorise. */
  readonly raison: string;
};

/** Une adresse depreciee sous surveillance, et l'issue qui attend son zero. */
export type RouteSurveillee = {
  readonly method: string;
  /** Le motif MONTE, prefixe compris — celui que rend `request.routeOptions.url`. */
  readonly route: string;
  /** Le numero d'issue qui fait de son zero un critere de retrait. */
  readonly issue: number;
  /** REQUISE des que `route` ne commence pas par `/api/v1/` — et INTERDITE sinon. */
  readonly horsPrefixe?: DeclarationHorsPrefixe;
};

/** Pourquoi une entree est refusee. Un seul motif par entree : le premier rencontre. */
export type MotifMauvaiseDeclaration =
  | 'chemin-non-absolu'
  | 'hors-prefixe-sans-declaration'
  | 'raison-vide'
  | 'declaration-perimee'
  | 'famille-dementie';

export type SurveilleeMalDeclaree = {
  readonly method: string;
  readonly route: string;
  readonly motif: MotifMauvaiseDeclaration;
};

/** Le nom d'une adresse retiree, si l'echantillon en vise une (#4365). */
export function routeRetireeDe(echantillon: { method: string; rawPath?: string | undefined }): string | undefined {
  if (!echantillon.rawPath) return undefined;
  const chemin = echantillon.rawPath.split('?')[0];
  return ROUTES_RETIREES.has(`${echantillon.method} ${chemin}`) ? chemin : undefined;
}

/** L'echantillon tel que le hook `onResponse` le lit, sans aucune identite. */
export type EchantillonUsage = {
  readonly method: string;
  /** `undefined` quand la requete n'a matche aucune route (404, mauvaise methode). */
  readonly routePattern: string | undefined;
  readonly versionHeader?: string | undefined;
  readonly platformHeader?: string | undefined;
  readonly userAgent?: string | undefined;
  /**
   * Le chemin BRUT, sans requête — le seul témoin d'une route RETIRÉE (#4365).
   *
   * Quand une adresse n'est plus montée, `routePattern` est `undefined` et
   * tout son trafic tombe dans le seau unique `(unrouted)`. On sait alors
   * qu'il y a des 404, jamais SUR QUOI. C'est précisément la question que
   * posent les quatre lots de retrait : « ce couple est-il encore appelé ? ».
   */
  readonly rawPath?: string | undefined;
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
 * Les adresses RETIRÉES qu'on veut continuer à compter (#4365).
 *
 * ## Pourquoi elles ne peuvent pas passer par `ROUTES_SURVEILLEES`
 *
 * Le compteur s'attache aux routes SERVIES : une adresse retirée n'est plus
 * montée, donc `routePattern` vaut `undefined` et son trafic se noie dans le
 * seau unique `(unrouted)` avec toutes les fautes de frappe de la planète. On
 * sait qu'il y a des 404 ; on ne sait pas sur quoi — et c'est exactement la
 * question que posent les quatre lots de retrait (#4186, #4187, #4188, #4190),
 * dont le critère commun exige « journaux d'accès à zéro sur 30 jours ».
 *
 * ## Le zéro que cette table rend LISIBLE, et celui qu'elle ne rend pas
 *
 * Un couple ABSENT de cette table et à zéro dans `(unrouted)` ne prouve rien —
 * `(unrouted)` agrège. Un couple PRÉSENT ici et à zéro prouve qu'aucune
 * requête n'a atteint cette adresse pendant la fenêtre. C'est la seule forme
 * de zéro qui vaille, et elle exige de DÉCLARER ce qu'on surveille avant de
 * pouvoir l'affirmer.
 *
 * ## Ce qu'elle ne corrige pas, et qui doit se lire avec le chiffre
 *
 * Les deux angles morts que #4275 nomme déjà valent ici : un cache navigateur
 * ou un service worker sert sans atteindre le gateway, et l'agrégat est en
 * mémoire, par instance. Un zéro se lit AVEC eux, jamais seul.
 *
 * Le chemin est comparé LITTÉRALEMENT (après retrait de la requête) : ces
 * adresses n'ont pas de paramètre, ou alors elles n'entrent pas ici.
 */
export const ROUTES_RETIREES: ReadonlySet<string> = new Set([
  'POST /api/v1/auth/validate-session',
  'GET /api/v1/auth/magic-link/validate',
  'GET /api/v1/me/me',
  'GET /api/v1/users/me/test',
]);

/**
 * Le vocabulaire CLOS des plateformes. Un en-tete hors de cette liste retombe
 * sur `other` : la cardinalite de la cle est ainsi bornee par CONSTRUCTION,
 * pas par un plafond qu'un appelant pourrait epuiser a volonte.
 */
const PLATEFORMES = new Set(['ios', 'android', 'web', 'desktop', 'bot']);

/** Le format accepte d'une version : quatre nombres au plus, quatre chiffres chacun. */
const FORMAT_VERSION = /^\d{1,4}(\.\d{1,4}){0,3}$/;

/**
 * Plafond de longueur applique AVANT le motif.
 *
 * Le motif est deja borne, donc il ne peut pas exploser ; ce plafond est une
 * ceinture sur l'ENTREE elle-meme — un en-tete d'un megaoctet ne traverse meme
 * pas le moteur d'expressions, et ne peut pas devenir une cle.
 */
const LONGUEUR_VERSION_MAX = 32;

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
  if (brut.length > LONGUEUR_VERSION_MAX) return 'invalid';
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
    // Une adresse RETIRÉE garde son nom plutôt que de se noyer dans
    // `(unrouted)` — sans quoi son zéro serait indistinguable de celui d'une
    // faute de frappe (#4365).
    const route = echantillon.routePattern ?? routeRetireeDe(echantillon) ?? ROUTE_NON_MONTEE;

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
 *
 * Depuis #4470 la liste porte aussi les NEUF alias depreciees servies hors de
 * `/api/v1/` — cinq a la racine (`voiceAnalysisLegacyAliasRoutes`) et quatre
 * sous `/api` sans version (`socketIOAdminRoutes`, `attachmentLegacyFileRoutes`,
 * `userDeletionsRoutes`). Elles se trouvent en croisant le manifeste (les 17
 * adresses hors `/api/v1`) avec les sites qui posent `depreciee()` : c'est ce
 * croisement, et non une lecture, qui garantit qu'aucune ne manque.
 * Chacune declare sa famille et sa raison via `horsPrefixe`, faute de quoi
 * `surveilleesMalDeclarees` la refuse.
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

  // ── Les trente-sept adresses DEPRECIEES sous `/api/v1/` (#4488) ───────────
  //
  // #4470 avait enumere les adresses hors prefixe ; la surface D'A COTE — meme
  // dispositif, meme doctrine, sous le prefixe — etait restee dehors. Trente-
  // sept adresses posaient `depreciee(...)` sans qu'aucun seau ne les
  // materialise : leur `Deprecation` partait, leur successeur partait, et
  // personne ne pouvait savoir si on les appelait encore. Une annonce dont
  // aucun compteur ne peut tirer la consequence n'annonce rien.
  //
  // Elles ne se trouvent PAS en relisant cette liste — qui est juste pour ce
  // qu'elle contient — mais en partant des sites de depreciation du code et en
  // exigeant la reciproque. C'est ce que fait le balayage
  // `__tests__/security/deprecation-coverage-sweep.ts`, seul temoin du depot
  // dont la fleche va du CODE vers cette liste.

  // #4149 — les neuf listes de posts convergent sur `GET /social/posts?scope=`
  { method: 'GET', route: '/api/v1/posts/feed', issue: 4149 },
  { method: 'GET', route: '/api/v1/posts/feed/stories', issue: 4149 },
  { method: 'GET', route: '/api/v1/posts/stories/mine', issue: 4149 },
  { method: 'GET', route: '/api/v1/posts/feed/reels', issue: 4149 },
  { method: 'GET', route: '/api/v1/posts/feed/statuses', issue: 4149 },
  { method: 'GET', route: '/api/v1/posts/feed/statuses/discover', issue: 4149 },
  { method: 'GET', route: '/api/v1/posts/user/:userId', issue: 4149 },
  { method: 'GET', route: '/api/v1/posts/community/:communityId', issue: 4149 },
  { method: 'GET', route: '/api/v1/posts/bookmarks', issue: 4149 },

  // #4346 — les trois listes restantes rejoignent la meme union
  { method: 'GET', route: '/api/v1/posts/hashtag/:tag', issue: 4346 },
  { method: 'GET', route: '/api/v1/posts/nearby', issue: 4346 },
  { method: 'GET', route: '/api/v1/sounds/:id/posts', issue: 4346 },

  // #4283 — les cinq portes de demande d'ami cessent de diverger de `/directory`
  { method: 'POST', route: '/api/v1/friend-requests', issue: 4283 },
  { method: 'GET', route: '/api/v1/friend-requests/received', issue: 4283 },
  { method: 'GET', route: '/api/v1/friend-requests/sent', issue: 4283 },
  { method: 'PATCH', route: '/api/v1/friend-requests/:id', issue: 4283 },
  { method: 'DELETE', route: '/api/v1/friend-requests/:id', issue: 4283 },

  // #4167 — les trois portes anonymes deleguent a la loi d'admission unique
  { method: 'POST', route: '/api/v1/anonymous/join/:linkId', issue: 4167 },
  { method: 'POST', route: '/api/v1/anonymous/refresh', issue: 4167 },
  { method: 'POST', route: '/api/v1/anonymous/leave', issue: 4167 },

  // #4170 — `GET /links` absorbe les trois lectures et les deux ecritures
  { method: 'GET', route: '/api/v1/links/my-links', issue: 4170 },
  { method: 'GET', route: '/api/v1/links/stats', issue: 4170 },
  { method: 'PATCH', route: '/api/v1/links/:linkId/toggle', issue: 4170 },
  { method: 'PATCH', route: '/api/v1/links/:linkId/extend', issue: 4170 },

  // #4164 — `/directory/blocks` devient l'ENSEMBLE des blocages
  { method: 'POST', route: '/api/v1/users/:userId/block', issue: 4164 },
  { method: 'DELETE', route: '/api/v1/users/:userId/block', issue: 4164 },
  { method: 'GET', route: '/api/v1/users/me/blocked-users', issue: 4164 },

  // Le partage de conversation, trois adresses et trois lots distincts
  { method: 'POST', route: '/api/v1/conversations/:id/new-link', issue: 4169 },
  { method: 'GET', route: '/api/v1/conversations/:conversationId/links', issue: 4351 },
  { method: 'POST', route: '/api/v1/conversations/join/:linkId', issue: 4353 },

  // #4349 — les cinq adaptateurs de la collection unique d'accuses de lecture
  { method: 'GET', route: '/api/v1/conversations/:conversationId/read-statuses', issue: 4349 },
  { method: 'POST', route: '/api/v1/conversations/:conversationId/mark-as-read', issue: 4349 },
  { method: 'POST', route: '/api/v1/conversations/:conversationId/mark-as-received', issue: 4349 },
  { method: 'POST', route: '/api/v1/conversations/:conversationId/messages/:messageId/delivery-receipt', issue: 4349 },
  { method: 'POST', route: '/api/v1/conversations/:id/mark-read', issue: 4349 },

  // #4350 — lire ses propres permissions n'est pas un geste d'administration
  { method: 'GET', route: '/api/v1/admin/me/permissions', issue: 4350 },

  // #4158 — la disponibilite d'un identifiant passe par `/directory`
  { method: 'GET', route: '/api/v1/auth/check-availability', issue: 4158 },

  // ── Les neuf alias DEPRECIES hors `/api/v1/` (#4470) ──────────────────────
  //
  // Ils sont la raison d'etre de `horsPrefixe`. Chacun est servi UNIQUEMENT
  // pour la duree de son sursis, et les trois modules qui les posent designent
  // tous ce compteur comme l'arbitre de leur retrait (#4275). Les omettre
  // laissait la question « les appelle-t-on encore ? » sans reponse possible
  // sur les SEULES adresses dont l'existence ne se justifie que par un sursis.
  //
  // La table brute les comptait deja : ce qui manquait etait leur
  // MATERIALISATION — seau TOTAL, pre-semis a zero, ligne `watched` avec son
  // `matched` — dans la portee que sert la route S5.
  {
    method: 'GET',
    route: '/attachments/:attachmentId/analysis',
    issue: 4277,
    horsPrefixe: {
      famille: 'alias-racine',
      raison:
        "Alias racine de GET /api/v1/attachments/:attachmentId/analysis (voiceAnalysisLegacyAliasRoutes, " +
        'routes/voice-analysis.ts), servi jusqu\'au sunset du 2027-02-25 INCLUS.',
    },
  },
  {
    method: 'POST',
    route: '/attachments/:attachmentId/analysis',
    issue: 4277,
    horsPrefixe: {
      famille: 'alias-racine',
      raison:
        'Alias racine de POST /api/v1/attachments/:attachmentId/analysis (voiceAnalysisLegacyAliasRoutes), ' +
        'servi jusqu\'au sunset du 2027-02-25 INCLUS.',
    },
  },
  {
    method: 'POST',
    route: '/attachments/batch/analysis',
    issue: 4277,
    horsPrefixe: {
      famille: 'alias-racine',
      raison:
        'Alias racine de POST /api/v1/attachments/batch/analysis (voiceAnalysisLegacyAliasRoutes), servi ' +
        'jusqu\'au sunset du 2027-02-25 INCLUS.',
    },
  },
  {
    method: 'GET',
    route: '/voice/analysis',
    issue: 4277,
    horsPrefixe: {
      famille: 'alias-racine',
      raison:
        'Alias racine de GET /api/v1/voice/analysis (voiceAnalysisLegacyAliasRoutes), servi jusqu\'au sunset ' +
        'du 2027-02-25 INCLUS.',
    },
  },
  {
    method: 'POST',
    route: '/voice/analysis',
    issue: 4277,
    horsPrefixe: {
      famille: 'alias-racine',
      raison:
        'Alias racine de POST /api/v1/voice/analysis (voiceAnalysisLegacyAliasRoutes), servi jusqu\'au sunset ' +
        'du 2027-02-25 INCLUS.',
    },
  },

  // #4376 — les deux gestes d'administration Socket.IO portaient leur chemin
  // EN DUR, sans version. `aliasNonVersionne()` pose leurs trois en-tetes et
  // renvoie sur `apiPath(...)` ; leur doc-comment dit deja que le retrait se
  // decide « sur un compteur d'acces nul (#4275) », pas sur un grep client.
  {
    method: 'GET',
    route: '/api/socketio/stats',
    issue: 4376,
    horsPrefixe: {
      famille: 'alias-non-versionne',
      raison:
        'Alias non versionne de GET /api/v1/socketio/stats (socketio/socketio-admin-routes.ts), sunset ' +
        'du 2027-02-26. Une console tierce, un signet ou un script ne sont dans aucun grep.',
    },
  },
  {
    method: 'POST',
    route: '/api/socketio/disconnect-user',
    issue: 4376,
    horsPrefixe: {
      famille: 'alias-non-versionne',
      raison:
        'Alias non versionne de POST /api/v1/socketio/disconnect-user (socketio/socketio-admin-routes.ts), ' +
        'sunset du 2027-02-26.',
    },
  },

  // #4324 — la migration 013 a reecrit les `fileUrl` persistees ; ce qui reste
  // sont les notifications DEJA LIVREES, qu'aucun deploiement ne rattrape. Le
  // module le dit mot pour mot : « son retrait se decidera sur le compteur
  // d'acces (#4275) plutot que sur une revue de code ».
  // #4317 — la decision « laquelle des deux implementations de delete-for-me
  // survit ? » est PRISE : `routes/conversations/delete-for-me.ts` reste, et
  // cette adresse-ci devient un alias en sursis. Son doc-comment le dit mot
  // pour mot — « le retrait reel reste gouverne par le compteur d'acces nul
  // (#4275). Ici le compteur devrait tomber vite : aucun des trois clients
  // n'appelle cette adresse » — et le compteur ne la materialisait pas.
  //
  // Les SIX autres routes de `userDeletionsRoutes` ne sont PAS ici : aucune ne
  // porte l'annonce (`depreciee`), aucune n'a de successeur, ce sont des
  // `known-gap` en attente d'une decision produit — pas des alias en sursis.
  {
    method: 'DELETE',
    route: '/api/conversations/:conversationId/delete-for-me',
    issue: 4317,
    horsPrefixe: {
      famille: 'alias-non-versionne',
      raison:
        'Alias non versionne de DELETE /api/v1/conversations/:id/delete-for-me (routes/user-deletions.ts), ' +
        'sunset du 2027-02-26 — seule route de son module a porter l\'annonce, la decision #4317 etant prise.',
    },
  },
  {
    method: 'GET',
    route: '/api/attachments/file/*',
    issue: 4324,
    horsPrefixe: {
      famille: 'alias-non-versionne',
      raison:
        'Alias non versionne de lecture d\'octets (attachmentLegacyFileRoutes, routes/attachments/index.ts), ' +
        'sunset du 2027-02-26 — des notifications deja livrees portent des adresses de cette forme.',
    },
  },
]);

/**
 * `/api` exactement, ou `/api/…` — jamais `startsWith('/api')` seul, qui
 * rangerait `/apiary` sous le perimetre d'une regle qui ne le couvre pas.
 *
 * Le predicat est ECRIT ICI plutot qu'importe de
 * `__tests__/route-manifest/unprefixed-mounts.ts`, qui porte le meme : un
 * service de production n'importe pas d'un module de temoins.
 */
export function servieSousApi(route: string): boolean {
  return route === '/api' || route.startsWith('/api/');
}

/**
 * Les entrees que la liste surveillee ne DECLARE pas correctement.
 *
 * ## Pourquoi une declaration, et non une forme de chemin
 *
 * Le garde precedent exigeait `route.startsWith('/api/v1/')`. Il empechait
 * bien qu'une entree soit ajoutee sans passer par l'adresse canonique — et
 * c'est ce qu'on veut pour les cinquante-sept adresses versionnees. Mais il
 * rendait IMPOSSIBLE de surveiller les huit alias depreciees qui, par
 * construction, n'ont pas ce prefixe : le mecanisme cense gouverner leur
 * retrait ne pouvait pas les voir (#4470).
 *
 * Le relacher aurait ete pire que le defaut. Ce garde-ci n'interdit donc pas
 * une FORME, il exige une RAISON — le patron que le depot emploie deja deux
 * fois (`ALLOWED_OUTSIDE_API_V1`, `UNPREFIXED_MOUNT_DECISIONS`) — et il est
 * strictement plus contraignant que celui qu'il remplace :
 *
 *  - une entree prefixee reste acceptee, et ne peut PAS porter de declaration
 *    (`declaration-perimee`) : une justification posee « au cas ou » ne veut
 *    plus rien dire quand elle ne justifie rien ;
 *  - une entree hors prefixe passe UNIQUEMENT avec sa famille et sa raison,
 *    non vide ;
 *  - la famille est CONFRONTEE au chemin (`famille-dementie`) — sans quoi elle
 *    serait un commentaire, pas une declaration ;
 *  - tout chemin, prefixe ou non, doit etre ABSOLU : un motif relatif ne
 *    designe aucune route Fastify et ne pourrait produire qu'un `matched`
 *    faux a jamais.
 *
 * Une liste vide est le seul resultat acceptable.
 */
export function surveilleesMalDeclarees(
  routes: readonly RouteSurveillee[] = ROUTES_SURVEILLEES
): SurveilleeMalDeclaree[] {
  return routes.flatMap((r): SurveilleeMalDeclaree[] => {
    const motif = motifDe(r);
    return motif === null ? [] : [{ method: r.method, route: r.route, motif }];
  });
}

function motifDe(r: RouteSurveillee): MotifMauvaiseDeclaration | null {
  if (!r.route.startsWith('/')) return 'chemin-non-absolu';
  if (r.route.startsWith('/api/v1/')) return r.horsPrefixe ? 'declaration-perimee' : null;
  if (!r.horsPrefixe) return 'hors-prefixe-sans-declaration';
  if (r.horsPrefixe.raison.trim() === '') return 'raison-vide';
  const racine = r.horsPrefixe.famille === 'alias-racine';
  return racine === servieSousApi(r.route) ? 'famille-dementie' : null;
}

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
