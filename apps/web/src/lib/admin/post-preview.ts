import type { CanvasDocument } from '@/lib/canvas/document';
import type { SceneCarrier } from '@/lib/canvas/carrier';
import type { AdminPostMedia } from '@/lib/api/admin-posts-detail';

/**
 * **L'APERÇU D'UNE PUBLICATION SANS QUITTER LA LISTE** (#10393) — fonctions PURES :
 *
 * - `previewPlanOf` : une story, un réel (ou un post) qui porte une SCÈNE v3 (lue par la
 *   fiche) se rend par le lecteur de scène de l'application, celui du fil — sinon chaque
 *   média dans son lecteur : vidéo lue, audio lu, image en plein format ; un fichier
 *   reste un lien. Rien à montrer ⇒ le texte seul.
 * - `sceneCarrierOf` : les médias que la scène adresse, comme le fil les lui remet.
 * - `neighborsOf` / `previewKeyOf` : la publication précédente et suivante de la page,
 *   au clic comme au clavier (j, k, flèches).
 */
export type PreviewMediaPlayer = 'video' | 'audio' | 'image' | 'file';

export type PreviewMediaItem = { readonly id: string; readonly player: PreviewMediaPlayer; readonly src: string; readonly poster: string | null };

export type PreviewPlan =
  | { readonly kind: 'scene'; readonly mode: 'story' | 'reel' | 'card' }
  | { readonly kind: 'media'; readonly items: readonly PreviewMediaItem[] }
  | { readonly kind: 'text' };

const playerOf = (mimeType: string): PreviewMediaPlayer => {
  if (mimeType.startsWith('video/')) return 'video';
  if (mimeType.startsWith('audio/')) return 'audio';
  if (mimeType.startsWith('image/')) return 'image';
  return 'file';
};

const sceneModeOf = (type: string | null): 'story' | 'reel' | 'card' => (type === 'STORY' ? 'story' : type === 'REEL' ? 'reel' : 'card');

export function previewPlanOf(post: { readonly type: string | null; readonly canvas: CanvasDocument | null; readonly media: readonly AdminPostMedia[] }): PreviewPlan {
  if (post.canvas !== null) return { kind: 'scene', mode: sceneModeOf(post.type) };
  const items = post.media.flatMap((media): PreviewMediaItem[] =>
    media.fileUrl === null ? [] : [{ id: media.id, player: playerOf(media.mimeType), src: media.fileUrl, poster: media.thumbnailUrl }],
  );
  return items.length === 0 ? { kind: 'text' } : { kind: 'media', items };
}

export function sceneCarrierOf(postId: string, media: readonly AdminPostMedia[], resolve: (url: string) => string): SceneCarrier {
  return {
    postId,
    media: media.flatMap((entry) =>
      entry.fileUrl === null
        ? []
        : [{ id: entry.id, src: resolve(entry.fileUrl), mimeType: entry.mimeType, ...(entry.thumbnailUrl === null ? {} : { poster: resolve(entry.thumbnailUrl) }) }],
    ),
  };
}

export function neighborsOf(rows: readonly { readonly id: string }[], id: string): { readonly previous: string | null; readonly next: string | null } {
  const index = rows.findIndex((row) => row.id === id);
  if (index < 0) return { previous: null, next: null };
  return { previous: rows[index - 1]?.id ?? null, next: rows[index + 1]?.id ?? null };
}

export function previewKeyOf(key: string): 'next' | 'previous' | null {
  if (key === 'j' || key === 'J' || key === 'ArrowDown' || key === 'ArrowRight') return 'next';
  if (key === 'k' || key === 'K' || key === 'ArrowUp' || key === 'ArrowLeft') return 'previous';
  return null;
}
