import type { Post } from '@meeshy/shared/types/post';
import { getUserDisplayName } from '@/utils/user-display-name';
import type { StatusItem } from '@/components/v2/StatusBar';

// ============================================================================
// Post (type STATUS) -> StatusItem (for StatusBar)
//
// A "status" / mood is a Post with `type: 'STATUS'` carrying a `moodEmoji`,
// optional short text, and a ~1h expiry. The Prisme translations are passed
// through so the StatusBar's TranslationToggle resolves the viewer's language
// at render time (same shape as `postToStoryData`).
// ============================================================================

const DEFAULT_MOOD_EMOJI = '💭';
const STATUS_TTL_MS = 60 * 60 * 1000;

function mapTranslations(
  translations: unknown,
): Array<{ languageCode: string; languageName: string; content: string }> | undefined {
  if (!translations || typeof translations !== 'object') return undefined;
  const mapped = Object.entries(translations as Record<string, unknown>)
    .map(([languageCode, raw]) => {
      if (typeof raw === 'string') {
        return { languageCode, languageName: languageCode, content: raw };
      }
      if (raw && typeof raw === 'object' && typeof (raw as { text?: unknown }).text === 'string') {
        return { languageCode, languageName: languageCode, content: (raw as { text: string }).text };
      }
      return null;
    })
    .filter((t): t is { languageCode: string; languageName: string; content: string } => t !== null);
  return mapped.length > 0 ? mapped : undefined;
}

function toIso(value: string | Date | null | undefined): string | undefined {
  if (!value) return undefined;
  return typeof value === 'string' ? value : value.toISOString();
}

export function postToStatusItem(post: Post, currentUserId: string): StatusItem {
  const author = post.author;
  return {
    id: post.id,
    author: {
      // Résolution via la SOURCE UNIQUE `getUserDisplayName` (displayName non-vide
      // > username > fallback) — un displayName vide/blanc ne produit plus un
      // libellé de statut vide. Avatar vide (`''`) normalisé en `undefined`.
      name: getUserDisplayName(author, 'Unknown'),
      avatar: author?.avatar || undefined,
    },
    moodEmoji: post.moodEmoji ?? DEFAULT_MOOD_EMOJI,
    content: post.content ?? undefined,
    originalLanguage: post.originalLanguage ?? undefined,
    translations: mapTranslations(post.translations),
    expiresAt: toIso(post.expiresAt) ?? new Date(Date.now() + STATUS_TTL_MS).toISOString(),
    isOwn: post.authorId === currentUserId,
  };
}
