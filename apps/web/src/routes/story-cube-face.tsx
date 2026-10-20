import type { CSSProperties } from 'react';
import type { ServedProfileDecorItem } from '@meeshy/shared/types/profile-decor';

import { PeerAvatar } from '@/components/peer-avatar';
import { attachmentSrc } from '@/lib/api/media-url';
import { backgroundCss } from '@/lib/canvas/background';
import { servedRingOf } from '@/lib/profile-decor/served-ring';
import type { CubeSide } from '@/lib/stories/group-cube';
import {
  currentStoryAt,
  nextGroupPosition,
  previousGroupPosition,
  storyEffectsBackgroundOf,
  storyMediaUrl,
  type StoryPlaybackGroup,
  type StoryPlaybackPosition,
  type StoryPlaybackStory,
} from '@/lib/stories/playback';
import { initialsOf, participantAvatarOf } from '@/lib/view/conversation';
import type { StoryCubeNeighbours } from '@/lib/view/use-story-group-cube';

import { authorLabel } from './story-identity';

/**
 * **LA FACE VOISINE DU CUBE** (#11198) — pendant qu'on tourne vers un autre
 * auteur, c'est SON identité qui arrive : sa photo et son nom, au-dessus
 * d'une vignette floutée de la story où l'on entrera quand le corpus en sert
 * une, sinon de son fond (ou du dégradé de la marque). Rien n'est chargé de
 * plus que ce que le plateau sert déjà ; la vraie story remplace la face une
 * fois celle-ci à plat. La face est muette (`aria-hidden`) : l'en-tête
 * annoncera l'auteur à l'arrivée.
 */
export type StoryCubeNeighbour = {
  readonly storyId: string;
  readonly name: string;
  readonly initials: string;
  readonly avatarSrc: string | undefined;
  /** Comme l'en-tête : la présence d'autrui (jamais la sienne) et le contour servi. */
  readonly presenceKey: string | undefined;
  readonly ringRef: ServedProfileDecorItem | null;
  /** `''` ⇒ aucune vignette servie. */
  readonly thumbnail: string;
  readonly background: string;
};

/** Le fond d'une story v1 — repli sur le dégradé de la marque. SITE UNIQUE du lecteur et de la face voisine. */
export function storyBackgroundCss(background: string | null | undefined): string {
  return backgroundCss(background, 'linear-gradient(135deg, var(--color-ios-brand), var(--color-ios-brand-deep))');
}

function thumbnailOf(story: StoryPlaybackStory): string {
  const media = story.media?.[0];
  if (media === undefined) return '';
  const thumbnail = typeof media.thumbnailUrl === 'string' && media.thumbnailUrl !== '' ? media.thumbnailUrl : '';
  const still = thumbnail !== '' ? thumbnail : (media.mimeType ?? '').startsWith('image/') ? storyMediaUrl(media) : '';
  return still === '' ? '' : attachmentSrc(still);
}

function neighbourAt(groups: readonly StoryPlaybackGroup[], target: StoryPlaybackPosition | null): StoryCubeNeighbour | null {
  if (target === null) return null;
  const group = groups[target.groupIndex];
  const story = currentStoryAt(groups, target);
  if (group === undefined || story === undefined) return null;
  const name = authorLabel(group);
  return {
    storyId: story.id,
    name,
    initials: initialsOf(name),
    avatarSrc: participantAvatarOf(group.author),
    presenceKey: group.isMine ? undefined : group.authorId,
    ringRef: servedRingOf(group.author),
    thumbnail: thumbnailOf(story),
    background: storyBackgroundCss(storyEffectsBackgroundOf(story.storyEffects)),
  };
}

/** Les auteurs voisins, chacun là où le cube l'y posera (`nextGroupPosition` / `previousGroupPosition`). */
export function storyCubeNeighbours(params: {
  readonly groups: readonly StoryPlaybackGroup[];
  readonly position: StoryPlaybackPosition | null;
  readonly now: number;
}): StoryCubeNeighbours<StoryCubeNeighbour> {
  const { groups, position, now } = params;
  if (position === null) return { next: null, previous: null };
  return {
    next: neighbourAt(groups, nextGroupPosition(groups, position, now)),
    previous: neighbourAt(groups, previousGroupPosition(groups, position)),
  };
}

/** Une face se tourne autour de son coin haut-gauche : la matrice du cube porte tout le reste (`group-cube.ts`). */
export const CUBE_FACE_STYLE: CSSProperties = { transformOrigin: '0 0', backfaceVisibility: 'hidden' };

const SHADE_STYLE: CSSProperties = { background: 'var(--color-media-backdrop)', opacity: 'var(--cube-shade, 0)' };

/** L'ombre d'une face qui se détourne — lue sur `--cube-shade`, que le crochet écrit image par image. */
export function StoryCubeShade() {
  return <div aria-hidden="true" data-story-cube-shade="" className="pointer-events-none absolute inset-0" style={{ ...SHADE_STYLE, zIndex: 60 }} />;
}

export function StoryCubeFace({
  side,
  neighbour,
  faceRef,
}: {
  readonly side: CubeSide;
  readonly neighbour: StoryCubeNeighbour | null;
  readonly faceRef: (element: HTMLElement | null) => void;
}) {
  if (neighbour === null) return null;
  return (
    <div
      ref={faceRef}
      aria-hidden="true"
      data-story-cube-face={side}
      className="pointer-events-none absolute inset-0 overflow-hidden"
      style={{ ...CUBE_FACE_STYLE, visibility: 'hidden', willChange: 'transform', background: neighbour.background }}
    >
      {neighbour.thumbnail === '' ? null : (
        <img
          src={neighbour.thumbnail}
          alt=""
          decoding="async"
          draggable={false}
          className="absolute inset-0 h-full w-full object-cover"
          style={{ filter: 'blur(28px)', transform: 'scale(1.2)' }}
        />
      )}
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-8">
        <PeerAvatar
          presenceKey={neighbour.presenceKey}
          ringRef={neighbour.ringRef}
          initials={neighbour.initials}
          color="var(--color-ios-brand)"
          size={72}
          name={neighbour.name}
          {...(neighbour.avatarSrc === undefined ? {} : { src: neighbour.avatarSrc })}
        />
        <p className="viewer-ink-shadow max-w-full truncate text-body font-semibold">{neighbour.name}</p>
      </div>
      <div className="absolute inset-0" style={SHADE_STYLE} />
    </div>
  );
}
