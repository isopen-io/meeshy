import { GlyphSvg } from '@/components/glyph';
import { THREAD_MENU_GLYPHS } from '@/components/glyphs-thread-menu';
import { translate } from '@/lib/i18n-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';
import { FLASH_INTENSITY_MIN, flashIntensityOf } from '@/lib/stories/studio-capture-gestures';

/** La longueur du curseur déplié — la capsule passe de 44 à 44 + 140 px. */
const SLIDER_WIDTH = 140;

/**
 * **LE FLASH ET SON CURSEUR DE VERRE** (#8672, jumelle de #8671) — une seule
 * capsule de verre : le bouton flash, et, quand le sol blanc éclaire, le
 * curseur qui s'ALLONGE à sa suite (vers la fin de la ligne : à droite en
 * LTR, à gauche en RTL), collé à lui. Il règle l'intensité du blanc du sol.
 *
 * Replié, le curseur n'est ni visible ni atteignable (`visibility: hidden`
 * le retire du clavier et du lecteur d'écran) ; l'allongement est une
 * transition que Reduce Motion supprime. Pendant qu'on le règle, l'hôte
 * allume l'anneau blanc à l'intensité choisie (`onPreview`) : on voit ce
 * qu'on règle.
 */
export function StudioCameraFlash({
  lang,
  flash,
  sliderShown,
  intensity,
  onFlash,
  onIntensity,
  onPreview,
}: {
  readonly lang: InterfaceLanguage;
  readonly flash: boolean;
  readonly sliderShown: boolean;
  readonly intensity: number;
  readonly onFlash: (next: boolean) => void;
  readonly onIntensity: (next: number) => void;
  readonly onPreview: (previewing: boolean) => void;
}) {
  const percent = Math.round(flashIntensityOf(intensity) * 100);
  const end = () => onPreview(false);
  return (
    <div data-story-camera-flash-capsule={sliderShown ? 'open' : 'closed'} className="glass mt-1.5 flex h-11 shrink-0 items-center rounded-full">
      <button
        type="button"
        data-story-camera-flash
        aria-label={translate(lang, 'story.studio.camera.flash')}
        aria-pressed={flash}
        onClick={() => onFlash(!flash)}
        className="grid size-11 shrink-0 place-items-center rounded-full focus-visible:outline-2 focus-visible:outline-offset-2"
        style={{ outlineColor: 'var(--color-ios-brand)', color: flash ? '#FACC15' : 'var(--color-ios-ink)' }}
      >
        <GlyphSvg glyph={THREAD_MENU_GLYPHS.lightning} size={18} />
      </button>
      <input
        type="range"
        data-story-camera-flash-intensity
        min={FLASH_INTENSITY_MIN}
        max={1}
        step={0.05}
        value={flashIntensityOf(intensity)}
        aria-label={translate(lang, 'story.studio.camera.flash.intensity')}
        aria-valuetext={translate(lang, 'story.studio.camera.flash.intensityValue', { percent: String(percent) })}
        aria-hidden={sliderShown ? undefined : true}
        tabIndex={sliderShown ? 0 : -1}
        onInput={(event) => onIntensity(flashIntensityOf(event.currentTarget.value))}
        onChange={(event) => onIntensity(flashIntensityOf(event.currentTarget.value))}
        onPointerDown={() => onPreview(true)}
        onPointerUp={end}
        onPointerCancel={end}
        onKeyDown={() => onPreview(true)}
        onKeyUp={end}
        onBlur={end}
        className="h-11 shrink-0 cursor-pointer transition-[width,opacity,margin] duration-200 ease-out motion-reduce:transition-none"
        style={{
          width: sliderShown ? SLIDER_WIDTH : 0,
          marginInlineEnd: sliderShown ? 14 : 0,
          opacity: sliderShown ? 1 : 0,
          visibility: sliderShown ? 'visible' : 'hidden',
          accentColor: '#FACC15',
          touchAction: 'none',
        }}
      />
    </div>
  );
}
