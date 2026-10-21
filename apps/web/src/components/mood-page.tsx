import { useState, type FormEvent } from 'react';

import type { AppearanceDesign } from '@meeshy/shared/types/appearance-design';
import type { AvatarRingDesign } from '@meeshy/shared/types/avatar-ring-design';

import { attachmentSrc } from '@/lib/api/media-url';
import { moodComposeText } from '@/lib/i18n-mood-compose-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';
import type { MoodPageView } from '@/lib/mood/page-view';
import type { MoodReplyOutcome } from '@/lib/mood/reply';
import type { RainScheduler } from '@/lib/mood/rain-dom';
import { initialsOf } from '@/lib/view/conversation';
import { href } from '@/routes/route-table';

import { PeerAvatar } from './peer-avatar';
import { AvatarRing } from './avatar-ring';
import { GlyphSvg } from './glyph';
import { DISCOVER_GLYPHS } from './glyphs-discover';
import { MoodRain } from './mood-rain';
import { bannerPaint, ProfileBannerDesign, useScheme } from './profile-banner-design';

/**
 * **L'HUMEUR D'UN CONTACT, EN GRAND** (#10813) — le CORPS de la page, sans
 * lecture réseau : ce que la notification « nouvelle humeur » ouvre.
 *
 * Quatre plans, du fond vers le doigt : la BANNIÈRE de l'auteur en plein écran
 * (sa photo de bannière, sinon sa bannière de design, sinon un dégradé de son accent — #10933),
 * voilée pour que le texte reste lisible ; la PLUIE de son emoji ; au centre son
 * AVATAR et son MOT décoré, l'emoji en tête ; en bas, le champ qui RÉPOND en
 * privé (`performMoodReply`). Ma propre humeur n'a pas de champ : on ne se
 * répond pas.
 */
export type MoodPageBanner = {
  readonly image: string | null;
  readonly design: AppearanceDesign | null;
  readonly ring: AvatarRingDesign | null;
};

export type MoodReplyState = { readonly status: 'idle' | 'sending' } | MoodReplyOutcome;

const AVATAR_SIZE = 112;

function Backdrop({ banner, accent }: { readonly banner: MoodPageBanner; readonly accent: string }) {
  const scheme = useScheme();
  const paint = bannerPaint(banner);
  const painted =
    paint.kind === 'design' ? (
      <ProfileBannerDesign design={paint.design} accent={accent} scheme={scheme} />
    ) : paint.kind === 'photo' ? (
      <img src={attachmentSrc(paint.image)} alt="" className="block size-full object-cover" />
    ) : (
      <span
        className="block size-full"
        style={{ background: `linear-gradient(160deg, color-mix(in srgb, ${accent} 70%, black), color-mix(in srgb, ${accent} 25%, black))` }}
      />
    );
  return (
    <div data-mood-backdrop aria-hidden="true" className="absolute inset-0">
      {painted}
      <span className="absolute inset-0" style={{ background: 'linear-gradient(180deg, rgb(0 0 0 / 0.35), rgb(0 0 0 / 0.15) 40%, rgb(0 0 0 / 0.55))' }} />
    </div>
  );
}

function ReplyStatus({ state, language }: { readonly state: MoodReplyState; readonly language: InterfaceLanguage }) {
  if (state.status === 'sent') {
    return (
      <p data-mood-reply-status="sent" className="text-center text-caption text-white">
        {moodComposeText(language, 'mood.page.reply.sent')} ·{' '}
        <a href={href('thread', { conversation: state.conversationId })} className="font-semibold underline">
          {moodComposeText(language, 'mood.page.reply.open')}
        </a>
      </p>
    );
  }
  if (state.status === 'failed' || state.status === 'offline') {
    return (
      <p data-mood-reply-status={state.status} className="text-center text-caption text-white">
        {moodComposeText(language, state.status === 'failed' ? 'mood.page.reply.failed' : 'mood.page.reply.offline')}
      </p>
    );
  }
  return null;
}

function ReplyField({
  language,
  onSend,
  onTextChange,
}: {
  readonly language: InterfaceLanguage;
  readonly onSend: (text: string) => Promise<MoodReplyOutcome>;
  readonly onTextChange?: (text: string) => void;
}) {
  const [text, setText] = useState('');
  const [state, setState] = useState<MoodReplyState>({ status: 'idle' });
  const placeholder = moodComposeText(language, 'mood.page.reply.placeholder');

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (text.trim() === '' || state.status === 'sending') return;
    const sent = text;
    setState({ status: 'sending' });
    setText('');
    void onSend(sent).then((outcome) => {
      setState(outcome);
      if (outcome.status !== 'sent') setText(sent);
    });
  };

  return (
    <div className="grid gap-2">
      <ReplyStatus state={state} language={language} />
      <form data-mood-reply onSubmit={submit} className="glass flex items-center gap-2 rounded-full p-1.5 ps-4">
        <input
          data-mood-reply-input
          value={text}
          onInput={(event) => {
            const value = (event.target as HTMLInputElement).value;
            setText(value);
            onTextChange?.(value);
          }}
          placeholder={placeholder}
          aria-label={placeholder}
          enterKeyHint="send"
          maxLength={2000}
          className="min-w-0 flex-1 bg-transparent py-2 text-body outline-none"
          style={{ color: 'var(--color-ios-ink)' }}
        />
        <button
          type="submit"
          data-mood-reply-send
          disabled={text.trim() === '' || state.status === 'sending'}
          aria-label={moodComposeText(language, 'mood.page.reply.send')}
          className="grid size-11 shrink-0 place-items-center rounded-full text-white transition-opacity disabled:opacity-40"
          style={{ backgroundColor: 'var(--color-ios-brand)' }}
        >
          <GlyphSvg glyph={DISCOVER_GLYPHS.paperPlaneTilt} size={20} />
        </button>
      </form>
    </div>
  );
}

export function MoodPageBody({
  view,
  banner,
  accent,
  language,
  mine,
  onClose,
  onSend,
  onTextChange,
  rainScheduler,
}: {
  readonly view: MoodPageView;
  readonly banner: MoodPageBanner;
  readonly accent: string;
  readonly language: InterfaceLanguage;
  readonly mine: boolean;
  readonly onClose: () => void;
  readonly onSend: (text: string) => Promise<MoodReplyOutcome>;
  readonly onTextChange?: (text: string) => void;
  readonly rainScheduler?: RainScheduler;
}) {
  return (
    <main
      data-mood-page={view.postId}
      aria-label={`${moodComposeText(language, 'mood.page.label')} — ${view.authorName}`}
      className="h-app fixed inset-x-0 top-0 isolate flex flex-col overflow-hidden text-white"
    >
      <Backdrop banner={banner} accent={accent} />
      <MoodRain emoji={view.emoji} {...(rainScheduler === undefined ? {} : { scheduler: rainScheduler })} />

      <header className="relative flex shrink-0 items-center gap-3 px-4 pt-safe">
        <button
          type="button"
          data-mood-close
          onClick={onClose}
          aria-label={moodComposeText(language, 'mood.page.close')}
          className="glass mt-3 grid size-11 place-items-center rounded-full text-xl leading-none focus-visible:outline-2 focus-visible:outline-offset-2"
          style={{ color: 'var(--color-ios-ink)', outlineColor: 'white' }}
        >
          <span aria-hidden="true">✕</span>
        </button>
      </header>

      <section className="relative grid flex-1 content-center justify-items-center gap-5 px-6 text-center">
        <span className="block rounded-full p-1" style={{ background: 'rgb(255 255 255 / 0.85)', boxShadow: '0 12px 40px rgb(0 0 0 / 0.35)' }}>
          <AvatarRing ring={banner.ring} size={AVATAR_SIZE}>
            <PeerAvatar presenceKey={mine ? undefined : view.authorId} initials={initialsOf(view.authorName)} color={accent} size={AVATAR_SIZE} name={view.authorName} {...(view.avatar === null ? {} : { src: view.avatar })} />
          </AvatarRing>
        </span>
        <p className="text-thread font-semibold" style={{ textShadow: '0 1px 8px rgb(0 0 0 / 0.45)' }}>
          {view.authorName}
        </p>
        <figure data-mood-card className="glass grid max-w-md justify-items-center gap-2 rounded-hero px-6 py-5" style={{ color: 'var(--color-ios-ink)' }}>
          <span data-mood-emoji aria-hidden={view.text === '' ? undefined : true} style={{ fontSize: 64, lineHeight: 1 }}>
            {view.emoji}
          </span>
          {view.text === '' ? null : (
            <blockquote
              data-mood-text
              className="max-w-prose whitespace-pre-wrap break-words text-title font-semibold italic"
              {...(view.language === undefined ? {} : { lang: view.language })}
              dir="auto"
            >
              {view.text}
            </blockquote>
          )}
        </figure>
      </section>

      <footer className="relative shrink-0 px-4 pb-safe">
        <div className="mx-auto max-w-xl pb-3">{mine ? null : <ReplyField language={language} onSend={onSend} {...(onTextChange === undefined ? {} : { onTextChange })} />}</div>
      </footer>
    </main>
  );
}
