/**
 * `ReelPoster` (#6457, extrait pour #6903) — l'AFFICHE d'un réel hors de la
 * fenêtre de lecture (`mode="far"`, `lib/reels/thread.ts#pageModeOf`) : la
 * vignette du média, jamais un lecteur. Site UNIQUE, consommé par
 * `reel-page.tsx` (médias) ET `reel-scene-stage.tsx` (scène, #6903) —
 * extrait de `reel-page.tsx` pour éviter un import croisé entre les deux
 * (`reel-scene-stage.tsx` est chargé À LA DEMANDE par `reel-page.tsx`).
 */
export function ReelPoster({ src }: { readonly src: string | undefined }) {
  return (
    <div
      data-reel-poster
      aria-hidden="true"
      className="absolute inset-0"
      style={src !== undefined ? { backgroundImage: `url("${src}")`, backgroundSize: 'contain', backgroundPosition: 'center', backgroundRepeat: 'no-repeat' } : {}}
    />
  );
}

/** Le disque sombre sous chaque glyphe du rail — `adaptiveGlass(tint:
 * .black.opacity(0.35))`. Partagé par `reel-page.tsx` et
 * `reel-scene-stage.tsx` (#6903) : le tap de pause d'une scène rend le MÊME
 * disque que le tap de pause d'une vidéo. */
export const RAIL_DISC = 'rgba(0,0,0,0.38)';
