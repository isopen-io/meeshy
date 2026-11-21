/**
 * **LE DESSIN D'« EN APPEL »** (#18753, ACT-01) — un combiné décroché pendant l'appel, posé à plat quand la personne
 * a raccroché : le pendant web de `phone.fill` / `phone.down` (iOS). Pur, sans hook ; toujours `aria-hidden` : l'hôte
 * dit l'état avec des mots. Jamais d'interlocuteur à dessiner.
 */
const HANDSET =
  'M5.1 2.2 3.6 2.4c-.6.1-1.1.6-1.1 1.2 0 5.4 4.5 9.9 9.9 9.9.6 0 1.1-.5 1.2-1.1l.2-1.5c.1-.5-.2-1-.7-1.2l-2-.8c-.4-.2-.9 0-1.2.3l-.8 1c-1.6-.8-2.9-2.1-3.7-3.7l1-.8c.3-.3.5-.8.3-1.2l-.8-2c-.2-.5-.7-.8-1.2-.7Z';

export function PhoneCallGlyph({ active, size = 16, ink = 'currentColor' }: { readonly active: boolean; readonly size?: number; readonly ink?: string }) {
  return (
    <svg data-call-glyph={active ? 'active' : 'ended'} aria-hidden="true" width={size} height={size} viewBox="0 0 16 16" fill="none" className="shrink-0">
      <path d={HANDSET} fill={active ? ink : 'none'} stroke={ink} strokeWidth="1.2" strokeLinejoin="round" transform={active ? undefined : 'rotate(135 8 8)'} />
    </svg>
  );
}
