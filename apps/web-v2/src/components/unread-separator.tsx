/**
 * LE SÉPARATEUR DE NON-LUS EN FLUX (#7202, D-L3) — même GABARIT que la
 * pilule de jour EN FLUX (`routes/thread-modes.tsx`, le
 * `<div className="flex justify-center py-1.5">` qui précède une rangée
 * dont `opensDay` n'est pas nul), en couleur PRIMAIRE au lieu de neutre :
 * `--color-ios-brand`, JAMAIS `accent` (la teinte de la CONVERSATION,
 * `ThreadModes({ accent })`) — D-L3 l'exige explicitement.
 *
 * `role="heading"` / `aria-level={2}` : même dispositif que `DayPill`
 * (`components/thread-chrome.tsx`) — un repère de NAVIGATION pour un
 * lecteur d'écran, pas un texte décoratif.
 */
export function UnreadSeparator({ label }: { readonly label: string }) {
  return (
    <div className="flex justify-center py-1.5" data-unread-separator>
      <span
        role="heading"
        aria-level={2}
        className="rounded-chip px-3 py-1 text-time font-semibold text-white"
        style={{ backgroundColor: 'var(--color-ios-brand)' }}
      >
        {label}
      </span>
    </div>
  );
}
