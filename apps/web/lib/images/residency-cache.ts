/**
 * Registre borné, en mémoire, des URLs déjà chargées/décodées côté client
 * pendant cette session — l'équivalent web de la lecture synchrone NSCache
 * d'iOS (`DiskCacheStore.cachedImage`, cf. `FullscreenImageSource.isResident`
 * dans `ConversationMediaGalleryView.swift`, #3871). Le navigateur n'offre
 * aucune API synchrone pour interroger son cache HTTP : ce registre est
 * rempli par les consommateurs eux-mêmes au premier chargement/extraction
 * réussi et relu ensuite pour décider, SANS réseau ni spinner, si un plein
 * format peut s'afficher immédiatement (Cache-First, § Instant App
 * Principles du CLAUDE.md racine).
 *
 * Une instance par famille de média (image plein écran, poster vidéo) —
 * jamais un singleton partagé — pour qu'un `reset` de test n'efface pas la
 * résidence de l'autre famille. LRU borné : la résidence n'est qu'un
 * accélérateur d'affichage, jamais une source de vérité — une éviction
 * fait seulement retomber sur la cascade de chargement normale.
 */
export interface ResidencyCache {
  mark(url: string | null | undefined): void;
  has(url: string | null | undefined): boolean;
  reset(): void;
}

export function createResidencyCache(maxEntries: number): ResidencyCache {
  if (maxEntries <= 0) {
    throw new Error('createResidencyCache: maxEntries must be > 0');
  }
  let urls = new Set<string>();

  return {
    mark(url) {
      if (!url) return;
      // Delete-then-add moves the key to the end — Set iteration order is
      // insertion order, so this is how we track "least recently marked".
      urls.delete(url);
      urls.add(url);
      if (urls.size > maxEntries) {
        const oldest = urls.values().next().value;
        if (oldest !== undefined) urls.delete(oldest);
      }
    },
    has(url) {
      return !!url && urls.has(url);
    },
    reset() {
      urls = new Set<string>();
    },
  };
}

/** Résidence des plein formats d'IMAGE déjà affichés en plein écran. */
export const fullscreenImageResidency = createResidencyCache(300);
