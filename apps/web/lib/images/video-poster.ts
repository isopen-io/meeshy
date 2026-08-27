/**
 * Poster plein écran d'une vidéo — miroir simplifié du patron iOS
 * `VideoPosterResolver`/`VideoPosterPlan` (`VideoPosterResolver.swift`,
 * commit 4bedd04bb, #3871 → #3878). La vignette `thumbnailUrl` ne sert
 * JAMAIS de poster net : c'est un fond flou assumé tant que la première
 * image RÉELLE de la vidéo n'est pas extraite (canvas `<video>` + seek, cf.
 * `extractVideoFirstFrame`) ou pas encore résidente.
 */
export interface FullscreenVideoPosterMount {
  /** Poster net à afficher — non-null seulement quand une extraction a réussi. */
  readonly posterUrl: string | null;
  /** Fond flou assumé pendant l'extraction — `null` une fois le poster net obtenu. */
  readonly backdropUrl: string | null;
  readonly isResident: boolean;
}

export interface ResolveFullscreenVideoPosterParams {
  readonly extractedFrameUrl: string | null | undefined;
  readonly thumbnailUrl?: string | null;
  readonly isExtractedResident: boolean;
}

/**
 * Pure : aucune E/S. Une image extraite gagne TOUJOURS sur la vignette,
 * même si les deux sont fournies — la vignette ne doit jamais cohabiter
 * avec le poster net comme un second candidat d'affichage.
 */
export function resolveFullscreenVideoPoster(
  params: ResolveFullscreenVideoPosterParams
): FullscreenVideoPosterMount {
  const { extractedFrameUrl, thumbnailUrl, isExtractedResident } = params;
  if (extractedFrameUrl) {
    return { posterUrl: extractedFrameUrl, backdropUrl: null, isResident: isExtractedResident };
  }
  return { posterUrl: null, backdropUrl: thumbnailUrl ?? null, isResident: false };
}

// -------- Cache (Cache-First résidence + valeur) --------

export interface VideoPosterCache {
  /** Lecture SYNCHRONE — l'équivalent web de `VideoPosterResolver.persistedPoster` iOS. `null` si absent. */
  get(url: string | null | undefined): string | null;
  set(url: string, posterUrl: string): void;
  reset(): void;
}

/**
 * Une Object URL retient son Blob VIVANT jusqu'à révocation explicite : borner
 * la Map borne le nombre d'entrées, pas la MÉMOIRE. Sans ceci, chaque poster
 * évincé (ou remplacé, ou effacé par `reset`) laissait derrière lui une image
 * JPEG plein format que rien ne pouvait plus libérer avant un rechargement de
 * page — une fuite d'autant plus silencieuse qu'elle ne se voit ni dans le
 * cache ni dans le tas JS. Les valeurs non-`blob:` (fixtures de test, posters
 * distants) ne sont pas concernées.
 */
function releasePosterUrl(posterUrl: string): void {
  if (!posterUrl.startsWith('blob:')) return;
  if (typeof URL === 'undefined' || typeof URL.revokeObjectURL !== 'function') return;
  try {
    URL.revokeObjectURL(posterUrl);
  } catch {
    // Best-effort — une révocation refusée ne doit jamais casser le cache.
  }
}

/**
 * Cache borné en mémoire des posters vidéo (première image nette) déjà
 * extraits pendant cette session — contrairement à `residency-cache.ts`
 * (un simple Set de résidence), celui-ci retient la VALEUR pour qu'une page
 * qui rouvre la même vidéo affiche son poster net immédiatement, sans
 * relancer d'extraction (Cache-First, § Instant App Principles). Toute valeur
 * qui SORT du cache est révoquée (cf. `releasePosterUrl`).
 */
export function createVideoPosterCache(maxEntries: number): VideoPosterCache {
  if (maxEntries <= 0) {
    throw new Error('createVideoPosterCache: maxEntries must be > 0');
  }
  let entries = new Map<string, string>();

  return {
    get(url) {
      if (!url) return null;
      return entries.get(url) ?? null;
    },
    set(url, posterUrl) {
      if (!url) return;
      const previous = entries.get(url);
      if (previous !== undefined && previous !== posterUrl) releasePosterUrl(previous);
      entries.delete(url);
      entries.set(url, posterUrl);
      if (entries.size > maxEntries) {
        const oldestKey = entries.keys().next().value;
        if (oldestKey !== undefined) {
          const evicted = entries.get(oldestKey);
          entries.delete(oldestKey);
          if (evicted !== undefined) releasePosterUrl(evicted);
        }
      }
    },
    reset() {
      entries.forEach(releasePosterUrl);
      entries = new Map();
    },
  };
}

/** Posters vidéo (première image nette) déjà extraits pendant cette session. */
export const fullscreenVideoPosterCache = createVideoPosterCache(150);

// -------- Extraction (impure, DOM) --------

export interface ExtractVideoFirstFrameOptions {
  /** Seconde à laquelle chercher — évite l'image souvent noire à t=0. Défaut 0.1s. */
  seekTime?: number;
  /** Plus grand côté (px) du canevas d'extraction — budget mémoire. Défaut 1920 (mêmes ordres de grandeur que `VideoPosterGrade.extractionMaxDimension` iOS). */
  maxDimension?: number;
  /** Délai (ms) avant d'abandonner l'extraction. Défaut 8000 (aligné sur le timeout iOS `MeeshyVideoThumbnail.extractRemoteFirstFrame`). */
  timeoutMs?: number;
}

/**
 * Extrait la première image NETTE d'une vidéo par décodage matériel du
 * navigateur : un `<video>` hors-écran charge l'URL, cherche `seekTime`,
 * puis un `<canvas>` copie la frame décodée. Rend une Object URL (jamais un
 * `data:` URI — évite de charger un base64 multi-Mo en mémoire de rendu) ou
 * `null` si l'extraction échoue/expire (réseau, format non supporté,
 * environnement sans `document` — SSR). L'élément vidéo est monté hors-écran
 * le temps de l'extraction (certains moteurs ne décodent pas un `<video>`
 * jamais attaché au DOM), puis retiré — aucune fuite.
 */
export async function extractVideoFirstFrame(
  url: string,
  options?: ExtractVideoFirstFrameOptions
): Promise<string | null> {
  if (typeof document === 'undefined' || !url) return null;

  const seekTime = options?.seekTime ?? 0.1;
  const maxDimension = options?.maxDimension ?? 1920;
  const timeoutMs = options?.timeoutMs ?? 8000;

  return new Promise<string | null>((resolve) => {
    const video = document.createElement('video');
    video.crossOrigin = 'anonymous';
    // `metadata`, jamais `auto` : cet élément vit À CÔTÉ du `<video>` que
    // l'utilisateur s'apprête à LIRE, sur la même URL. En `auto`, le
    // navigateur télécharge le fichier une seconde fois EN ENTIER pour une
    // seule image — doublant la bande passante de chaque ouverture plein
    // écran, et en concurrence directe avec la lecture. `metadata` + un
    // `currentTime` fait chercher les seuls octets nécessaires à `seekTime`.
    video.preload = 'metadata';
    video.muted = true;
    video.playsInline = true;
    video.style.position = 'fixed';
    video.style.left = '-9999px';
    video.style.top = '-9999px';
    video.style.width = '1px';
    video.style.height = '1px';
    video.setAttribute('aria-hidden', 'true');

    let settled = false;
    const timer = setTimeout(() => finish(null), timeoutMs);

    function finish(result: string | null): void {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        video.removeAttribute('src');
        video.load();
        video.remove();
      } catch {
        // Best-effort cleanup — some engines (jsdom in tests) don't implement
        // media loading and may throw here; cleanup failure must never block
        // resolution, or the promise would hang until the outer timeout.
      }
      resolve(result);
    }

    video.addEventListener('error', () => finish(null));

    video.addEventListener('loadedmetadata', () => {
      const target = Math.min(seekTime, Math.max(video.duration - 0.05, 0));
      try {
        video.currentTime = Number.isFinite(target) ? target : 0;
      } catch {
        finish(null);
      }
    });

    video.addEventListener('seeked', () => {
      try {
        const longestSide = Math.max(video.videoWidth, video.videoHeight, 1);
        const scale = Math.min(1, maxDimension / longestSide);
        const width = Math.max(1, Math.round(video.videoWidth * scale));
        const height = Math.max(1, Math.round(video.videoHeight * scale));

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          finish(null);
          return;
        }
        ctx.drawImage(video, 0, 0, width, height);

        canvas.toBlob(
          (blob) => {
            if (!blob) {
              finish(null);
              return;
            }
            finish(URL.createObjectURL(blob));
          },
          'image/jpeg',
          0.92
        );
      } catch {
        finish(null);
      }
    });

    document.body.appendChild(video);
    video.src = url;
  });
}
