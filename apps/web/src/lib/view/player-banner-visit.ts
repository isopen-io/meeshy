import { createStore, type StoreApi } from 'zustand/vanilla';

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
export type VisitEvent = 'shown' | 'missed' | 'expired' | 'exited' | 'reopened';

export function nextVisitPhase(phase: VisitPhase, event: VisitEvent): VisitPhase {
  if (event === 'reopened') return 'armed';
  if (event === 'shown') return phase === 'armed' ? 'shown' : phase;
  if (event === 'missed') return phase === 'armed' ? 'gone' : phase;
  if (event === 'expired') return phase === 'shown' ? 'leaving' : phase;
  return phase === 'leaving' ? 'gone' : phase;
}

export const isRealAbsence = (awayMs: number): boolean => Number.isFinite(awayMs) && awayMs >= PLAYER_BANNER_AWAY_MS;

export type PlayerBannerVisit = {
  readonly phase: VisitPhase;
  /** Numéro de l'ouverture : change à chaque réouverture, pour relancer l'horloge. */
  readonly visit: number;
  readonly send: (event: VisitEvent) => void;
};

export function createPlayerBannerVisit(): StoreApi<PlayerBannerVisit> {
  return createStore<PlayerBannerVisit>((set, get) => ({
    phase: 'armed',
    visit: 1,
    send: (event) => {
      const { phase, visit } = get();
      const next = nextVisitPhase(phase, event);
      if (next === phase && event !== 'reopened') return;
      set({ phase: next, visit: event === 'reopened' ? visit + 1 : visit });
    },
  }));
}

/** LA visite de cette application : une par page chargée, donc une par démarrage à froid. */
export const playerBannerVisitStore = createPlayerBannerVisit();

export const reportPlayerBannerShown = (): void => playerBannerVisitStore.getState().send('shown');

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
