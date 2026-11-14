import { createStore, type StoreApi } from 'zustand/vanilla';

export { PLAYER_BANNER_RECALL_MS } from '@meeshy/shared/utils/game/banner-recall-timing';

/**
 * LA VISITE DE LA BANNIÈRE DU JOUEUR (#9536, directive porteur 2026-10-06) —
 * « le bandeau du jeu n'apparaît qu'à l'OUVERTURE de l'application ; après 30 s
 * il disparaît lentement, en remontant vers le haut ». Cela SUPPLANTE la règle
 * « toujours visible » de #9494.
 *
 * Une VISITE est une ouverture de l'application : le démarrage à froid, ou le
 * retour au premier plan après une vraie absence (`isRealAbsence`) — jamais un
 * changement d'onglet ni de route. Quatre phases :
 *
 *   · `armed`   — la visite est ouverte, la bannière n'a pas encore été peinte
 *                 (cache vide, appel en cours, route sans bandeau). La fenêtre
 *                 d'ouverture est BORNÉE (`PLAYER_BANNER_HOLD_MS`) : jamais
 *                 peinte dans ce délai, la visite se ferme (`missed`) — sinon
 *                 la bannière surgirait en pleine session, au retour d'un fil
 *                 ou au premier point gagné, ce qui n'est plus « à l'ouverture »
 *                 (iOS : `GamePlayerBannerOpening`, la même fenêtre) ;
 *   · `shown`   — peinte : l'horloge des 30 s court ;
 *   · `leaving` — l'échéance est passée : elle remonte et s'efface ;
 *   · `gone`    — retirée jusqu'à la prochaine ouverture.
 *
 * Module LÉGER (aucun rendu), lu par la coquille avant le premier pixel.
 */
export const PLAYER_BANNER_HOLD_MS = 30_000;
/** La sortie, lente et douce : environ une seconde. */
export const PLAYER_BANNER_EXIT_MS = 1_000;
/** Sous `prefers-reduced-motion` : un simple fondu, plus court. */
export const PLAYER_BANNER_EXIT_REDUCED_MS = 400;
/** En deçà, c'est un onglet ou une notification, pas une ouverture. */
export const PLAYER_BANNER_AWAY_MS = 5 * 60_000;

export type VisitPhase = 'armed' | 'shown' | 'leaving' | 'gone';
export type VisitEvent = 'shown' | 'missed' | 'expired' | 'exited' | 'reopened' | 'recalled';

/**
 * LE RAPPEL (#17366, retouche 3) — hors de l'ouverture, un acte réalisé, l'Offrande prête, la Flamme à risque
 * (`bannerRecall`, `@meeshy/shared/utils/game/banner-recall`, chargée après la première peinture) ou le geste « tirer la liste » remontrent le bandeau
 * `PLAYER_BANNER_RECALL_MS`, puis il repart seul. Pendant l'ouverture, ou avant sa première peinture, le rappel ne
 * change rien : les trente secondes de l'ouverture couvrent déjà le moment.
 */
export function nextVisitPhase(phase: VisitPhase, event: VisitEvent): VisitPhase {
  if (event === 'reopened') return 'armed';
  if (event === 'recalled') return phase === 'gone' || phase === 'leaving' ? 'shown' : phase;
  if (event === 'shown') return phase === 'armed' ? 'shown' : phase;
  if (event === 'missed') return phase === 'armed' ? 'gone' : phase;
  if (event === 'expired') return phase === 'shown' ? 'leaving' : phase;
  return phase === 'leaving' ? 'gone' : phase;
}

export const isRealAbsence = (awayMs: number): boolean => Number.isFinite(awayMs) && awayMs >= PLAYER_BANNER_AWAY_MS;

export type PlayerBannerVisit = {
  readonly phase: VisitPhase;
  /** La bannière montrée est un RAPPEL : elle tient `PLAYER_BANNER_RECALL_MS`, pas les trente secondes de l'ouverture. */
  readonly recall: boolean;
  /** Numéro de l'ouverture : change à chaque réouverture, pour relancer l'horloge. */
  readonly visit: number;
  readonly send: (event: VisitEvent) => void;
};

export function createPlayerBannerVisit(): StoreApi<PlayerBannerVisit> {
  return createStore<PlayerBannerVisit>((set, get) => ({
    phase: 'armed',
    recall: false,
    visit: 1,
    send: (event) => {
      const { phase, visit, recall } = get();
      if (event === 'recalled') {
        const opening = phase === 'armed' || (phase === 'shown' && !recall);
        if (opening) return;
        set({ phase: nextVisitPhase(phase, event), recall: true, visit: visit + 1 });
        return;
      }
      const next = nextVisitPhase(phase, event);
      if (next === phase && event !== 'reopened') return;
      set({ phase: next, visit: event === 'reopened' ? visit + 1 : visit, recall: event === 'reopened' ? false : recall });
    },
  }));
}

/** LA visite de cette application : une par page chargée, donc une par démarrage à froid. */
export const playerBannerVisitStore = createPlayerBannerVisit();

export const reportPlayerBannerShown = (): void => playerBannerVisitStore.getState().send('shown');

/** Le bandeau revient quelques secondes : quelque chose vient de changer, ou la liste vient d'être tirée. */
export const recallPlayerBanner = (): void => playerBannerVisitStore.getState().send('recalled');

/**
 * « Tirer la liste rappelle le bandeau » (#17366, décision porteur du 2026-11-12) : le geste qui rafraîchit l'écran
 * des conversations rappelle d'abord le bandeau, qui repart seul.
 */
export const withBannerRecall =
  (refresh: () => Promise<void>, store: StoreApi<PlayerBannerVisit> = playerBannerVisitStore) =>
  (): Promise<void> => {
    store.getState().send('recalled');
    return refresh();
  };

export type VisibilityTarget = {
  readonly visibilityState: DocumentVisibilityState;
  addEventListener(type: 'visibilitychange', listener: () => void): void;
  removeEventListener(type: 'visibilitychange', listener: () => void): void;
};

/**
 * Écoute le retour au premier plan : après une vraie absence, une nouvelle
 * visite s'ouvre. `now` et `target` sont injectables pour les témoins.
 */
export function watchPlayerBannerAbsence(options: {
  readonly target?: VisibilityTarget;
  readonly now?: () => number;
  readonly store?: StoreApi<PlayerBannerVisit>;
} = {}): () => void {
  const target = options.target ?? (typeof document === 'undefined' ? null : document);
  if (target === null) return () => undefined;
  const now = options.now ?? Date.now;
  const store = options.store ?? playerBannerVisitStore;
  let hiddenAt: number | null = null;
  const onChange = (): void => {
    if (target.visibilityState === 'hidden') {
      hiddenAt = now();
      return;
    }
    const since = hiddenAt;
    hiddenAt = null;
    if (since !== null && isRealAbsence(now() - since)) store.getState().send('reopened');
  };
  target.addEventListener('visibilitychange', onChange);
  return () => target.removeEventListener('visibilitychange', onChange);
}
