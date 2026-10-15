import type { EmphasisStyle } from '@meeshy/shared/utils/text-segments';

import { translate, type InterfaceCatalogKey } from '@/lib/i18n-catalog';
import { currentInterfaceLanguage } from '@/lib/interface-language';

/**
 * **LES QUATRE EMPHASES À PORTÉE DE DOIGT** (#7849) — la barre qui apparaît
 * au-dessus du champ dès qu'un mot est SÉLECTIONNÉ. Gras, italique, souligné,
 * barré, et rien d'autre : le reste du markdown (titres, listes, citations,
 * code) se tape mais ne s'offre pas, parce qu'il sert rarement en conversation.
 *
 * Chaque bouton se DESSINE dans son style (un « B » gras, un « S » barré) :
 * c'est l'étiquette que tout traitement de texte a apprise à l'utilisateur.
 * `onPointerDown` empêche le bouton de voler le focus — sans lui, la
 * sélection disparaîtrait au moment où on veut la mettre en forme.
 */

export const FORMAT_BUTTONS = [
  { style: 'bold', letter: 'B', label: 'composer.format.bold', shortcut: 'B', shift: false, css: { fontWeight: 800 } },
  { style: 'italic', letter: 'I', label: 'composer.format.italic', shortcut: 'I', shift: false, css: { fontStyle: 'italic', fontFamily: 'Georgia, serif' } },
  { style: 'underline', letter: 'U', label: 'composer.format.underline', shortcut: 'U', shift: false, css: { textDecoration: 'underline' } },
  { style: 'strikethrough', letter: 'S', label: 'composer.format.strikethrough', shortcut: 'X', shift: true, css: { textDecoration: 'line-through' } },
] as const satisfies readonly {
  readonly style: EmphasisStyle;
  readonly letter: string;
  /** La clé du catalogue d'interface qui NOMME l'emphase. */
  readonly label: InterfaceCatalogKey;
  readonly shortcut: string;
  /** Le raccourci passe par Maj (« Maj+X » en français, « Shift+X » en anglais). */
  readonly shift: boolean;
  readonly css: React.CSSProperties;
}[];

/**
 * LE RACCOURCI CLAVIER d'une emphase — Ctrl (Cmd sur Mac) + B / I / U, et
 * Ctrl + Maj + X pour le barré (celui de Google Docs et de Slack). `null` :
 * ce n'est pas un raccourci de format, la touche suit son chemin.
 */
export function emphasisShortcutOf(event: {
  readonly key: string;
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
  readonly shiftKey: boolean;
  readonly altKey: boolean;
}): EmphasisStyle | null {
  if (!(event.ctrlKey || event.metaKey) || event.altKey) return null;
  const key = event.key.toLowerCase();
  if (event.shiftKey) return key === 'x' ? 'strikethrough' : null;
  if (key === 'b') return 'bold';
  if (key === 'i') return 'italic';
  if (key === 'u') return 'underline';
  return null;
}

export function ComposerFormatBar({ onFormat }: { readonly onFormat: (style: EmphasisStyle) => void }) {
  const language = currentInterfaceLanguage();
  return (
    <div
      role="toolbar"
      aria-label={translate(language, 'composer.format.toolbar')}
      data-format-bar=""
      className="flex items-center gap-1 px-3 pt-2"
    >
      {FORMAT_BUTTONS.map((button) => {
        const label = translate(language, button.label);
        const shortcut = button.shift ? `${translate(language, 'composer.format.shift')}+${button.shortcut}` : button.shortcut;
        return (
        <button
          key={button.style}
          type="button"
          onPointerDown={(event) => event.preventDefault()}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => onFormat(button.style)}
          aria-label={`${label} (Ctrl+${shortcut})`}
          title={`${label} — Ctrl+${shortcut}`}
          data-format={button.style}
          className="grid size-11 place-items-center rounded-chip text-[17px]"
          style={{
            ...button.css,
            color: 'var(--color-ios-ink)',
            backgroundColor: 'color-mix(in srgb, var(--accent) 10%, transparent)',
          }}
        >
          <span aria-hidden>{button.letter}</span>
        </button>
        );
      })}
    </div>
  );
}
