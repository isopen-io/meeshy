import { useEffect, useState } from 'react';

import { isInterfaceCatalogLoaded, loadInterfaceCatalog, translate } from '@/lib/i18n-catalog';
import { currentInterfaceLanguage } from '@/lib/interface-language';

import { SCREEN_WAIT_ART } from './screen-wait-art';

/** Sous ce délai, un écran déjà en mémoire ou en cache arrive sans qu'on ait rien montré. */
export const SCREEN_WAIT_DELAY_MS = 150;

/**
 * L'ATTENTE D'UN ÉCRAN DÉCOUPÉ (#10635) — Mee et Meo qui dansent, au centre,
 * pendant que le chunk d'un écran ou le catalogue de sa langue arrive.
 *
 * - Le libellé accessible parle la langue de l'interface. Ce composant est le
 *   repli Suspense du routeur : il peut se rendre AVANT que le catalogue soit
 *   chargé. Il ne pose alors que `aria-busy`, et ajoute son libellé quand le
 *   catalogue arrive — jamais un texte codé en dur, jamais une autre langue.
 * - Le dessin est un SVG FIGÉ (`screen-wait-art.ts`, généré) : ni le catalogue
 *   de stickers ni leur moteur n'entrent dans la première peinture. Il porte
 *   ses keyframes sous `prefers-reduced-motion: no-preference` : sinon, une
 *   pose fixe.
 * - Rien ne se dessine avant `SCREEN_WAIT_DELAY_MS` : un écran préchargé
 *   s'ouvre sans flash.
 */
export function ScreenWait() {
  const language = currentInterfaceLanguage();
  const [labelled, setLabelled] = useState(() => isInterfaceCatalogLoaded(language));
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setShown(true), SCREEN_WAIT_DELAY_MS);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (labelled) return;
    let alive = true;
    loadInterfaceCatalog(language).then(
      () => alive && setLabelled(true),
      () => undefined,
    );
    return () => {
      alive = false;
    };
  }, [labelled, language]);

  return (
    <div
      className="grid min-h-[60dvh] place-items-center p-6"
      role="status"
      aria-busy="true"
      aria-label={labelled ? translate(language, 'pending.screen') : undefined}
      data-screen-wait=""
    >
      {shown ? <div className="screen-wait-art size-32" dangerouslySetInnerHTML={{ __html: SCREEN_WAIT_ART }} /> : null}
    </div>
  );
}
