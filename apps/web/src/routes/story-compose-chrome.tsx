import type { ReactNode } from 'react';

import { Glyph } from '@/components/glyph';
import { translate } from '@/lib/i18n-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';
import type { StudioFloor } from '@/lib/stories/studio-floor';
import { useRovingMenu } from '@/lib/view/roving-menu';

/**
 * **LE CHROME DU COMPOSER PLEIN ÉCRAN** (#8413, maquette
 * `docs/product/composer-plein-ecran/`, règle 5 : « le même style, exactement,
 * sur iOS, web mobile, tablette et navigateur ») — présentation pure, extraite
 * de `story-compose.tsx` pour tenir le budget de taille :
 *
 *  - le SOL de la scène (`StudioFloorLayer`) — le thumbhash de ce qu'elle
 *    montre, étiré et flouté (`ComposerSceneSurface.sceneLetterbox`) ;
 *  - le menu `⋯` de la barre haute (`StudioMoreMenu`), où vit l'Aperçu depuis
 *    que l'œil a quitté le socle ;
 *  - les TUILES libellées du rail droit (`StudioTile`), celles de la création
 *    de post (`ComposerTrailingRail.tile`) : icône, libellé court dessous,
 *    carte arrondie de 14, en verre ;
 *  - le bouton « texte du post » du socle (`StudioPostTextButton`).
 */

const TARGET = 44;

const MARK = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.9, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;

export function DotsMark({ size = 20 }: { readonly size?: number }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <circle cx="5.5" cy="12" r="1.9" />
      <circle cx="12" cy="12" r="1.9" />
      <circle cx="18.5" cy="12" r="1.9" />
    </svg>
  );
}

export function UndoMark({ size = 20 }: { readonly size?: number }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" {...MARK}>
      <path d="M9 14L4 9l5-5" />
      <path d="M4 9h10a6 6 0 010 12h-3" />
    </svg>
  );
}

export function RedoMark({ size = 20 }: { readonly size?: number }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" {...MARK}>
      <path d="M15 14l5-5-5-5" />
      <path d="M20 9H10a6 6 0 000 12h3" />
    </svg>
  );
}

/** Le Cadre — deux équerres croisées, le glyphe de la maquette (`iPad.dc.html`). */
export function FrameMark({ size = 20 }: { readonly size?: number }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" {...MARK}>
      <path d="M6 2v16h16" />
      <path d="M2 6h16v16" />
    </svg>
  );
}

export function TextMark({ size = 20 }: { readonly size?: number }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" {...MARK}>
      <path d="M5 6V4h14v2M12 4v16M9 20h6" />
    </svg>
  );
}

/**
 * **LE SOL** — peint SOUS tout le reste, sur l'écran entier : la carte se
 * pose dessus, la barre haute et le socle flottent au-dessus. Une image
 * basse résolution étirée ne tient que floutée ; le voile sombre garde le
 * verre des contrôles lisible sur un sol clair.
 */
export function StudioFloorLayer({ floor }: { readonly floor: StudioFloor | null }) {
  if (floor === null) return null;
  return (
    <span aria-hidden="true" data-story-studio-floor={floor.kind} className="pointer-events-none absolute inset-0 block overflow-hidden">
      {/* eslint-disable-next-line jsx-a11y/alt-text */}
      <img
        src={floor.src}
        alt=""
        aria-hidden="true"
        className="absolute inset-0 size-full object-cover"
        style={{ filter: floor.kind === 'hash' ? 'blur(18px)' : 'blur(36px) saturate(1.2)', transform: 'scale(1.2)' }}
      />
      <span className="absolute inset-0 block" style={{ backgroundColor: 'rgba(0,0,0,0.28)' }} />
    </span>
  );
}

/**
 * **UNE TUILE du rail droit** — icône au-dessus, libellé court dessous, carte
 * de 14 en verre : la tuile de la création de post, pour que le rail se lise
 * sans deviner ce que fait chaque icône. `probe` garde la prise de mesure des
 * gates (`data-story-option`), inchangée depuis les puces.
 */
export function StudioTile({
  label,
  hint,
  probe,
  onPress,
  pressed,
  disabled = false,
  children,
}: {
  readonly label: string;
  /** Le nom COMPLET pour le lecteur d'écran, quand le libellé visible est
   * abrégé (« Scène » ⇒ « Créer une scène »). */
  readonly hint?: string;
  readonly probe: string;
  readonly onPress: () => void;
  readonly pressed?: boolean;
  readonly disabled?: boolean;
  readonly children: ReactNode;
}) {
  return (
    <button
      type="button"
      data-story-option={probe}
      data-story-tile
      aria-label={hint ?? label}
      title={hint ?? label}
      {...(pressed !== undefined ? { 'aria-pressed': pressed } : {})}
      disabled={disabled}
      onClick={onPress}
      className="glass flex flex-col items-center justify-center gap-1 px-1 py-2 focus-visible:outline-2 focus-visible:outline-offset-2"
      style={{
        width: 60,
        minHeight: 56,
        borderRadius: 14,
        outlineColor: 'var(--color-ios-brand)',
        color: pressed === true ? '#fff' : 'var(--color-ios-ink)',
        ...(pressed === true ? { backgroundColor: 'var(--color-ios-brand)' } : {}),
        opacity: disabled ? 0.4 : 1,
      }}
    >
      {children}
      <span aria-hidden="true" className="max-w-full text-center font-semibold leading-tight" style={{ fontSize: 11 }}>
        {label}
      </span>
    </button>
  );
}

/** Un bouton ROND en verre de la barre haute ou du socle — ✕, ⋯, texte du post. */
export const ROUND_GLASS = 'glass grid size-11 shrink-0 place-items-center rounded-full focus-visible:outline-2 focus-visible:outline-offset-2';

export type StudioMenuItem = { readonly id: string; readonly label: string; readonly onSelect: () => void };

/**
 * **LE MENU ⋯ DE LA BARRE HAUTE** — les entrées qui ne décident ni de la
 * scène ni de l'envoi (l'Aperçu, supprimer la scène courante). Aucune entrée
 * ⇒ aucun bouton : un menu vide ne mène à rien (loi 4).
 */
export function StudioMoreMenu({
  lang,
  items,
  disabled = false,
}: {
  readonly lang: InterfaceLanguage;
  readonly items: readonly StudioMenuItem[];
  readonly disabled?: boolean;
}) {
  const { open, setOpen, activeIndex, buttonRef, menuRef, itemRefs, onMenuKeyDown, closeAndFocusButton } = useRovingMenu({
    itemCount: items.length,
  });
  if (items.length === 0) return null;
  const label = translate(lang, 'story.studio.more');
  return (
    <div className="relative shrink-0">
      <button
        ref={buttonRef}
        type="button"
        data-story-studio-more
        aria-label={label}
        title={label}
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
        className={ROUND_GLASS}
        style={{ outlineColor: 'var(--color-ios-brand)', color: 'var(--color-ios-ink)', opacity: disabled ? 0.4 : 1 }}
      >
        <DotsMark size={20} />
      </button>
      {open ? (
        <div
          ref={menuRef}
          role="menu"
          aria-label={label}
          onKeyDown={onMenuKeyDown}
          className="glass-prominent absolute end-0 top-full z-30 mt-2 flex min-w-48 flex-col overflow-hidden rounded-2xl py-1 shadow-lg"
        >
          {items.map((item, index) => (
            <button
              key={item.id}
              ref={(node) => {
                itemRefs.current[index] = node;
              }}
              type="button"
              role="menuitem"
              data-story-menu-item={item.id}
              tabIndex={index === activeIndex ? 0 : -1}
              onClick={() => {
                closeAndFocusButton();
                item.onSelect();
              }}
              className="px-4 text-start text-body focus-visible:outline-2 focus-visible:-outline-offset-2"
              style={{ minHeight: TARGET, color: 'var(--color-ios-ink)', outlineColor: 'var(--color-ios-brand)' }}
            >
              {item.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/**
 * **LE TEXTE DU POST, là où était l'œil** (#8413, miroir
 * `MeeshyComposerHost.postTextButton`) — servi seulement sous un POST : une
 * story et un réel n'ont pas de corps. Un point d'accent dit qu'un texte est
 * déjà écrit.
 */
export function StudioPostTextButton({
  lang,
  written,
  onOpen,
  disabled = false,
}: {
  readonly lang: InterfaceLanguage;
  readonly written: boolean;
  readonly onOpen: () => void;
  readonly disabled?: boolean;
}) {
  const label = translate(lang, 'story.studio.postText');
  return (
    <button
      type="button"
      data-story-post-text={written ? 'written' : 'empty'}
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onOpen}
      className={`${ROUND_GLASS} relative`}
      style={{ outlineColor: 'var(--color-ios-brand)', color: 'var(--color-ios-ink)', opacity: disabled ? 0.4 : 1 }}
    >
      <Glyph name="file" size={18} />
      {written ? (
        <span aria-hidden="true" className="absolute end-2 top-2 size-2 rounded-full" style={{ backgroundColor: 'var(--color-ios-brand)' }} />
      ) : null}
    </button>
  );
}
