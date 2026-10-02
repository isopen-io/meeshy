import { lazy, Suspense, useMemo, useState, type ReactNode } from 'react';

import type { Message } from '@/lib/api/types';
import { translate } from '@/lib/i18n-catalog';
import { currentInterfaceLanguage } from '@/lib/interface-language';
import { QUOTED_CARD_WIDTH } from '@/lib/reading-mode/metrics';
import type { QuotedMedia } from '@/lib/view/quoted-preview';
import type { QuotedAudio } from '@/lib/view/quoted-audio';
import { attachmentSrc } from '@/lib/api/media-url';
import { waveformOf } from '@/lib/view/message';
import { useMediaPlayback } from '@/lib/view/use-media-playback';

import { Glyph, GlyphSvg } from './glyph';
import { MEDIA_GLYPHS } from './glyphs-media';

const QuoteMediaViewer = lazy(() => import('./quote-media-viewer'));

/**
 * LA PREMIÈRE IMAGE D'UNE VIDÉO CITÉE SANS VIGNETTE SERVEUR (#8233, miroir
 * `QuotedVideoPoster` iOS) — un `<video>` MUET qui ne charge que ses
 * métadonnées, jamais le fichier entier : le navigateur peint l'image au
 * fragment `#t=0.1` (la toute première est souvent noire). Le flou ThumbHash,
 * posé par l'hôte en fond, tient la case pendant ce temps. Décoratif : la
 * zone qui le porte a déjà son nom.
 */
export function QuoteVideoStill({ src }: { readonly src: string }) {
  return (
    <video
      data-quote-still
      src={`${src}#t=0.1`}
      preload="metadata"
      muted
      playsInline
      tabIndex={-1}
      aria-hidden
      className="pointer-events-none absolute inset-0 size-full object-cover"
    />
  );
}

/**
 * LA ZONE MÉDIA D'UNE CITATION (#8233) — un bouton À CÔTÉ du bouton « aller au
 * message », jamais dedans (un bouton dans un bouton n'est ni valide ni
 * atteignable). Son seul effet : ouvrir la pièce citée en plein écran — la
 * visionneuse du fil quand l'hôte la prête (`ThreadMediaContext`), sinon la
 * visionneuse seule sur cette pièce. La pièce vient des FAITS de la citation
 * (`QuotedMedia.openable`) : elle s'ouvre même quand le message cité est hors
 * de la fenêtre chargée.
 */
export function QuoteOpenZone({
  media,
  quote,
  languages,
  className,
  style,
  children,
}: {
  readonly media: QuotedMedia;
  readonly quote: Message;
  readonly languages: readonly string[];
  readonly className: string;
  readonly style?: Readonly<Record<string, string | number>>;
  readonly children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const attachment = media.openable;
  if (attachment === null) {
    return (
      <span className={className} style={style} aria-hidden>
        {children}
      </span>
    );
  }
  return (
    <>
      <button
        type="button"
        data-quote-open={media.kind}
        aria-label={translate(currentInterfaceLanguage(), 'media.viewer.open_fullscreen')}
        onClick={() => setOpen(true)}
        className={className}
        style={style}
      >
        {children}
      </button>
      {open ? (
        <Suspense fallback={null}>
          <QuoteMediaViewer quote={quote} attachment={attachment} languages={languages} onClose={() => setOpen(false)} />
        </Suspense>
      ) : null}
    </>
  );
}

const WAVE_BARS = 16;

/** La cible de lecture (dimension 5, « cibles >= 44 px »). */
const QUOTE_AUDIO_TARGET_PX = 44;

/**
 * L'APERÇU COMPACT D'UN VOCAL CITÉ (#8233, miroir `QuotedAudioPreview` iOS) —
 * une capsule : lecture, onde (déterministe par pièce, `waveformOf`, la même
 * que la bulle du vocal), durée. Le web n'a pas de lecteur audio plein
 * écran : la capsule LIT le vocal depuis la citation, sur le coordinateur
 * partagé (un seul média joue à la fois).
 *
 * #8320 (directive porteur du 2026-09-27) — la zone lecture joue SUR PLACE,
 * un second toucher met en pause, et elle n'ouvre rien : le reste de la
 * citation saute au message. Ce que #8320 y ajoute :
 *  - la PISTE est celle que le Prisme audio élit pour le vocal d'origine
 *    (`track`, `quotedAudioOf`), jamais l'original en dur ;
 *  - l'onde se REMPLIT à mesure que la lecture avance ;
 *  - l'identifiant porte le message CITANT : deux réponses qui citent le même
 *    vocal sont deux lecteurs, et un `claim` du même id serait un no-op — les
 *    deux joueraient ensemble ;
 *  - la cible fait 44 px de haut, et son nom dit l'action : « Écouter le
 *    message cité » / « Mettre en pause le message cité ».
 */
export function QuoteAudioPreview({
  media,
  track,
  citingId,
  isMine,
}: {
  readonly media: QuotedMedia & { readonly openable: NonNullable<QuotedMedia['openable']> };
  readonly track: QuotedAudio;
  readonly citingId: string;
  readonly isMine: boolean;
}) {
  const attachment = media.openable;
  const { status, progress, toggle, bind } = useMediaPlayback({ attachmentId: `quote:${citingId}:${attachment.id}` });
  const waves = useMemo(() => waveformOf(attachment, WAVE_BARS), [attachment]);
  const isPlaying = status === 'playing';
  const language = currentInterfaceLanguage();
  const ink = isMine ? 'var(--color-ios-on-brand)' : 'var(--accent)';

  return (
    <span className="mt-1.5 block">
      <audio
        key={track.url}
        data-quote-audio
        data-quote-audio-track={track.language}
        ref={bind}
        preload="none"
        src={attachmentSrc(track.url)}
        className="hidden"
      />
      <button
        type="button"
        data-quote-open="audio"
        data-quote-play={isPlaying ? 'playing' : 'idle'}
        onClick={(event) => {
          event.stopPropagation();
          toggle();
        }}
        aria-label={translate(language, isPlaying ? 'quote.audio.pause' : 'quote.audio.listen')}
        aria-pressed={isPlaying}
        className="flex items-center gap-1.5 rounded-full px-1.5"
        style={{
          width: QUOTED_CARD_WIDTH,
          minHeight: QUOTE_AUDIO_TARGET_PX,
          color: ink,
          backgroundColor: isMine ? 'color-mix(in srgb, var(--color-ios-on-brand) 16%, transparent)' : 'color-mix(in srgb, var(--accent) 14%, transparent)',
        }}
      >
        <span
          className="grid size-6 shrink-0 place-items-center rounded-full"
          style={{ backgroundColor: isMine ? 'color-mix(in srgb, var(--color-ios-on-brand) 28%, transparent)' : 'var(--accent)' }}
          aria-hidden
        >
          {isPlaying ? (
            <GlyphSvg glyph={MEDIA_GLYPHS.pause} size={10} className="text-ios-on-brand" />
          ) : (
            <Glyph name="fillPlay" size={10} className="text-ios-on-brand" />
          )}
        </span>
        <span data-quote-wave aria-hidden className="flex h-4 flex-1 items-center gap-px">
          {waves.map((height, index) => (
            <span
              key={index}
              className="flex-1 rounded-full"
              data-quote-wave-played={index / waves.length < progress ? 'true' : undefined}
              style={{ height: `${Math.max(18, height * 4)}%`, backgroundColor: 'currentColor', opacity: index / waves.length < progress ? 1 : 0.6 }}
            />
          ))}
        </span>
        {media.durationLabel !== null ? (
          <span data-quote-duration={media.durationLabel} className="shrink-0 text-check tabular-nums">
            {media.durationLabel}
          </span>
        ) : null}
      </button>
    </span>
  );
}
