import type { InterfaceLanguage } from '@/lib/interface-language';
import { translate } from '@/lib/i18n-catalog';
import type { ReplyToPreview } from '@/lib/view/use-reply-preview';

import { Glyph, GlyphSvg } from './glyph';
import { QUOTE_GLYPH } from './quote-glyphs';

/** `MeeshyControlSize.large` — la vignette de la bande (`composerReplyAttachmentPreview`, iOS). */
const REPLY_BAND_THUMB_PX = 40;

/**
 * LA BANDE DE RÉPONSE DU COMPOSEUR (#18392), miroir `composerReplyBannerBody`
 * (`ConversationView+ComposerBanners.swift`) : le glyphe du genre cité, puis le
 * nom et l'extrait qui coulent dans UN paragraphe borné à deux lignes, puis la
 * vignette du média SOUS l'auteur, dans une case carrée recadrée. Sans
 * vignette servie, le glyphe et le libellé court (« Photo ») disent seuls le
 * genre.
 */
export function ComposerReplyBand({
  replyTo,
  language,
  onCancel,
}: {
  readonly replyTo: ReplyToPreview;
  readonly language: InterfaceLanguage;
  readonly onCancel: (() => void) | undefined;
}) {
  const media = replyTo.media;
  const ink = 'var(--color-ios-ink-2)';
  return (
    <div
      data-composer-reply
      className="mx-3 mb-1 flex items-center gap-2 rounded-quote px-2.5 py-2"
      style={{ backgroundColor: 'var(--color-ios-card)' }}
    >
      <span className="w-1 self-stretch rounded-full" style={{ backgroundColor: 'var(--accent)' }} aria-hidden />
      <span className="flex min-w-0 flex-1 flex-col items-start gap-1 text-title">
        <span className="line-clamp-2 w-full">
          {media === undefined ? null : (
            <span data-composer-reply-glyph={media.kind} className="me-1 inline-block align-baseline" style={{ color: ink }}>
              <GlyphSvg glyph={QUOTE_GLYPH[media.kind]} size={11} />
            </span>
          )}
          <span className="font-semibold" style={{ color: 'var(--accent)' }}>
            {replyTo.author}{' '}
          </span>
          <span style={{ color: ink }} {...(replyTo.language ? { lang: replyTo.language } : {})}>
            {replyTo.excerpt}
          </span>
          {replyTo.more !== undefined && replyTo.more > 0 ? (
            <span data-composer-reply-more={replyTo.more} aria-hidden className="ms-1 font-semibold" style={{ color: ink }}>
              +{replyTo.more}
            </span>
          ) : null}
        </span>
        {media !== undefined && media.thumbnailSrc !== null ? (
          <span
            data-composer-reply-thumb={media.kind}
            aria-hidden
            className="relative block shrink-0 overflow-hidden rounded-media"
            style={{
              width: REPLY_BAND_THUMB_PX,
              height: REPLY_BAND_THUMB_PX,
              ...(media.placeholderSrc === null
                ? { backgroundColor: 'var(--color-media-backdrop)' }
                : { backgroundImage: `url("${media.placeholderSrc}")`, backgroundSize: 'cover' }),
            }}
          >
            <img src={media.thumbnailSrc} alt="" decoding="async" className="size-full object-cover" />
            {media.timebased ? <Glyph name="fillPlay" size={14} className="absolute inset-0 m-auto text-on-media" /> : null}
          </span>
        ) : null}
      </span>
      <button
        type="button"
        onClick={onCancel}
        className="grid size-11 shrink-0 place-items-center"
        aria-label={translate(language, 'composer.reply.cancel')}
      >
        <Glyph name="x" size={14} style={{ color: ink }} />
      </button>
    </div>
  );
}
