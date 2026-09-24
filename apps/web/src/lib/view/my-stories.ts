import type { StoryTrayMedia, StoryTrayPost } from '@/lib/api/stories';
import type { InterfaceLanguage } from '@/lib/interface-language';
import { thumbHashPlaceholder } from '@/lib/media/thumbhash';
import { isStoryExpired, storyMediaUrl } from '@/lib/stories/playback';

/**
 * **LA LOI DE « MES STORIES »** (#6149) — ce que le listing que la pastille
 * « moi » du rail ouvre désormais doit montrer, PURE, hors de tout rendu.
 * Miroir de `MyStoriesView.swift:104-113` (`activeStories`,
 * `sorted { createdAt > }`).
 */

function timeOf(value: string | Date | undefined): number {
  if (value === undefined) return 0;
  const date = value instanceof Date ? value : new Date(value);
  const ms = date.getTime();
  return Number.isNaN(ms) ? 0 : ms;
}

/**
 * **MES STORIES ACTIVES, LES PLUS RÉCENTES D'ABORD** — le corpus du plateau
 * (`?scope=stories`, `loadStoryTray`) garde mes stories EXPIRÉES pendant sa
 * fenêtre d'archive (`PostFeedService.ts:283-312`, `AUTHOR_ARCHIVE_WINDOW_MS`) :
 * sans ce filtre, le listing montrerait une story MORTE à côté des vivantes.
 * `isStoryExpired` (`lib/stories/playback.ts`) est le SITE UNIQUE de cette
 * question — `expiresAt` explicite prime, sinon `createdAt + 20h`.
 *
 * `now` est TOUJOURS injecté par l'appelant (même discipline que
 * `relative-time.ts`, `lens/law.ts`) : cette loi reste pure, éprouvable sans
 * horloge système.
 */
export function myActiveStories(options: {
  readonly stories: readonly StoryTrayPost[];
  readonly viewerId: string | undefined;
  readonly now: number;
}): readonly StoryTrayPost[] {
  const { stories, viewerId, now } = options;
  if (viewerId === undefined || viewerId === '') return [];
  return stories
    .filter((story) => story.author?.id === viewerId && !isStoryExpired(story, now))
    .sort((a, b) => timeOf(b.createdAt) - timeOf(a.createdAt));
}

/**
 * **LA VIGNETTE D'UNE CARTE** — miroir `MyStoryThumbnailResolver.swift:14-23`
 * (`composite(thumbHash)` → `remoteURL` → `placeholder`). La projection
 * `tray` sert `media[].thumbHash` (`StoryTrayMedia`, jamais
 * `storyEffects.thumbHash`, qui n'existe pas sur cette projection) : l'aplat
 * ThumbHash reste sous l'image distante, jamais à sa place — un décodage
 * illisible ne prive donc que de l'aplat, jamais de la photo.
 */
export type MyStoryThumbnail =
  | { readonly kind: 'photo'; readonly url: string; readonly placeholder: string | undefined }
  | { readonly kind: 'placeholder' };

export function myStoryThumbnail(media: readonly StoryTrayMedia[] | undefined): MyStoryThumbnail {
  const first = media?.[0];
  if (first === undefined) return { kind: 'placeholder' };
  const fromThumbnail = typeof first.thumbnailUrl === 'string' && first.thumbnailUrl !== '' ? first.thumbnailUrl : undefined;
  const url = fromThumbnail ?? storyMediaUrl(first);
  if (url === '') return { kind: 'placeholder' };
  return { kind: 'photo', url, placeholder: thumbHashPlaceholder(first.thumbHash ?? undefined) };
}

/** Un mois CALENDAIRE avant `now` — jamais 30 jours fixes (un mois de 31
 * jours ne serait pas encore franchi). Miroir du seuil calendaire d'iOS
 * (`MyStoryCardPresentation.swift:126-154`, `RelativeDateTimeFormatter` sous
 * un mois, date `.medium` au-delà). */
function oneMonthBefore(date: Date): Date {
  const d = new Date(date.getTime());
  d.setMonth(d.getMonth() - 1);
  return d;
}

/**
 * **LA DATE RELATIVE, LOCALISÉE** — `Intl.RelativeTimeFormat` porte le mot
 * (« il y a 2 jours » / « 2 days ago »), jamais la prose française fixe de
 * `relative-time.ts` (§ cette page, écrite pour le chrome du fil, qui n'a pas
 * encore de catalogue). `language` est l'un des sept codes d'interface
 * (`SUPPORTED_INTERFACE_LANGUAGES`), directement une balise BCP-47 valide.
 *
 * `numeric: 'always'` — jamais `'auto'` : ce dernier rendrait « avant-hier »
 * pour -2 jours, une prose qu'aucune capture de référence ne montre. iOS
 * (`RelativeDateTimeFormatter`, réglage par défaut) rend toujours un compte,
 * « il y a 2 jours » — c'est la forme que ce libellé reprend.
 */
function relativeLabel(target: Date, now: Date, language: InterfaceLanguage): string {
  const diffSeconds = (target.getTime() - now.getTime()) / 1000;
  const rtf = new Intl.RelativeTimeFormat(language, { numeric: 'always' });
  const abs = Math.abs(diffSeconds);
  if (abs < 60) return rtf.format(Math.round(diffSeconds), 'second');
  if (abs < 3600) return rtf.format(Math.round(diffSeconds / 60), 'minute');
  if (abs < 86400) return rtf.format(Math.round(diffSeconds / 3600), 'hour');
  return rtf.format(Math.round(diffSeconds / 86400), 'day');
}

/**
 * **LE LIBELLÉ DE DATE D'UNE CARTE** — relatif sous un mois calendaire, date
 * ABSOLUE (`dateStyle: 'medium'`, localisée) au-delà. Miroir exact du
 * dispositif iOS (`MyStoryCardPresentation.swift:126-154`).
 */
export function myStoryDateLabel(target: Date, now: Date, language: InterfaceLanguage): string {
  const cutoff = oneMonthBefore(now);
  if (target.getTime() < cutoff.getTime()) {
    return new Intl.DateTimeFormat(language, { dateStyle: 'medium' }).format(target);
  }
  return relativeLabel(target, now, language);
}
