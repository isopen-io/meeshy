import { useEffect, type ReactNode } from 'react';

import {
  SCENE_BACKDROPS,
  SCENE_BACKDROP_TINT,
  SCENE_FIT_MODES,
  type SceneBackdrop,
  type SceneFitMode,
} from '@/lib/canvas/backdrop';
import { translate } from '@/lib/i18n-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';
import type { StoryFrame } from '@/lib/stories/story-document';

/**
 * **LE PANNEAU CADRE** (#8414, maquette `iPad.dc.html`, règle 4 : « chaque
 * média garde son format ») — Ajuster ou Remplir le média de fond, et ce qui
 * se peint autour d'un média ajusté. Posé à côté du rail droit qui l'ouvre,
 * il n'existe que si la scène a un média de fond (l'hôte ne monte la tuile
 * qu'à cette condition).
 *
 * Le panneau est du MÊME verre que la barre, les rails et le socle (`glass`,
 * retour de revue #8425) ; ses libellés sont à l'encre pleine : l'encre
 * secondaire ne tient pas AA sur ce verre en clair (3,58:1, #6308).
 *
 * Un choix s'APPLIQUE sur-le-champ (la scène le montre sous le panneau) et se
 * défait par l'historique comme tout geste sur la scène. Échap ferme.
 */

const FIT_KEY = { fit: 'story.studio.frame.fit', fill: 'story.studio.frame.fill' } as const;
const FIT_HINT_KEY = { fit: 'story.studio.frame.fit.hint', fill: 'story.studio.frame.fill.hint' } as const;
const BACKDROP_KEY = {
  blur: 'story.studio.backdrop.blur',
  black: 'story.studio.backdrop.black',
  white: 'story.studio.backdrop.white',
  indigo: 'story.studio.backdrop.indigo',
  sand: 'story.studio.backdrop.sand',
} as const;

/** La pastille du flou : un dégradé qui dit « le média, flouté » sans en
 * être une copie (`iPad.dc.html`, `.sw`). */
const BLUR_SWATCH = 'linear-gradient(135deg, #fb923c, #4f46e5)';

const swatchOf = (backdrop: SceneBackdrop): string => (backdrop === 'blur' ? BLUR_SWATCH : SCENE_BACKDROP_TINT[backdrop]);

function Token({
  on,
  probe,
  onPress,
  children,
}: {
  readonly on: boolean;
  readonly probe: string;
  readonly onPress: () => void;
  readonly children: ReactNode;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={on}
      data-story-frame-option={probe}
      onClick={onPress}
      className="flex items-center gap-1.5 whitespace-nowrap rounded-xl px-3 text-caption font-semibold focus-visible:outline-2 focus-visible:outline-offset-2"
      style={{
        minHeight: 44,
        outlineColor: 'var(--color-ios-brand)',
        color: on ? '#111' : 'var(--color-ios-ink)',
        backgroundColor: on ? '#fff' : 'color-mix(in srgb, var(--color-ios-ink) 10%, transparent)',
        border: '1px solid color-mix(in srgb, var(--color-ios-ink) 14%, transparent)',
      }}
    >
      {children}
    </button>
  );
}

export function StudioFramePanel({
  lang,
  frame,
  onChange,
  onClose,
}: {
  readonly lang: InterfaceLanguage;
  readonly frame: StoryFrame;
  readonly onChange: (frame: StoryFrame) => void;
  readonly onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const title = translate(lang, 'story.studio.frame');
  const setFit = (fitMode: SceneFitMode) => onChange({ ...frame, fitMode });
  const setBackdrop = (backdrop: SceneBackdrop) => onChange({ ...frame, backdrop });
  return (
    <section
      data-story-frame-panel
      aria-label={title}
      className="glass flex w-64 max-w-[calc(100vw-6rem)] flex-col gap-2 rounded-3xl p-3.5 shadow-lg"
      style={{ color: 'var(--color-ios-ink)' }}
    >
      <h2 className="text-body font-bold">{title}</h2>
      <p className="text-caption" style={{ color: 'var(--color-ios-ink)' }}>
        {translate(lang, FIT_HINT_KEY[frame.fitMode])}
      </p>
      <p className="text-caption font-bold uppercase tracking-wide" style={{ color: 'var(--color-ios-ink)' }}>
        {translate(lang, 'story.studio.frame.media')}
      </p>
      <div role="radiogroup" aria-label={translate(lang, 'story.studio.frame.media')} className="flex gap-1.5">
        {SCENE_FIT_MODES.map((mode) => (
          <Token key={mode} on={frame.fitMode === mode} probe={mode} onPress={() => setFit(mode)}>
            {translate(lang, FIT_KEY[mode])}
          </Token>
        ))}
      </div>
      {/* Autour d'un média qui REMPLIT, il n'y a rien : les fonds ne se
          proposent qu'à un média ajusté — un choix sans effet n'est pas offert. */}
      {frame.fitMode === 'fit' ? (
        <>
          <p className="text-caption font-bold uppercase tracking-wide" style={{ color: 'var(--color-ios-ink)' }}>
            {translate(lang, 'story.studio.frame.around')}
          </p>
          <div role="radiogroup" aria-label={translate(lang, 'story.studio.frame.around')} className="flex flex-wrap gap-1.5">
            {SCENE_BACKDROPS.map((backdrop) => (
              <Token key={backdrop} on={frame.backdrop === backdrop} probe={backdrop} onPress={() => setBackdrop(backdrop)}>
                <span
                  aria-hidden="true"
                  className="size-3.5 rounded-full"
                  style={{ background: swatchOf(backdrop), border: '1px solid rgba(255,255,255,0.4)' }}
                />
                {translate(lang, BACKDROP_KEY[backdrop])}
              </Token>
            ))}
          </div>
        </>
      ) : null}
    </section>
  );
}
