/**
 * LE VERRE, côté web — l'équivalent de `adaptiveGlass` du SDK iOS (#5844).
 *
 * iOS a `adaptiveGlass` / `adaptiveGlassProminent` (`MeeshyUI/Compatibility`),
 * et le dépôt y interdit d'appeler `.glassEffect` en direct pour que le repli
 * d'avant iOS 26 existe en UN endroit. Le web n'avait rien : chaque surface
 * translucide réécrivait son `backdrop-blur`. Ce composant est le pendant —
 * un seul endroit, pour que la matière soit la même partout.
 *
 * **`backdrop-filter` n'est pas garanti.** Sur un moteur qui ne le supporte pas,
 * ou quand l'utilisateur a désactivé la transparence, la surface doit rester
 * LISIBLE : le fond de repli est donc opaque à 92 %, pas transparent. Une
 * surface qui compte sur le flou pour son contraste devient illisible dès que
 * le flou n'arrive pas — et rien ne le signale.
 */
export function GlassSurface({
  children,
  className = '',
  prominent = false,
  role,
  'aria-label': ariaLabel,
}: {
  children: React.ReactNode;
  className?: string;
  /** Plus dense — pour ce qui se pose SUR du contenu, comme un menu. */
  prominent?: boolean;
  role?: string;
  'aria-label'?: string;
}) {
  return (
    <div
      role={role}
      aria-label={ariaLabel}
      className={`rounded-card backdrop-blur-xl ${className}`}
      style={{
        // Le repli opaque vient EN PREMIER : si `backdrop-filter` ne s'applique
        // pas, c'est lui qui porte le contraste.
        backgroundColor: prominent
          ? 'color-mix(in srgb, var(--color-ios-surface) 92%, transparent)'
          : 'color-mix(in srgb, var(--color-ios-surface) 78%, transparent)',
        border: '1px solid color-mix(in srgb, var(--color-ios-ink) 10%, transparent)',
        boxShadow: prominent ? '0 12px 40px color-mix(in srgb, var(--color-ios-ink) 18%, transparent)' : 'none',
      }}
    >
      {children}
    </div>
  );
}

/**
 * LA FLÈCHE DE RETOUR EN VERRE, posée sur la bordure GAUCHE du viewport (#5844).
 *
 * Directive porteur. Elle reste un CONTRÔLE : 44 pt de cible et une étiquette
 * lisible au lecteur d'écran — le verre change la matière, jamais le contrat
 * d'accessibilité.
 */
export function GlassBack({ children, label = 'Retour' }: { children: React.ReactNode; label?: string }) {
  return (
    <span
      className="grid size-11 shrink-0 place-items-center rounded-full backdrop-blur-xl"
      aria-hidden="true"
      style={{
        backgroundColor: 'color-mix(in srgb, var(--color-ios-surface) 80%, transparent)',
        border: '1px solid color-mix(in srgb, var(--color-ios-ink) 12%, transparent)',
      }}
      title={label}
    >
      {children}
    </span>
  );
}
