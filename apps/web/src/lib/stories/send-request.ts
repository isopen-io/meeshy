import { attachmentSrc } from '@/lib/api/media-url';
import { recordShareAction } from '@/lib/api/query';
import { publicationShareUrl } from '@/lib/feed/share-url';
import { openSendSheet, type SendSheetRequest } from '@/lib/send/send-sheet-store';

import { storyMediaUrl, type StoryPlaybackMedia, type StoryPlaybackStory } from './playback';

/**
 * **LA STORY, TELLE QUE LA FEUILLE D'ENVOI LA REÇOIT** (#8884) — le lecteur de
 * stories ne monte jamais sa propre feuille : « Envoyer » (le transfert que la
 * loi du rail déclare, `showsForward`) et « Partager » (le rail auteur)
 * ouvrent la MÊME feuille, avec la MÊME demande. La publication est celle
 * qu'on regarde (`postType: 'STORY'`) ; l'adresse canonique part aussi, pour
 * que « Plus d'options… » garde la feuille du système.
 *
 * L'aperçu montre ce que le lecteur voit — la vignette d'abord, le fichier
 * sinon, le texte rogné — et rien d'autre : une story sans l'un ni l'autre
 * n'a pas d'aperçu à inventer.
 */
function thumbnailOf(media: StoryPlaybackMedia): string {
  if (typeof media.thumbnailUrl === 'string' && media.thumbnailUrl !== '') return media.thumbnailUrl;
  return typeof media.mimeType === 'string' && media.mimeType.startsWith('image/') ? storyMediaUrl(media) : '';
}

export function storySendRequest(story: StoryPlaybackStory, record: (postId: string) => unknown = recordShareAction): SendSheetRequest {
  const url = publicationShareUrl(story.id);
  const media = story.media?.[0];
  const thumb = media === undefined ? '' : thumbnailOf(media);
  const text = story.content?.trim() ?? '';
  return {
    intent: 'share',
    payload: {
      kind: 'publication',
      postId: story.id,
      postType: 'STORY',
      url,
      preview: {
        kind: 'publication',
        ...(text === '' ? {} : { text }),
        ...(thumb === '' ? {} : { thumbUrl: attachmentSrc(thumb) }),
      },
    },
    moreOptions: { url },
    onShared: () => void record(story.id),
  };
}

export const openStorySend = (story: StoryPlaybackStory): void => openSendSheet(storySendRequest(story));
