import { useState } from 'react';

import { Glyph, GlyphSvg } from './glyph';
import { FEED_GLYPHS } from './glyphs-feed';
import type { FeedCardMedia } from '@/lib/feed/card-model';
import { translate } from '@/lib/i18n-catalog';
import { currentInterfaceLanguage } from '@/lib/interface-language';

/**
 * LA SURFACE D'UN MÉDIA — image (ThumbHash peint AVANT toute requête, puis
 * `loading="lazy"`), vidéo ou son. Remplit son parent (`absolute inset-0`) :
 * la page d'un carrousel, l'affiche d'un réel ou la tuile d'une mosaïque
 * (#6514) — trois hôtes, UNE surface.
 *
 * `playable` — LA SURFACE LIT, OU ELLE AFFICHE (#6800). Les deux usages sont
 * RÉELLEMENT distincts, et les confondre casse l'un des deux :
 *
 * - un POST vidéo/audio se lit DANS le fil : sans élément média, le glyphe
 *   `fillPlay` est un contrôle sans effet (loi 4) — il AFFIRME une capacité
 *   qu'il n'a pas, la forme la plus trompeuse ;
 * - l'affiche d'un RÉEL ne lit PAS : toucher la carte ouvre le lecteur des
 *   Réels plein écran (`ReelFeedCard.onTapMedia` ⇒ `ReelsPresenter`, #6457),
 *   qui possède la lecture. Y monter un `<video>` ferait décoder deux fois la
 *   même piste pour une vignette qu'on quitte au premier tap. C'est la
 *   décision que garde `feed-post-card.test.tsx` § « le RÉEL, affiche
 *   immobile plein cadre ».
 *
 * Le défaut est donc `false` : une surface ne lit que si son hôte le DEMANDE.
 */
export function FeedMediaSurface({ media, playable = false }: { readonly media: FeedCardMedia; readonly playable?: boolean }) {
  const [loaded, setLoaded] = useState(false);

  if (playable && media.kind === 'video') {
    const language = currentInterfaceLanguage();
    const poster = media.thumbnailSrc ?? media.placeholder;
    return (
      <div className="absolute inset-0" style={{ backgroundColor: 'var(--color-ios-card)' }}>
        {/* `key={media.src}` (même dispositif que `VideoTile`, #6221) — une
            source qui change REMONTE l'élément, jamais une réutilisation
            silencieuse d'un `<video>` déjà lié à une autre piste.
            `preload="none"` : une page de fil porte plusieurs vidéos, aucune
            n'ouvre de connexion avant que le lecteur ne la demande.
            L'AFFICHE devient le `poster` — ce que le navigateur peint avant la
            première image décodée, là où le `background-image` CSS
            disparaissait dès que l'élément prenait le cadre. */}
        <video
          key={media.src}
          src={media.src}
          {...(poster !== undefined ? { poster } : {})}
          preload="none"
          playsInline
          className="absolute inset-0 size-full object-cover"
        />
        <div className="pointer-events-none absolute inset-0 grid place-items-center">
          <Glyph name="fillPlay" size={44} style={{ color: 'rgba(255,255,255,0.85)' }} title={translate(language, 'feed.post.media.video')} />
        </div>
      </div>
    );
  }

  if (playable && media.kind === 'audio') {
    const language = currentInterfaceLanguage();
    return (
      <div className="absolute inset-0 grid place-items-center" style={{ backgroundColor: 'var(--color-ios-card)' }}>
        {/* `preload="none"` — une page de fil peut porter plusieurs sons ;
            aucun n'ouvre de connexion avant que le lecteur ne le demande. */}
        <audio key={media.src} src={media.src} preload="none" className="sr-only" />
        <GlyphSvg
          glyph={FEED_GLYPHS.waveform}
          size={72}
          style={{ color: 'rgba(255,255,255,0.55)' }}
          title={translate(language, 'feed.post.media.audio')}
        />
      </div>
    );
  }

  if (media.kind === 'video' || media.kind === 'audio') {
    const language = currentInterfaceLanguage();
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
          <Glyph name="fillPlay" size={44} style={{ color: 'rgba(255,255,255,0.85)' }} title={translate(language, 'feed.post.media.video')} />
        ) : (
          <GlyphSvg
            glyph={FEED_GLYPHS.waveform}
            size={72}
            style={{ color: 'rgba(255,255,255,0.55)' }}
            title={translate(language, 'feed.post.media.audio')}
          />
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
