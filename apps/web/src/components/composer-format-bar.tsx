import type { EmphasisStyle } from '@meeshy/shared/utils/text-segments';

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
  { style: 'bold', letter: 'B', label: 'Gras', shortcut: 'B', css: { fontWeight: 800 } },
  { style: 'italic', letter: 'I', label: 'Italique', shortcut: 'I', css: { fontStyle: 'italic', fontFamily: 'Georgia, serif' } },
  { style: 'underline', letter: 'U', label: 'Souligné', shortcut: 'U', css: { textDecoration: 'underline' } },
  { style: 'strikethrough', letter: 'S', label: 'Barré', shortcut: 'Maj+X', css: { textDecoration: 'line-through' } },
] as const satisfies readonly {
  readonly style: EmphasisStyle;
  readonly letter: string;
  readonly label: string;
  readonly shortcut: string;
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
  return (
    <div
      role="toolbar"
      aria-label="Mise en forme"
      data-format-bar=""
      className="flex items-center gap-1 px-3 pt-2"
    >
      {FORMAT_BUTTONS.map((button) => (
        <button
          key={button.style}
          type="button"
          onPointerDown={(event) => event.preventDefault()}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => onFormat(button.style)}
          aria-label={`${button.label} (Ctrl+${button.shortcut})`}
          title={`${button.label} — Ctrl+${button.shortcut}`}
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
      ))}
    </div>
  );
}
