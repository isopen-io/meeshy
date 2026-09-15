import { useState } from 'react';

import { Glyph, GlyphSvg } from './glyph';
import { FEED_GLYPHS } from './glyphs-feed';
import type { FeedCardMedia } from '@/lib/feed/card-model';
import { translate } from '@/lib/i18n-catalog';
import { currentInterfaceLanguage } from '@/lib/interface-language';

/**
 * LA SURFACE D'UN MÉDIA — image (ThumbHash peint AVANT toute requête, puis
 * `loading="lazy"`) ou repli plein cadre pour vidéo (`fillPlay`) / audio
 * (`waveform`), dont la LECTURE reste hors tranche (D-42, § 1.5 de la
 * spécification). Remplit son parent (`absolute inset-0`) : la page d'un
 * carrousel, l'affiche d'un réel ou la tuile d'une mosaïque (#6514) — trois
 * hôtes, UNE surface.
 */
export function FeedMediaSurface({ media }: { readonly media: FeedCardMedia }) {
  const [loaded, setLoaded] = useState(false);

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
