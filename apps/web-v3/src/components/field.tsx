import type { ReactNode } from 'react';

import { Glyph } from './glyph';
import type { GlyphName } from './glyphs';

/**
 * LE BLOC DE CHAMP (#5555, E7) — que les 40+ écrans restants copieront.
 *
 * Miroir de la composition répétée dans `LoginView.swift`/`SignupView.swift` :
 * icône violette à 70 % à gauche, surface `theme.inputBackground`, coin
 * `MeeshyRadius.md` (14 px), bord `inputBorder` à 30 % — teinté et à 60 %
 * quand focus. Le refus se pose SOUS le champ, en `role="alert"`.
 *
 * PRIMITIVES EN PROPS, AUCUN MAGASIN GLOBAL (Zero Unnecessary Re-render) :
 * `focused` est un booléen que l'écran porte lui-même (`useState`) — ce
 * composant ne s'abonne à rien.
 */
export function Field({
  id,
  label,
  icon,
  tint,
  focused,
  error,
  children,
}: {
  id: string;
  label?: string | undefined;
  icon?: GlyphName | undefined;
  /** La couleur du bord au focus — `var(--ios-purple-600)` (connexion) ou
   * `var(--ios-indigo-500)` (inscription) : DEUX écrans, deux teintes,
   * jamais une troisième source de vérité pour le focus. */
  tint: string;
  focused: boolean;
  error?: string | undefined;
  /** L'`<input>`/`<select>` lui-même — reçoit `id` et `aria-describedby` pour
   * que le refus SOUS le champ soit lu par un lecteur d'écran comme le champ
   * lui-même, jamais un texte à part. */
  children: (ids: { id: string; describedBy: string | undefined }) => ReactNode;
}) {
  const errorId = `${id}-error`;
  return (
    <div className="grid gap-1">
      {label !== undefined ? (
        <label htmlFor={id} className="text-caption font-medium" style={{ color: 'var(--color-ios-ink-3)' }}>
          {label}
        </label>
      ) : null}
      <div
        className="flex items-center gap-3 rounded-[14px] px-4 transition-colors"
        style={{
          minHeight: 48,
          backgroundColor: 'var(--color-ios-card)',
          border: `1px solid ${
            focused ? `color-mix(in srgb, ${tint} 60%, transparent)` : 'color-mix(in srgb, var(--color-ios-ink-3) 30%, transparent)'
          }`,
        }}
      >
        {icon !== undefined ? (
          <Glyph name={icon} size={20} style={{ color: `color-mix(in srgb, ${tint} 70%, transparent)`, flexShrink: 0 }} />
        ) : null}
        {children({ id, describedBy: error !== undefined ? errorId : undefined })}
      </div>
      {error !== undefined ? (
        <p id={errorId} role="alert" className="text-caption" style={{ color: 'var(--ios-error)' }}>
          {error}
        </p>
      ) : null}
    </div>
  );
}
