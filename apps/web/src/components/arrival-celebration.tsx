import { useEffect, useRef, useState, type ComponentType } from 'react';

import { translate } from '@/lib/i18n-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';
import { arrivalReady, type ArrivalDeps } from '@/lib/arrival/arrival';

import { Glyph } from './glyph';

/**
 * LA CÉLÉBRATION DE L'ARRIVÉE (#8088) — le lien de l'e-mail vient d'ouvrir la
 * session. Pendant que les premières données se préchargent (`deps.prefetch`),
 * l'écran célèbre ; dès que l'arrivée est prête (`arrivalReady` : minimum joué
 * ET préchargement fini, ou plafond atteint), `onLand` mène aux conversations.
 *
 * - Mouvement complet : le feu d'artifice (`arrival-fireworks.tsx`) arrive par
 *   `import()` — ni la première peinture ni ce chunk n'en portent le code.
 * - `prefers-reduced-motion` : variante SOBRE — la coche apparaît en fondu,
 *   aucune particule, rien ne se déplace.
 * - Lecteur d'écran : une seule annonce polie, « Adresse confirmée —
 *   connexion… » ; le canvas est `aria-hidden`.
 * - Démonté avant l'heure (l'utilisateur est parti) : on ne navigue plus.
 */
export function ArrivalCelebration({
  deps,
  language,
  onLand,
}: {
  readonly deps: ArrivalDeps;
  readonly language: InterfaceLanguage;
  readonly onLand: () => void;
}) {
  const [reduced] = useState(() => deps.reducedMotion());
  const [Fireworks, setFireworks] = useState<ComponentType | null>(null);
  const badge = useRef<HTMLSpanElement>(null);
  const land = useRef(onLand);
  land.current = onLand;

  useEffect(() => {
    let alive = true;
    void arrivalReady(deps.prefetch(), deps.wait).then(() => {
      if (alive) land.current();
    });
    return () => {
      alive = false;
    };
  }, [deps]);

  useEffect(() => {
    if (reduced) return;
    let alive = true;
    import('./arrival-fireworks').then(
      ({ ArrivalFireworks }) => {
        if (alive) setFireworks(() => ArrivalFireworks);
      },
      () => undefined,
    );
    return () => {
      alive = false;
    };
  }, [reduced]);

  useEffect(() => {
    const element = badge.current;
    if (element === null || typeof element.animate !== 'function') return;
    const animation = reduced
      ? element.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 240, easing: 'ease-out', fill: 'both' })
      : element.animate(
          [
            { opacity: 0, transform: 'scale(0.4)' },
            { opacity: 1, transform: 'scale(1.12)', offset: 0.65 },
            { opacity: 1, transform: 'scale(1)' },
          ],
          { duration: 520, easing: 'cubic-bezier(0.2, 0.9, 0.3, 1.2)', fill: 'both' },
        );
    animation.finished.catch(() => undefined);
    return () => animation.cancel();
  }, [reduced]);

  return (
    <div
      data-arrival-celebration
      data-motion={reduced ? 'reduced' : 'full'}
      className="relative flex flex-1 flex-col items-center justify-center gap-4 overflow-hidden px-8 text-center"
    >
      {Fireworks === null ? null : <Fireworks />}
      <span
        ref={badge}
        aria-hidden="true"
        className="relative grid place-items-center rounded-full"
        style={{
          width: 88,
          height: 88,
          color: 'var(--ios-success)',
          background: 'color-mix(in srgb, var(--ios-success) 14%, transparent)',
        }}
      >
        <Glyph name="checks" size={48} />
      </span>
      <h2 className="relative text-screen font-bold" style={{ color: 'var(--color-ios-ink)' }}>
        {translate(language, 'verifyEmail.arrival.title')}
      </h2>
      <p className="relative" style={{ color: 'var(--color-ios-ink-2)' }}>
        {translate(language, 'verifyEmail.arrival.lead')}
      </p>
      <p role="status" aria-live="polite" className="sr-only">
        {translate(language, 'verifyEmail.arrival.status')}
      </p>
    </div>
  );
}
