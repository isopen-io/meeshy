import { useEffect, useState } from 'react';

/** Le délai d'iOS (`FullscreenChromeMetrics.autoHideDelay`, 3 s) : une seule horloge pour les deux plateformes. */
export const IDLE_CHROME_DELAY_MS = 3000;

const WAKING_EVENTS = ['pointermove', 'pointerdown', 'touchstart', 'wheel'] as const;

/**
 * LE CHROME QUI S'EFFACE PENDANT L'ÉCOUTE — miroir d'`AudioFullscreenView`
 * iOS (`AudioFullscreenChromeTiming` + `FullscreenChromeState.autoHideDelay`) :
 * tant qu'un vocal joue et que l'utilisateur ne touche à rien, barres haute et
 * basse cèdent la place au lecteur. Le moindre geste les rend, la pause aussi.
 * Rend `true` quand le chrome doit être masqué.
 *
 * Deux exceptions, celles d'iOS :
 * - `held` — une OUVERTURE (rangée d'émojis, menu « … ») gagne sur
 *   l'effacement : on ne retire pas la surface à laquelle on est en train de
 *   parler. Sa fermeture relance le délai entier.
 * - PILOTER SANS POINTEUR — iOS ne l'efface jamais sous VoiceOver ; le web ne
 *   sait pas qu'un lecteur d'écran tourne, mais il voit comment on agit : une
 *   touche du clavier, ou une activation sans pointeur (`click.detail === 0`,
 *   ce que produisent le clavier et les lecteurs d'écran), garde le chrome à
 *   l'écran jusqu'à la fermeture. Un chrome effacé est INERTE : sans cette
 *   règle, la croix quitterait l'ordre de lecture pendant qu'on le parcourt.
 */
export function useIdleChrome({
  active,
  held = false,
  delayMs = IDLE_CHROME_DELAY_MS,
}: {
  readonly active: boolean;
  readonly held?: boolean;
  readonly delayMs?: number;
}): boolean {
  const [idle, setIdle] = useState(false);
  const [driven, setDriven] = useState(false);

  useEffect(() => {
    const drive = (): void => setDriven(true);
    const onClick = (event: MouseEvent): void => {
      if (event.detail === 0) drive();
    };
    window.addEventListener('keydown', drive, true);
    window.addEventListener('click', onClick, true);
    return () => {
      window.removeEventListener('keydown', drive, true);
      window.removeEventListener('click', onClick, true);
    };
  }, []);

  const armed = active && !held && !driven;

  useEffect(() => {
    if (!armed) {
      setIdle(false);
      return undefined;
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    const arm = (): void => {
      if (timer !== undefined) clearTimeout(timer);
      timer = setTimeout(() => setIdle(true), delayMs);
    };
    const wake = (): void => {
      setIdle(false);
      arm();
    };
    arm();
    for (const name of WAKING_EVENTS) window.addEventListener(name, wake, { passive: true });
    return () => {
      if (timer !== undefined) clearTimeout(timer);
      for (const name of WAKING_EVENTS) window.removeEventListener(name, wake);
    };
  }, [armed, delayMs]);

  return armed && idle;
}
