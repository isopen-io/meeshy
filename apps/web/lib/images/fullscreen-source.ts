/**
 * Décision de source pour le plein écran d'une image — miroir du patron iOS
 * `FullscreenImageSource.resolve` (`ConversationMediaGalleryView.swift`,
 * commit 4bedd04bb, #3871 → #3878). Le plein format RÉSIDENT (déjà chargé
 * côté client) s'affiche TEL QUEL, sans transition, sans spinner ; sinon on
 * force le chargement du plein format et on ne montre QUE `thumbnailUrl`
 * comme fond flou assumé pendant l'attente — jamais comme l'image affichée
 * nette elle-même. Pure : aucune E/S, aucun DOM, aucun accès réseau — la
 * résidence (`isFullResident`) est un FAIT que l'appelant a déjà établi
 * (cf. `lib/images/residency-cache.ts`).
 */
export interface FullscreenImageMount {
  readonly fullUrl: string;
  /** Fond décoratif flou pendant le chargement — `null` quand le plein format est déjà résident : rien à couvrir. */
  readonly backdropUrl: string | null;
  readonly isResident: boolean;
}

export interface ResolveFullscreenImageSourceParams {
  readonly fullUrl: string | null | undefined;
  readonly thumbnailUrl?: string | null;
  readonly isFullResident: boolean;
}

/** `null` sans plein format disponible — l'appelant rend alors son état vide. */
export function resolveFullscreenImageSource(
  params: ResolveFullscreenImageSourceParams
): FullscreenImageMount | null {
  const { fullUrl, thumbnailUrl, isFullResident } = params;
  if (!fullUrl) return null;
  return {
    fullUrl,
    backdropUrl: isFullResident ? null : (thumbnailUrl ?? null),
    isResident: isFullResident,
  };
}
