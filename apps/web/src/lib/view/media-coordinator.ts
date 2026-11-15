/**
 * LE COORDINATEUR DE MÉDIA (#5805, renommé #6221 étape 0) — miroir de
 * `ConversationAudioCoordinator.play()` (`apps/ios/Meeshy/Features/Main/Services/
 * ConversationAudioCoordinator.swift:155-171, 543-547`) : UN SEUL média actif à
 * la fois, jamais une file (la file d'enchaînement iOS reste hors tranche).
 * `claim(id, pause)` enregistre le rappel de PAUSE que le coordinateur appelle
 * s'il retire l'exclusivité à `id` au profit d'un autre — « jouer un média en
 * arrête un autre ».
 *
 * RENOMMÉ DE `audioCoordinator` (#6221, spécification « grille de médias »
 * §5 étape 0) : une VIDÉO qui réclamerait l'exclusivité auprès d'un
 * `audioCoordinator` porterait un nom qui MENT (directive porteur 3b, « le
 * vocabulaire est celui du contenu qu'il porte »). iOS tient DEUX
 * possesseurs (`ConversationAudioCoordinator`, `SharedAVPlayerManager`) parce
 * qu'`AVPlayer` et `AVAudioPlayer` sont deux API distinctes côté Apple ; le
 * web n'a qu'une seule primitive — `HTMLMediaElement`, la classe COMMUNE de
 * `<audio>` et `<video>` — donc un seul coordinateur suffit et doit le dire.
 *
 * `release(id)` ne fait RIEN si `id` n'est déjà plus l'actif : un widget
 * démonté ou mis en pause APRÈS avoir été remplacé ne doit jamais effacer
 * l'id du nouveau lecteur actif — c'est le défaut que `release('a')` après
 * `claim('b', …)` doit éviter (§4.4 b de la spécification #5805).
 *
 * `subscribe(listener)` ISOLE le re-rendu (miroir `AudioBubbleRouter.swift:28-40`,
 * qui ne s'abonne qu'à `activeContext.map { … }.removeDuplicates()`, JAMAIS
 * aux ticks à 20 Hz) : un abonné n'est notifié QUE lorsque `active()` change
 * de valeur, jamais sur un `claim` redondant — c'est ce qui laisse N bulles
 * de média ne PAS re-rendre au rythme de la lecture d'une seule d'entre elles
 * (§ 7.2 de la spécification #5805, « aucun re-rendu des rangées VOISINES »).
 */
export type MediaCoordinator = {
  /** Prend l'exclusivité pour `id` ; appelle le `pause` PRÉCÉDEMMENT enregistré si un autre id était actif. */
  readonly claim: (id: string, pause: () => void) => void;
  /** Relâche `id` — NO-OP si `id` n'est plus l'actif (déjà remplacé). */
  readonly release: (id: string) => void;
  readonly active: () => string | null;
  /** Notifié uniquement sur un CHANGEMENT de `active()`. Rend une fonction de désabonnement. */
  readonly subscribe: (listener: () => void) => () => void;
};

export function createMediaCoordinator(): MediaCoordinator {
  let activeId: string | null = null;
  let activePause: (() => void) | null = null;
  const listeners = new Set<() => void>();

  const setActive = (id: string | null, pause: (() => void) | null): void => {
    activeId = id;
    activePause = pause;
    for (const listener of listeners) listener();
  };

  return {
    claim(id, pause) {
      // Idempotent (§4.4 c) : un second `claim` du même id ne rappelle rien
      // et ne notifie personne — ce n'est pas un CHANGEMENT d'actif.
      if (id === activeId) return;
      const previousPause = activePause;
      setActive(id, pause);
      previousPause?.();
    },
    release(id) {
      if (id !== activeId) return;
      setActive(null, null);
    },
    active: () => activeId,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

/**
 * L'INSTANCE DE L'APPLICATION — un seul fil (le lecteur n'a qu'un appareil),
 * injectable en test (`useMediaPlayback({ coordinator })`) exactement comme
 * `RecorderEngine` l'est pour `useRecorder`.
 */
export const mediaCoordinator: MediaCoordinator = createMediaCoordinator();
