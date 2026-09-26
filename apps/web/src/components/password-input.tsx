import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react';

import { translate } from '@/lib/i18n-catalog';
import { currentInterfaceLanguage } from '@/lib/interface-language';

import { Glyph } from './glyph';

/**
 * LE CHAMP DE MOT DE PASSE, ÉCRIT UNE FOIS (#8054, directive porteur
 * 2026-09-26 : « permettre d'afficher et cacher si souhaité — actuellement on
 * ne voit que des étoiles »).
 *
 * Masqué par défaut ; le bouton œil, à droite DANS le champ, bascule
 * affiché/masqué. Il se nomme par ce qu'il FERA (« Afficher… » / « Masquer… »)
 * et annonce son état par `aria-pressed`. Sa cible fait 44 px.
 *
 * LE FOCUS ET LE CURSEUR RESTENT DANS LE CHAMP. Le `mousedown` du bouton est
 * empêché : un pointeur ne vole jamais le focus au champ, donc `onBlur` ne
 * part pas (le bord de `Field` ne clignote pas) et le clavier virtuel ne se
 * replie pas. Changer `type` replace le curseur en tête — Chrome le fait
 * APRÈS le clic, de façon asynchrone (mesuré : un `setSelectionRange`
 * synchrone est défait) : la sélection est relevée avant la bascule, reposée
 * au rendu puis à l'image suivante. Au clavier (Tab puis
 * Entrée), le focus reste sur le bouton — c'est lui qu'on vient d'actionner.
 *
 * Posé tel quel dans le cadre d'un `Field` (qui est une rangée flexible) ou
 * seul : le conteneur prend la largeur restante, le bouton se pose sur le bord
 * droit de l'`<input>`, qui lui réserve sa place.
 */
export function PasswordInput({
  id,
  value,
  onValue,
  autoComplete,
  placeholder,
  autoFocus = false,
  describedBy,
  invalid,
  onFocus,
  onBlur,
  className = 'w-full bg-transparent py-3 text-input outline-none',
  style = { color: 'var(--color-ios-ink)' },
}: {
  readonly id: string;
  readonly value: string;
  readonly onValue: (value: string) => void;
  readonly autoComplete: 'current-password' | 'new-password';
  readonly placeholder?: string | undefined;
  readonly autoFocus?: boolean | undefined;
  readonly describedBy?: string | undefined;
  readonly invalid?: boolean | undefined;
  readonly onFocus?: (() => void) | undefined;
  readonly onBlur?: (() => void) | undefined;
  readonly className?: string | undefined;
  readonly style?: CSSProperties | undefined;
}) {
  const language = currentInterfaceLanguage();
  const [revealed, setRevealed] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const pendingSelection = useRef<readonly [number, number] | null>(null);

  useLayoutEffect(() => {
    const field = inputRef.current;
    const selection = pendingSelection.current;
    pendingSelection.current = null;
    if (field === null || selection === null) return;
    const place = () => {
      field.focus();
      field.setSelectionRange(selection[0], selection[1]);
    };
    place();
    const frame = requestAnimationFrame(place);
    return () => cancelAnimationFrame(frame);
  }, [revealed]);

  const flip = () => {
    const field = inputRef.current;
    pendingSelection.current =
      field !== null && document.activeElement === field ? [field.selectionStart ?? value.length, field.selectionEnd ?? value.length] : null;
    setRevealed((current) => !current);
  };

  return (
    <span className="relative flex min-w-0 flex-1 items-center">
      <input
        ref={inputRef}
        id={id}
        type={revealed ? 'text' : 'password'}
        autoComplete={autoComplete}
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        autoFocus={autoFocus}
        value={value}
        /* `onInput`, jamais `onChange` (motif `magic-link-flow.tsx#magic-link-email`). */
        onInput={(event) => onValue(event.currentTarget.value)}
        onFocus={onFocus}
        onBlur={onBlur}
        placeholder={placeholder}
        aria-describedby={describedBy}
        aria-invalid={invalid}
        className={className}
        style={{ ...style, paddingInlineEnd: 44 }}
      />
      <button
        type="button"
        data-password-toggle
        aria-controls={id}
        aria-pressed={revealed}
        aria-label={translate(language, revealed ? 'password.hide' : 'password.show')}
        onMouseDown={(event) => event.preventDefault()}
        onClick={flip}
        className="absolute inset-y-0 end-0 grid place-items-center"
        style={{ minWidth: 44, minHeight: 44, color: 'var(--color-ios-ink-3)' }}
      >
        <Glyph name={revealed ? 'eyeSlash' : 'eye'} size={20} />
      </button>
    </span>
  );
}
