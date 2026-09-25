import type { FeedCardRepostEmbed } from '@/lib/feed/card-model';
import { Avatar } from './avatar';
import { GlyphSvg } from './glyph';
import { FEED_GLYPHS } from './glyphs-feed';
import { PrismPastille } from './message-blocks';
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
 * en petit texte. `repostOfHandle` a été RETIRÉ du modèle (#6278 c, Q3) :
 * `repost.author` porte désormais tout ce que l'ancien champ portait, et cette
 * carte l'affiche pour de bon plutôt que de le réserver à une annonce.
 *
 * **SON NOM ACCESSIBLE EST DISTINCT DE LA PORTE EXTÉRIEURE** (#6278 c, G8) —
 * `feed.post.original.open` (« Publication originale de X »), jamais
 * `feed.post.open` (« Ouvrir la publication de X ») que la carte englobante
 * porte déjà : les deux mènent à des adresses DIFFÉRENTES depuis deux cartes
 * IMBRIQUÉES, et un lecteur d'écran qui les annoncerait pareil ne saurait pas
 * laquelle est laquelle — miroir `FeedPostCard.swift:905-906`.
 *
 * **LE CORPS CITÉ PORTE SA PROPRE PASTILLE DE PRISME** (#6278 c, G6, D-99) —
 * une surface de contenu SANS elle est un défaut : le corps de la carte
 * EXTÉRIEURE en porte une (`FeedPostText`), et le contenu cité, résolu par le
 * MÊME Prisme (`resolveFeedText`, D-14), n'a pas moins besoin d'annoncer sa
 * traduction. Sans `onToggle` (l'exploration de l'original reste HORS
 * tranche ici, #7463) : un indicateur SEUL, jamais un bouton qui promettrait
 * un geste que cette carte n'offre pas encore.
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
      className="flex flex-col gap-2 px-3 py-2.5"
      style={{
        border: `1px solid color-mix(in srgb, ${repost.author.accentColor} 20%, transparent)`,
        backgroundColor: 'var(--ios-repost-embed-fill)',
        borderRadius: 'var(--ios-radius-repost-embed)',
      }}
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
        <div className="flex items-start gap-1">
          <p
            className="min-w-0 flex-1 text-check"
            style={{ color: 'var(--color-ios-ink-2)', display: '-webkit-box', WebkitLineClamp: 4, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}
            {...(repost.text.language !== '' ? { lang: repost.text.language } : {})}
          >
            {repost.moodEmoji !== undefined ? <span aria-hidden="true">{repost.moodEmoji} </span> : null}
            {repost.text.full}
          </p>
          <PrismPastille
            servedLanguage={repost.text.language}
            originalLanguage={repost.text.originalLanguage}
            active={null}
            language={language}
            subject="post"
          />
        </div>
      ) : null}
      {/* La vignette est DÉCORATIVE (`repostMediaPreview`, `.accessibilityHidden(true)`,
          `FeedPostCard+Media.swift:77-95`) : la porte annonce déjà l'original.
          « +N » : capsule noire à 60 %, décalée de 8 — mêmes valeurs qu'iOS. */}
      {repost.thumbnailSrc !== undefined ? (
        <div className="relative" aria-hidden="true">
          <img
            src={repost.thumbnailSrc}
            alt=""
            className="h-40 w-full object-cover"
            style={{ borderRadius: 10 }}
            data-feed-repost-embed-thumbnail
          />
          {repost.moreCount !== undefined ? (
            <span
              data-feed-repost-embed-more
              className="absolute bottom-2 right-2 rounded-full px-2 py-0.5 text-check font-bold text-white"
              style={{ backgroundColor: 'rgba(0,0,0,0.6)' }}
            >
              +{repost.moreCount}
            </span>
          ) : null}
        </div>
      ) : null}
      {/* UN CŒUR ET UN CHIFFRE (`FeedPostCard.swift:878-889`, `heart.fill`) —
          jamais le verbe « Aimer » peint en toutes lettres, qui se lirait comme
          un bouton que cette carte n'offre pas. Le nom accessible du glyphe
          reste celui de la rangée d'actions : « Aimer 24 ». */}
      <span
        data-feed-repost-embed-likes
        className="flex items-center gap-1 text-check font-medium"
        style={{ color: 'var(--color-ios-ink-3)' }}
      >
        <GlyphSvg glyph={FEED_GLYPHS.heartFill} size={12} title={translate(language, 'feed.post.action.like')} />
        {repost.likeCount}
      </span>
    </div>
  );

  if (repost.id === undefined) return body;

  return (
    <Link
      to="post"
      params={{ post: repost.id }}
      aria-label={translate(language, 'feed.post.original.open', { author: repost.author.name })}
      draggable={false}
      data-feed-repost-embed-open
      className="block focus-visible:outline-2 focus-visible:outline-offset-2"
      style={{ borderRadius: 'var(--ios-radius-repost-embed)', outlineColor: 'var(--color-ios-brand)' }}
    >
      {body}
    </Link>
  );
}
