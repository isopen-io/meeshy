/**
 * **L'INTERRUPTEUR D'iOS** (`Toggle` de SwiftUI) — 51 × 31, pastille blanche,
 * piste à la couleur d'accent quand il est ouvert. Purement visuel (`aria-hidden`) :
 * le bouton `role="switch"` qui le porte dit l'état au lecteur d'écran et tient la
 * cible de 44 px. Même dessin que les interrupteurs des réglages
 * (`routes/settings-sections.tsx`).
 */
export function IosSwitch({ checked, tint = 'var(--color-ios-brand)' }: { readonly checked: boolean; readonly tint?: string }) {
  return (
    <span
      aria-hidden="true"
      className="relative block rounded-chip"
      style={{
        width: 51,
        height: 31,
        backgroundColor: checked ? tint : 'color-mix(in srgb, var(--color-ios-ink-3) 45%, transparent)',
        transition: 'background-color 160ms ease',
      }}
    >
      <span
        className="absolute block rounded-chip"
        style={{
          top: 2,
          insetInlineStart: checked ? 22 : 2,
          width: 27,
          height: 27,
          backgroundColor: 'var(--color-ios-on-brand)',
          boxShadow: 'var(--shadow-sm)',
          transition: 'inset-inline-start 160ms ease',
        }}
      />
    </span>
  );
}
