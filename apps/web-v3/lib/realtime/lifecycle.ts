/**
 * Le SITE UNIQUE du cycle de vie de la v3 (conception § 3.3, § 6.2, § 7).
 *
 * Sept événements du navigateur disent la même histoire — l'onglet part, il
 * revient, le réseau tombe, un autre onglet a bougé — et chacun est un piège
 * pris séparément : `visibilitychange` se déclenche à CHAQUE bascule
 * d'application, `pageshow{persisted}` est le seul signal d'un retour de
 * bfcache (aucun effet React ne s'y remonte), `beforeunload` bloque ce même
 * bfcache et ne se déclenche pas sur mobile. Les laisser s'écouter écran par
 * écran, c'est réécrire sept fois une machine à états — et la voir diverger.
 *
 * Ce module les NORMALISE en sept transitions et n'en émet aucune autre. Il ne
 * connaît ni le socket, ni l'API, ni le jeton : il dit QUAND, jamais QUOI.
 *
 * Cinq lois y sont structurelles, pas déclaratives :
 *
 *   1. **Un onglet caché ne fait RIEN partir.** `visibilitychange:hidden`
 *      n'émet aucune requête, ne mute rien, et surtout n'appelle JAMAIS
 *      `leave` : la place d'un invité est un BAIL SERVEUR (§ 6.2), et un
 *      signal qui se déclenche quand il ne faut pas ET se tait quand il
 *      faudrait — arrêt forcé, crash, tunnel coupé — ne peut pas tenir un
 *      compteur d'admission.
 *   2. **La visibilité et le réseau sont DEUX faits, jamais un loquet.** Un
 *      onglet est ACTIF quand il est à l'écran ET en ligne ; `masquage` dit le
 *      premier fait, `perte-du-reseau` le second, et la `reprise` n'est émise
 *      que sur la transition inactif → actif. Un loquet unique avalait le
 *      masquage d'un onglet caché pendant une coupure — le consommateur ne
 *      coupait donc pas ses travaux de fond, contre le gate « onglet caché ⇒
 *      ZÉRO requête » (§ 8.5) — et émettait une reprise HORS LIGNE, que le § 7
 *      interdit nommément (« aucun appel, aucune destruction de jeton »).
 *   3. **L'état de DÉPART s'annonce.** Une page chargée hors ligne dit sa perte
 *      du réseau AVANT tout événement — sans quoi la bannière du § 7 ne serait
 *      jamais peinte —, et un onglet monté caché dit son masquage. Ce module
 *      est le seul site autorisé à lire `navigator.onLine` : personne d'autre
 *      ne PEUT le dire sans écrire une seconde source de vérité (§ 3.2).
 *   4. **Un seul onglet porte le battement, PAR LIEN.** Le canal est indexé par
 *      la clé du jeton — la même que le stockage `meeshy.guest.<lien>`
 *      (§ 6.3 état E) —, si bien que l'onglet d'un second lien ne peut pas
 *      faire taire le premier ; et l'élection se DÉPARTAGE (priorité, puis
 *      identifiant d'onglet) au lieu de céder inconditionnellement : deux
 *      revendications qui se croisent laissent UN porteur, jamais zéro. Sans
 *      canal (navigateur qui ne l'a pas), chaque onglet bat — dégradation
 *      assumée, jamais une panne.
 *   5. **La cadence tient une HORLOGE, pas une minuterie.** Le battement est dû
 *      `intervalleMs` après le précédent, pas après `intervalleMs` de
 *      visibilité ININTERROMPUE : une minuterie reconstruite à chaque bascule
 *      ne bat jamais sous le geste même du rôle premier (§ 6.2), et la preuve
 *      de présence du § 6.4 cesse alors d'être produite.
 *
 * La CADENCE du battement vit ici ; la REQUÊTE qu'il déclenche vit chez
 * l'appelant (`lib/api/guest-session.ts`). C'est ce partage qui rend la loi 1
 * vraie par construction : un onglet caché n'a pas de minuterie du tout.
 */

const RACINE_DU_CANAL = 'meeshy-guest';

/**
 * Le canal d'élection est indexé par le LIEN, exactement comme le stockage.
 *
 * Le § 6.1 point 7 a mesuré ce que coûte une clé globale dans `apps/web` : un
 * second lien écrase le jeton du premier. Un canal global rejouait le même
 * défaut une couche plus haut — l'onglet du lien B faisait taire celui du lien
 * A, dont le bail (§ 6.4, N = 10 min) n'était alors plus jamais renouvelé,
 * jusqu'au 401 de l'état F. Le nom se DÉRIVE donc de la clé du jeton déjà
 * reçue : la portée de l'élection et celle du stockage ne peuvent plus
 * diverger, et il ne reste aucune constante globale à réintroduire.
 */
export const canalDuLien = (cleDuJeton: string): string => `${RACINE_DU_CANAL}.${cleDuJeton}`;

export type CauseDeReprise = 'visible' | 'bfcache' | 'reseau';

/**
 * Les sept transitions, et rien d'autre.
 *
 * `masquage` · `reprise` · `perte-du-reseau` · `destruction` ·
 * `jeton-externe` · `porteur-du-battement` — la septième est le SILENCE de
 * `pagehide{persisted:true}` : un gel de bfcache ne s'annonce pas, parce que
 * la page va revivre et qu'aucun consommateur ne doit y réagir.
 */
export type TransitionDeCycle =
  | { readonly type: 'masquage' }
  | { readonly type: 'reprise'; readonly cause: CauseDeReprise }
  | { readonly type: 'perte-du-reseau' }
  | { readonly type: 'destruction' }
  | { readonly type: 'jeton-externe'; readonly cle: string | null; readonly valeur: string | null }
  | { readonly type: 'porteur-du-battement'; readonly porteur: boolean };

export type Balise = { readonly url: string; readonly corps: string };

export type Battement = { readonly intervalleMs: number; readonly battre: () => void };

export type OptionsDuCycleDeVie = {
  readonly sur: (transition: TransitionDeCycle) => void;
  /**
   * La clé ENTIÈRE du jeton — `cleDuLien(lien)` de `lib/api/guest-session.ts`,
   * jamais un fragment. Ce module n'en compose rien : il en dérive le canal du
   * lien, et il filtre `storage` dessus par ÉGALITÉ.
   *
   * Le champ s'appelait `prefixeDuJeton`, et ce mot a coûté exactement ce qu'il
   * annonçait : le filtre était un `startsWith`, si bien que l'onglet du lien
   * `mshy_support` recevait la valeur du lien `mshy_support-link` — jeton,
   * `participantId` et pseudo d'autrui, qu'un décodeur rend en session
   * parfaitement valide. Une clé de lien n'a AUCUNE sous-clé (`cleDuLien` n'en
   * produit pas), et rien n'interdit qu'un `identifier` choisi par un hôte soit
   * le préfixe d'un autre (`schema.prisma:577-579`).
   *
   * Ce module n'appelle PAS `estLaCleDu` du détenteur, et ce n'est pas un
   * oubli : cette fonction répond à « cette clé appartient-elle à CE LIEN ? »,
   * ce qui suppose de connaître la racine `meeshy.guest.` — la composer ici est
   * précisément ce que la zone interdit (`eslint.config.mjs`,
   * `SITE_UNIQUE_DU_CYCLE`). La question posée ici est plus pauvre et se répond
   * sans elle : « cette clé est-elle CELLE QU'ON M'A DONNÉE ? ». Un `===`, donc,
   * et aucune seconde source de vérité.
   */
  readonly cleDuJeton: string;
  readonly telemetrie?: () => Balise | null;
  readonly battement?: Battement;
  readonly onglet?: string;
};

type MessageDuCanal =
  | {
      readonly type: 'revendication';
      readonly onglet: string;
      readonly lien: string;
      readonly priorite: number;
    }
  | { readonly type: 'retrait'; readonly onglet: string; readonly lien: string };

type Etat = {
  /** L'onglet n'est pas à l'écran — `visibilitychange:hidden` ou `pagehide{persisted}`. */
  readonly cache: boolean;
  readonly enLigne: boolean;
  readonly porteur: boolean;
  /** L'instant de MA revendication : ce qui me départage d'un voisin revendiquant au même moment. */
  readonly priorite: number;
  readonly detruite: boolean;
};

const messageDuCanal = (donnee: unknown): MessageDuCanal | null => {
  if (typeof donnee !== 'object' || donnee === null) return null;
  if (!('type' in donnee) || !('onglet' in donnee) || !('lien' in donnee)) return null;

  const { type, onglet, lien } = donnee;
  if (typeof onglet !== 'string' || typeof lien !== 'string') return null;
  if (type === 'retrait') return { type, onglet, lien };
  if (type !== 'revendication') return null;
  if (!('priorite' in donnee)) return null;

  const { priorite } = donnee;
  if (typeof priorite !== 'number' || !Number.isFinite(priorite)) return null;

  return { type, onglet, lien, priorite };
};

/**
 * Une balise de télémétrie ne libère JAMAIS la place : `POST
 * /anonymous/leave` est une porte à SENS UNIQUE (§ 6.1) — il pose
 * `isActive:false`, le retour coûte une identité neuve, un pseudo suffixé et
 * trois compteurs, et le décrément n'a pas de plancher. Une URL qu'on
 * n'arrive pas à lire est refusée pour la même raison.
 */
const viseUnDepart = (url: string): boolean => {
  try {
    return new URL(url, 'https://meeshy.invalid').pathname.split('/').includes('leave');
  } catch {
    return true;
  }
};

const identifiantDOnglet = (): string => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

/**
 * L'horloge des revendications, STRICTEMENT croissante à l'intérieur d'un
 * document.
 *
 * `Date.now()` suffit à départager deux onglets réels, mais deux revendications
 * nées dans la même milliseconde rendraient « le dernier onglet passé visible
 * gagne » (§ 6.3 état E) dépendant du hasard. Le compteur garantit l'ordre là
 * où il est connaissable ; entre documents, l'égalité retombe sur la
 * comparaison totale des identifiants d'onglet.
 */
let dernierePriorite = 0;

const prochainePriorite = (): number => {
  dernierePriorite = Math.max(Date.now(), dernierePriorite + 1);
  return dernierePriorite;
};

export const observeCycleDeVie = (options: OptionsDuCycleDeVie): (() => void) => {
  if (typeof window === 'undefined' || typeof document === 'undefined') return () => {};

  const onglet = options.onglet ?? identifiantDOnglet();
  const lien = options.cleDuJeton;
  const canal = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel(canalDuLien(lien));

  const visible = (): boolean => document.visibilityState === 'visible';

  let etat: Etat = {
    cache: !visible(),
    enLigne: window.navigator.onLine !== false,
    porteur: false,
    priorite: 0,
    detruite: false,
  };
  let minuterie: ReturnType<typeof setTimeout> | null = null;
  let dernierBattementMs = Date.now();

  const estActif = (candidat: Etat): boolean => !candidat.cache && candidat.enLigne && !candidat.detruite;

  const arreteLaMinuterie = (): void => {
    if (minuterie === null) return;
    clearTimeout(minuterie);
    minuterie = null;
  };

  /**
   * Le battement est dû `intervalleMs` après le PRÉCÉDENT — jamais après
   * `intervalleMs` de disponibilité ininterrompue. Une bascule ne fait donc que
   * DIFFÉRER ce qui est dû ; elle ne le supprime pas.
   */
  const ajusteLeBattement = (): void => {
    const battement = options.battement;
    if (battement === undefined) return;

    if (!etat.porteur || !estActif(etat)) {
      arreteLaMinuterie();
      return;
    }
    if (minuterie !== null) return;

    const reste = Math.max(0, battement.intervalleMs - (Date.now() - dernierBattementMs));
    minuterie = setTimeout(() => {
      minuterie = null;
      dernierBattementMs = Date.now();
      battement.battre();
      ajusteLeBattement();
    }, reste);
  };

  const pose = (changement: Partial<Etat>): void => {
    etat = { ...etat, ...changement };
    ajusteLeBattement();
  };

  /**
   * Le départage : une revendication étrangère l'emporte si elle est plus
   * RÉCENTE, et à égalité si son identifiant d'onglet est le plus grand.
   * L'ordre est TOTAL, donc exactement un côté survit quel que soit l'ordre
   * d'arrivée des messages — y compris quand les deux se croisent en vol.
   */
  const lEmportePourMoi = (etrangere: { readonly onglet: string; readonly priorite: number }): boolean =>
    etrangere.priorite < etat.priorite ||
    (etrangere.priorite === etat.priorite && etrangere.onglet < onglet);

  const diffuseMaRevendication = (): void => {
    canal?.postMessage({ type: 'revendication', onglet, lien, priorite: etat.priorite });
  };

  const revendique = (): void => {
    if (etat.porteur) return;
    pose({ porteur: true, priorite: prochainePriorite() });
    diffuseMaRevendication();
    options.sur({ type: 'porteur-du-battement', porteur: true });
  };

  const cede = (): void => {
    if (!etat.porteur) return;
    pose({ porteur: false });
    options.sur({ type: 'porteur-du-battement', porteur: false });
  };

  /** N'émet la reprise que sur la transition inactif → actif : le § 7 interdit d'appeler hors ligne. */
  const transite = (changement: Partial<Etat>, cause: CauseDeReprise): void => {
    const actifAvant = estActif(etat);
    pose(changement);
    if (actifAvant || !estActif(etat)) return;
    options.sur({ type: 'reprise', cause });
    revendique();
  };

  const surVisibilite = (): void => {
    if (!visible()) {
      if (etat.cache) return;
      pose({ cache: true });
      options.sur({ type: 'masquage' });
      return;
    }
    transite({ cache: false }, 'visible');
  };

  const surPageshow = (evenement: PageTransitionEvent): void => {
    if (!evenement.persisted) return;
    transite({ cache: false }, 'bfcache');
  };

  const surPagehide = (evenement: PageTransitionEvent): void => {
    if (evenement.persisted) {
      pose({ cache: true });
      return;
    }
    detruit();
  };

  const surOffline = (): void => {
    if (!etat.enLigne) return;
    pose({ enLigne: false });
    options.sur({ type: 'perte-du-reseau' });
  };

  const surOnline = (): void => {
    if (etat.enLigne) return;
    transite({ enLigne: true }, 'reseau');
  };

  /**
   * L'appartenance est une ÉGALITÉ, jamais une relation de préfixe : le
   * stockage du jeton n'a pas de sous-clé, et deux liens dont l'un préfixe
   * l'autre sont deux places distinctes (cf. `cleDuJeton`). Seule la clé NULLE
   * — un vidage complet du stockage — passe sans être la nôtre, parce qu'elle
   * ne porte aucune valeur à adopter : elle annonce une disparition.
   */
  const surStockage = (evenement: StorageEvent): void => {
    if (evenement.storageArea !== null && evenement.storageArea !== window.localStorage) return;
    const cle = evenement.key;
    if (cle !== null && cle !== options.cleDuJeton) return;
    options.sur({ type: 'jeton-externe', cle, valeur: evenement.newValue });
  };

  const surMessage = (donnee: unknown): void => {
    const message = messageDuCanal(donnee);
    if (message === null || message.onglet === onglet) return;
    // Défense en profondeur : un canal mal nommé cesse d'être une perte de session.
    if (message.lien !== lien) return;

    if (message.type === 'retrait') {
      if (estActif(etat)) revendique();
      return;
    }
    if (!etat.porteur) return;
    if (!lEmportePourMoi(message)) {
      cede();
      return;
    }
    diffuseMaRevendication();
  };

  const emetLaBalise = (): void => {
    const balise = options.telemetrie?.() ?? null;
    if (balise === null || viseUnDepart(balise.url)) return;
    if (typeof window.navigator.sendBeacon !== 'function') return;
    window.navigator.sendBeacon(balise.url, balise.corps);
  };

  const detruit = (): void => {
    if (etat.detruite) return;
    if (etat.porteur) canal?.postMessage({ type: 'retrait', onglet, lien });
    pose({ detruite: true, porteur: false, cache: true });
    options.sur({ type: 'destruction' });
    emetLaBalise();
  };

  document.addEventListener('visibilitychange', surVisibilite);
  window.addEventListener('pageshow', surPageshow);
  window.addEventListener('pagehide', surPagehide);
  window.addEventListener('online', surOnline);
  window.addEventListener('offline', surOffline);
  window.addEventListener('storage', surStockage);
  if (canal !== null) canal.onmessage = (evenement: MessageEvent<unknown>) => surMessage(evenement.data);

  if (!etat.enLigne) options.sur({ type: 'perte-du-reseau' });
  if (etat.cache) options.sur({ type: 'masquage' });
  if (visible()) revendique();
  ajusteLeBattement();

  return () => {
    document.removeEventListener('visibilitychange', surVisibilite);
    window.removeEventListener('pageshow', surPageshow);
    window.removeEventListener('pagehide', surPagehide);
    window.removeEventListener('online', surOnline);
    window.removeEventListener('offline', surOffline);
    window.removeEventListener('storage', surStockage);
    arreteLaMinuterie();
    if (canal !== null) {
      if (etat.porteur) canal.postMessage({ type: 'retrait', onglet, lien });
      canal.onmessage = null;
      canal.close();
    }
  };
};
