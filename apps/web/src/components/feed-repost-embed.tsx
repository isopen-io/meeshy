import type { FeedCardRepostEmbed } from '@/lib/feed/card-model';
import { Avatar } from './avatar';
import { translate } from '@/lib/i18n-catalog';
import { currentInterfaceLanguage } from '@/lib/interface-language';
import { Link } from '@/routes/route-table';

/**
 * `FeedRepostEmbed` (#6278 c) — LA CARTE CITÉE d'un repost SIMPLE, miroir
 * `FeedPostCard.swift:822-910` (`repostView`) : auteur, corps déjà résolu par
 * le Prisme (`FeedCardRepostEmbed.text`, D-14), une vignette de son premier
 * média, son compte de « j'aime » — et RIEN d'autre : iOS n'affiche que ce
 * seul compteur sur la carte imbriquée, jamais les quatre autres.
 *
 * **CLIQUABLE VERS L'ORIGINAL** (`repost.id`) — `onTapRepost` ouvre la
 * publication SOURCE côté iOS ; ici, un `<Link>` classique vers `/post/$post`,
 * SANS `id` la carte reste un encart NON cliquable (un repost dont l'original
 * a été supprimé garde sa trace, comme iOS `RepostContent` optionnel).
 *
 * **REMPLACE LA LIGNE « ↻ @handle »** (`FeedPostHeader`, #6484) : cette ligne
 * ne disait RIEN du contenu cité — un repost affichait sa propre carte VIDE
 * (aucun texte, aucun média propres à un repost simple) surmontée d'un handle
 * en petit texte. `repostOfHandle` reste au modèle pour l'ANNONCE d'écran
 * (« republication de @x », plus riche à dire qu'à lire) mais ne peint plus
 * rien seul.
 */
export function FeedRepostEmbed({ repost }: { readonly repost: FeedCardRepostEmbed }) {
  const language = currentInterfaceLanguage();
  const chipLabel = repost.isStory
    ? translate(language, 'feed.post.repost.embed.story')
    : repost.isReel
      ? translate(language, 'feed.post.reel.chip')
      : undefined;

  const body = (
    <div
      className="flex flex-col gap-2 rounded-2xl px-3 py-2.5"
      style={{ border: '1px solid var(--color-edge)', backgroundColor: 'rgba(120,120,128,0.08)' }}
      data-feed-repost-embed
    >
      <div className="flex items-center gap-2">
        <Avatar
          initials={repost.author.initials}
          color={repost.author.accentColor}
          size={24}
          name={repost.author.name}
          {...(repost.author.avatarSrc !== undefined ? { src: repost.author.avatarSrc } : {})}
        />
        <span className="truncate text-check font-semibold" style={{ color: 'var(--color-ios-ink)' }}>
          {repost.author.name}
        </span>
        <span className="shrink-0 text-check" style={{ color: 'var(--color-ios-ink-3)' }}>
          {repost.relativeTime}
        </span>
        {chipLabel !== undefined ? (
          <span
            data-feed-repost-embed-chip
            className="ml-auto shrink-0 rounded-chip px-1.5 py-0.5 text-check font-semibold"
            style={{ backgroundColor: 'var(--color-ios-surface)', color: 'var(--color-ios-ink-2)' }}
          >
            {chipLabel}
          </span>
        ) : null}
      </div>
      {repost.text !== undefined ? (
        <p
          className="text-check"
          style={{ color: 'var(--color-ios-ink-2)', display: '-webkit-box', WebkitLineClamp: 4, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}
          {...(repost.text.language !== '' ? { lang: repost.text.language } : {})}
        >
          {repost.moodEmoji !== undefined ? <span aria-hidden="true">{repost.moodEmoji} </span> : null}
          {repost.text.full}
        </p>
      ) : null}
      {repost.thumbnailSrc !== undefined ? (
        <img
          src={repost.thumbnailSrc}
          alt=""
          className="h-40 w-full object-cover"
          style={{ borderRadius: 10 }}
          data-feed-repost-embed-thumbnail
        />
      ) : null}
      <span className="text-check" style={{ color: 'var(--color-ios-ink-3)' }}>
        {translate(language, 'feed.post.action.like')} {repost.likeCount}
      </span>
    </div>
  );

  if (repost.id === undefined) return body;

  return (
    <Link
      to="post"
      params={{ post: repost.id }}
      aria-label={translate(language, 'feed.post.open', { author: repost.author.name })}
      draggable={false}
      data-feed-repost-embed-open
      className="block focus-visible:outline-2 focus-visible:outline-offset-2"
      style={{ borderRadius: 16, outlineColor: 'var(--color-ios-brand)' }}
    >
      {body}
    </Link>
  );
}
