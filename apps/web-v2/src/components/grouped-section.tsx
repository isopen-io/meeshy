import type { ReactNode } from 'react';

/**
 * **LA SECTION GROUPÉE** (#5563) — l'anatomie commune de `ProfileView` et de
 * `SettingsView` (iOS) : un titre de section coloré avec son icône, puis une
 * carte qui porte les rangées. Extraite du profil (#6289) au moment où les
 * réglages en ont eu besoin : deux copies de la même carte auraient divergé
 * avant la prochaine revue.
 *
 * Les textes à l'encre lisible (`SECTION_BRAND_INK`) reprennent la classe de la
 * cloche (`routes/notifications.tsx`), mesurée AA dans les deux schémas.
 */

export const SECTION_INK = 'var(--color-ios-ink)';
export const SECTION_INK_2 = 'var(--color-ios-ink-2)';
export const SECTION_BRAND_INK = 'text-[color:var(--ios-indigo-400)] light:text-[color:var(--ios-indigo-600)]';
export const SECTION_CARD_STYLE = {
  backgroundColor: 'var(--color-ios-card)',
  border: '1px solid color-mix(in srgb, var(--color-ios-ink-3) 22%, transparent)',
} as const;

export function GroupedSection({
  id,
  title,
  icon,
  card = true,
  children,
}: {
  readonly id: string;
  readonly title: string;
  readonly icon: ReactNode;
  readonly card?: boolean;
  readonly children: ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="grid gap-2">
      <h2 id={id} className={`flex items-center gap-1.5 ps-1 text-check font-bold tracking-wide ${SECTION_BRAND_INK}`}>
        {icon}
        {title}
      </h2>
      {card ? (
        <div className="grid overflow-hidden rounded-card" style={SECTION_CARD_STYLE}>
          {children}
        </div>
      ) : (
        children
      )}
    </section>
  );
}

/** L'icône de rangée : 28 × 28, teintée, DÉCORATIVE — la rangée se nomme par son texte. */
export function RowIcon({ tint = 'var(--color-ios-brand)', children }: { readonly tint?: string; readonly children: ReactNode }) {
  return (
    <span
      aria-hidden="true"
      className="grid shrink-0 place-items-center rounded-[8px]"
      style={{ width: 28, height: 28, color: tint, backgroundColor: `color-mix(in srgb, ${tint} 12%, transparent)` }}
    >
      {children}
    </span>
  );
}
