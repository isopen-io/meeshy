import { useState } from 'react';

import { Avatar } from './avatar';
import { Glyph, GlyphSvg } from './glyph';
import { FEED_GLYPHS } from './glyphs-feed';
import type { FeedCardMedia, FeedCardModel, FeedCardStats, FeedCardText } from '@/lib/feed/card-model';
import { FEED_TEXT_TRUNCATION_LIMIT, truncateWords } from '@/lib/feed/text';

/**
 * `FeedPostCard` (#5893) — la carte de publication du fil, DEUX FORMES,
 * miroir § 1.2 de la spécification : `FeedPostCard.swift` (le POST — en-tête
 * AU-DESSUS du média) et `ReelFeedCard.swift` (le RÉEL — plein cadre,
 * identité et actions POSÉES SUR le média, scrim bas). `model.isReel` est le
 * SEUL aiguillage — `resolveFeedCardModel` (`lib/feed/card-model.ts`) a déjà
 * tranché tout le reste (Prisme, accent, géométrie).
 *
 * LECTURE SEULE (D-6, ce lot) : les cinq statistiques sont des `<span>`
 * STATIQUES, jamais des boutons — aimer/commenter/repartager/enregistrer/
 * partager sont des compagnons. Le SEUL geste vivant est la pagination d'un
 * carrousel, qui EXPLORE un contenu déjà reçu plutôt que d'écrire quoi que
 * ce soit.
 */

const STAT_ITEMS: readonly { readonly key: keyof FeedCardStats; readonly glyph: keyof typeof FEED_GLYPHS; readonly label: string }[] = [
  { key: 'likeCount', glyph: 'heart', label: 'Aimer' },
  { key: 'commentCount', glyph: 'chatCircle', label: 'Commenter' },
  { key: 'repostCount', glyph: 'arrowsClockwise', label: 'Repartager' },
  { key: 'bookmarkCount', glyph: 'bookmark', label: 'Enregistrer' },
  { key: 'shareCount', glyph: 'shareNetwork', label: 'Partager' },
];

/**
 * La rangée des cinq statistiques — `tone` bascule l'encre entre la carte
 * (POST, en-dessous du média) et le scrim d'un RÉEL (blanc, sur le média).
 *
 * LE NOM ACCESSIBLE VIT SUR LE GLYPHE, PAS SUR L'ENVELOPPE (revue-correction
 * #5893) : un `aria-label` posé sur un `<span>` NU n'est jamais exposé — un
 * élément de rôle `generic` n'admet pas de nom accessible (ARIA 1.2, § name
 * from author prohibited). La première forme nommait l'enveloppe et masquait
 * le compte (`aria-hidden`) : les cinq chiffres étaient donc INAUDIBLES, la
 * rangée entière absente de l'arbre. `GlyphSvg` porte déjà le contrat
 * (`title` ⇒ `role="img" aria-label`), et le compte redevient du TEXTE lu —
 * « Aimer 14 », comme iOS l'énonce (`feed.post.a11y.like`).
 */
function FeedActionsRow({ stats, tone }: { readonly stats: FeedCardStats; readonly tone: 'onLight' | 'onDark' }) {
  const ink = tone === 'onDark' ? 'rgba(255,255,255,0.92)' : 'var(--color-ios-ink-2)';
  return (
    <div className="flex items-center justify-between" data-feed-actions>
      {STAT_ITEMS.map((item) => (
        <span key={item.key} className="flex items-center gap-1.5" style={{ color: ink, minHeight: 44 }}>
          <GlyphSvg glyph={FEED_GLYPHS[item.glyph]} size={19} title={item.label} />
          <span className="text-check font-medium">{stats[item.key]}</span>
        </span>
      ))}
    </div>
  );
}

/**
 * LA SURFACE D'UN MÉDIA — image (ThumbHash peint AVANT toute requête, puis
 * `loading="lazy"`) ou repli plein cadre pour vidéo (`fillPlay`) / audio
 * (`waveform`), dont la LECTURE reste hors tranche (D-42, § 1.5 de la
 * spécification).
 */
function FeedMediaSurface({ media }: { readonly media: FeedCardMedia }) {
  const [loaded, setLoaded] = useState(false);

  if (media.kind === 'video' || media.kind === 'audio') {
    const poster = media.thumbnailSrc ?? media.placeholder;
    return (
      <div
        className="absolute inset-0 grid place-items-center"
        style={{
          backgroundColor: 'var(--color-ios-card)',
          /**
           * `url("...")`, GUILLEMETÉ (défaut bloquant relevé à la capture,
           * #5893) — un `data:image/svg+xml` peut contenir un `)` NON
           * échappé : `encodeURIComponent` échappe `#` mais PAS `(`/`)`
           * (MDN), et le SVG des fixtures référence son dégradé par
           * `fill="url(#g)"`. Sans guillemets, le PREMIER `)` rencontré —
           * celui de cette référence interne, pas la fin de l'URI — clôt le
           * `url()` CSS prématurément ; le navigateur rejette alors la
           * valeur ENTIÈRE en silence (`backgroundImage` retombe à `none`,
           * aucune erreur console) et le repli plein cadre restait BLANC.
           * Guillemeter est la forme CSS qui admet `)` sans ambiguïté,
           * quelle que soit la source de l'URL.
           */
          ...(poster !== undefined ? { backgroundImage: `url("${poster}")`, backgroundSize: 'cover', backgroundPosition: 'center' } : {}),
        }}
      >
        {media.kind === 'video' ? (
          <Glyph name="fillPlay" size={44} style={{ color: 'rgba(255,255,255,0.85)' }} title="Vidéo" />
        ) : (
          <GlyphSvg glyph={FEED_GLYPHS.waveform} size={72} style={{ color: 'rgba(255,255,255,0.55)' }} title="Audio" />
        )}
      </div>
    );
  }

  return (
    <>
      {media.placeholder !== undefined ? (
        <img src={media.placeholder} alt="" aria-hidden="true" className="absolute inset-0 size-full object-cover" />
      ) : null}
      <img
        src={media.src}
        /* `PostMedia.alt` SERVI, jamais la légende (déjà rendue en texte
           visible sous le média) : la répéter la ferait lire deux fois.
           Sans texte d'accessibilité, l'image est DÉCORATIVE (`alt=""`) —
           c'est la forme juste quand rien n'en décrit le contenu. */
        alt={media.altText ?? ''}
        loading="lazy"
        onLoad={() => setLoaded(true)}
        className="absolute inset-0 size-full object-cover transition-opacity duration-300"
        style={{ opacity: media.placeholder === undefined || loaded ? 1 : 0 }}
      />
    </>
  );
}

/**
 * LE CARROUSEL — vue 3f de la planche : « un lot de médias se PARCOURT, il
 * ne se contemple pas ». L'index de page vit ICI (`useState`), jamais dans
 * `FeedPostCard`, pour ne pas invalider toute la carte à chaque page
 * (`FeedPostCardCarousel.swift:20-25`).
 */
function FeedMediaCarousel({ media }: { readonly media: readonly FeedCardMedia[] }) {
  const [page, setPage] = useState(0);
  const clamped = Math.min(page, media.length - 1);
  const current = media[clamped];
  if (current === undefined) return null;

  return (
    <div className="relative overflow-hidden" style={{ borderRadius: 12, aspectRatio: `1 / ${current.ratio}` }} data-feed-media>
      <FeedMediaSurface media={current} />
      {current.caption !== undefined ? (
        <p
          className="absolute inset-x-0 bottom-0 px-3 py-2 text-check text-white"
          style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.6), transparent)' }}
        >
          {current.caption}
        </p>
      ) : null}
      {media.length > 1 ? (
        <>
          <span
            data-feed-media-counter
            className="absolute top-2 right-2 rounded-chip px-2 py-0.5 text-check font-semibold text-white"
            style={{ backgroundColor: 'rgba(0,0,0,0.55)' }}
          >
            {clamped + 1} / {media.length}
          </span>
          {clamped > 0 ? (
            <button
              type="button"
              aria-label="Média précédent"
              onClick={() => setPage(clamped - 1)}
              className="absolute inset-y-0 left-0 grid place-items-center"
              style={{ width: 44 }}
            >
              <Glyph name="caretLeft" size={18} style={{ color: 'white' }} />
            </button>
          ) : null}
          {clamped < media.length - 1 ? (
            <button
              type="button"
              aria-label="Média suivant"
              onClick={() => setPage(clamped + 1)}
              className="absolute inset-y-0 right-0 grid place-items-center"
              style={{ width: 44 }}
            >
              <GlyphSvg glyph={FEED_GLYPHS.caretRight} size={18} style={{ color: 'white' }} />
            </button>
          ) : null}
          <div className="absolute inset-x-0 bottom-2 flex items-center justify-center gap-1" aria-hidden="true">
            {media.map((m, i) => (
              <span
                key={m.id}
                className="rounded-full"
                style={{ width: 5, height: 5, backgroundColor: i === clamped ? 'white' : 'rgba(255,255,255,0.5)' }}
              />
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}

function FeedPostHeader({ model }: { readonly model: FeedCardModel }) {
  return (
    <div className="flex items-center gap-2.5 px-3 pt-3">
      <Avatar initials={model.author.initials} color={model.author.accentColor} size={40} name={model.author.name} {...(model.author.avatarSrc !== undefined ? { src: model.author.avatarSrc } : {})} />
      <div className="flex min-w-0 flex-col">
        {/* L'HEURE QUALIFIE L'AUTEUR — même ligne, miroir
            `FeedPostCard+Header.swift:51-60`. */}
        <div className="flex items-baseline gap-1.5">
          <span className="truncate text-body font-semibold" style={{ color: 'var(--color-ios-ink)' }}>
            {model.author.name}
          </span>
          <span className="shrink-0 text-check" style={{ color: 'var(--color-ios-ink-3)' }}>
            {model.relativeTime}
          </span>
        </div>
        {model.repostOfHandle !== undefined ? (
          <span className="text-check" style={{ color: 'var(--color-ios-ink-3)' }}>
            ↻ @{model.repostOfHandle}
          </span>
        ) : null}
      </div>
    </div>
  );
}

/** Le texte d'un POST — tronqué à 20 mots avec « voir plus »/« voir moins »
 * (`truncateWords`, `lib/feed/text.ts`) ; `lang` porte la langue SERVIE. */
function FeedPostText({ text }: { readonly text: FeedCardText }) {
  const [expanded, setExpanded] = useState(false);
  const truncated = truncateWords(text.full, FEED_TEXT_TRUNCATION_LIMIT);
  const shown = !truncated.truncated || expanded ? text.full : truncated.text;

  return (
    <div className="px-3">
      <p
        className="whitespace-pre-wrap text-bubble"
        {...(text.language !== '' ? { lang: text.language } : {})}
        style={{ color: 'var(--color-ios-ink)' }}
      >
        {shown}
      </p>
      {truncated.truncated ? (
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          /* CIBLE 44 (charte du chantier, et convention de TOUT le dépôt —
             `attachment-blocks.tsx:264` pose le même 44 sur une bascule de
             texte en ligne). La première forme reprenait les 24 pt d'iOS,
             qui n'a pas la même loi de cible : 24 px est le PLANCHER de
             WCAG 2.5.8, pas la règle d'ici (revue-correction #5893). */
          className="pb-1.5 text-left text-check font-semibold"
          style={{ color: 'var(--color-ios-brand)', minHeight: 44 }}
        >
          {expanded ? 'voir moins' : 'voir plus'}
        </button>
      ) : null}
    </div>
  );
}

/** Le RÉEL — plein cadre, identité et actions SUR le média, scrim bas (miroir
 * `ReelFeedCard.swift`). Rendu en AFFICHE IMMOBILE : la lecture reste hors
 * tranche (D-42), le média est son propre repli (poster/placeholder). */
function FeedReelCard({ model }: { readonly model: FeedCardModel }) {
  const poster = model.media[0];
  const ratio = poster?.ratio ?? 1.25;

  return (
    <div
      role="group"
      aria-label={`Réel de ${model.author.name}`}
      className="relative overflow-hidden"
      style={{ borderRadius: 18, aspectRatio: `1 / ${ratio}` }}
      data-feed-card="reel"
    >
      {poster !== undefined ? (
        <FeedMediaSurface media={poster} />
      ) : (
        <div className="absolute inset-0" style={{ backgroundColor: 'var(--color-ios-card)' }} />
      )}
      <div className="absolute inset-0" style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.6), transparent 55%)' }} aria-hidden="true" />
      {/* LA PUCE « RÉEL » (§ 1.5 de la spécification, manquante à la première
          forme) — la carte est rendue en AFFICHE IMMOBILE, et un réel dont la
          pièce de tête est une IMAGE (la moitié du corpus de recette de
          staging) ne se distingue alors d'un post par RIEN d'autre que son
          cadrage. La puce nomme le médium tant que la lecture reste hors
          tranche (D-42). */}
      <span
        data-feed-reel-chip
        className="absolute top-3 left-3 rounded-chip px-2 py-0.5 text-check font-semibold text-white"
        style={{ backgroundColor: 'rgba(0,0,0,0.55)' }}
      >
        Réel
      </span>
      <div className="absolute inset-x-0 bottom-0 flex flex-col gap-2 p-3">
        <div className="flex items-center gap-2">
          <Avatar initials={model.author.initials} color={model.author.accentColor} size={34} {...(model.author.avatarSrc !== undefined ? { src: model.author.avatarSrc } : {})} />
          <span className="text-body font-semibold text-white">{model.author.name}</span>
        </div>
        {model.text !== undefined ? (
          <p
            className="text-check text-white/90"
            {...(model.text.language !== '' ? { lang: model.text.language } : {})}
            style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}
          >
            {model.text.full}
          </p>
        ) : null}
        <FeedActionsRow stats={model.stats} tone="onDark" />
      </div>
    </div>
  );
}

export function FeedPostCard({ model }: { readonly model: FeedCardModel }) {
  if (model.isReel) return <FeedReelCard model={model} />;

  return (
    <article
      className="flex flex-col gap-2 pb-3"
      style={{ backgroundColor: 'var(--color-ios-card)', borderRadius: 18, border: '0.5px solid var(--color-edge)' }}
      data-feed-card="post"
    >
      <FeedPostHeader model={model} />
      {model.text !== undefined ? <FeedPostText text={model.text} /> : null}
      {model.media.length > 0 ? (
        <div className="px-3">
          <FeedMediaCarousel media={model.media} />
        </div>
      ) : null}
      <div className="px-3">
        <FeedActionsRow stats={model.stats} tone="onLight" />
      </div>
    </article>
  );
}
