import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';

import { currentCredential } from '@/lib/api/client';
import { attachmentSrc } from '@/lib/api/media-url';
import { appQueryClient } from '@/lib/api/query-client';
import type { Attachment } from '@/lib/api/types';
import { translate, type InterfaceCatalogKey } from '@/lib/i18n-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';
import { browserFileDeliveryHost } from '@/lib/media/file-delivery-host';
import { offerStudioSeed } from '@/lib/stories/studio-seed';
import { performAttachmentReaction } from '@/lib/view/attachment-reaction';
import { QUICK_REACTIONS } from '@/lib/view/message-actions';
import type { MediaViewerPage } from '@/lib/view/media-viewer-actions';
import { href, navigate } from '@/routes/route-table';

import { Glyph, GlyphSvg } from './glyph';
import { THREAD_MENU_GLYPHS } from './glyphs-thread-menu';
import { THREAD_STATES_GLYPHS } from './glyphs-thread-states';

/**
 * LES ACTIONS DE LA VISIONNEUSE (#6303) — chunk À LA DEMANDE, chargé par
 * `media-viewer.tsx` seulement quand la page courante offre au moins une
 * action (`mediaPageOffers`) : une visionneuse ouverte depuis l'écran des
 * médias sur une pièce protégée n'en paie rien.
 *
 * Disposition d'iOS (`ConversationMediaGalleryView+Actions.swift`,
 * `+Menu.swift`) : « Enregistrer » dans le couloir HAUT, en face de la croix ;
 * Réagir · Répondre · Créer avec ce média en COLONNE à droite du cadre, 40 de
 * verre dans 44 de cible. « Réagir » est une ACTION, pas un ornement : il
 * ouvre la traînée d'émojis, un choix la referme.
 *
 * Chaque geste dit son issue dans une région vivante (`role="status"`) :
 * enregistrer, réagir ou composer peut échouer hors ligne, et un échec muet
 * ressemble à un bouton inerte.
 */
type NoticeKey = Extract<
  InterfaceCatalogKey,
  | 'media.viewer.saved'
  | 'media.viewer.save_failed'
  | 'media.viewer.offline'
  | 'media.viewer.retry'
  | 'media.viewer.react_failed'
  | 'media.viewer.react_limit'
  | 'media.viewer.compose_failed'
>;

type Fetched = { readonly status: 'ready'; readonly blob: Blob; readonly fileName: string } | { readonly status: 'failed'; readonly notice: NoticeKey };

async function fetchPiece(attachment: Attachment): Promise<Fetched> {
  const { downloadFile } = await import('@/lib/media/download-file');
  const result = await downloadFile({
    url: attachmentSrc(attachment.fileUrl),
    fallbackMediaId: attachment.id,
    deps: { fetchImpl: (input, init) => fetch(input, init), credential: currentCredential },
    onProgress: () => undefined,
  });
  if (result.status === 'ready') {
    return { status: 'ready', blob: result.blob, fileName: attachment.originalName !== '' ? attachment.originalName : result.fileName };
  }
  return { status: 'failed', notice: result.status === 'offline' ? 'media.viewer.offline' : 'media.viewer.save_failed' };
}

async function savePiece(attachment: Attachment): Promise<NoticeKey> {
  try {
    const fetched = await fetchPiece(attachment);
    if (fetched.status === 'failed') return fetched.notice;
    const { fileDeliveryPortal } = await import('@/lib/media/deliver-file');
    const portal = fileDeliveryPortal(browserFileDeliveryHost());
    const mimeType = fetched.blob.type !== '' ? fetched.blob.type : attachment.mimeType;
    const outcome = portal === null ? 'unavailable' : await portal.deliver(fetched.blob, fetched.fileName, mimeType);
    if (outcome === 'delivered') return 'media.viewer.saved';
    return outcome === 'expired' ? 'media.viewer.retry' : 'media.viewer.save_failed';
  } catch {
    return 'media.viewer.offline';
  }
}

function useNotice(): readonly [NoticeKey | null, (key: NoticeKey) => void] {
  const [notice, setNotice] = useState<NoticeKey | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (timer.current !== null) clearTimeout(timer.current);
  }, []);
  const show = (key: NoticeKey): void => {
    setNotice(key);
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = setTimeout(() => setNotice(null), 3_000);
  };
  return [notice, show];
}

function Notice({ notice, language }: { readonly notice: NoticeKey | null; readonly language: InterfaceLanguage }) {
  return (
    <p
      role="status"
      aria-live="polite"
      data-viewer-notice={notice ?? ''}
      className={notice === null ? 'sr-only' : 'rounded-full px-3 py-1 text-mini text-white'}
      style={notice === null ? undefined : { backgroundColor: 'rgb(0 0 0 / 55%)' }}
    >
      {notice === null ? '' : translate(language, notice)}
    </p>
  );
}

function StageButton({
  label,
  onPress,
  busy = false,
  pressed,
  children,
  action,
  buttonRef,
}: {
  readonly buttonRef?: { current: HTMLButtonElement | null };
  readonly label: string;
  readonly onPress: () => void;
  readonly busy?: boolean;
  readonly pressed?: boolean;
  readonly children: ReactNode;
  readonly action: string;
}) {
  return (
    <button
      ref={buttonRef}
      type="button"
      aria-label={label}
      data-viewer-action={action}
      {...(pressed === undefined ? {} : { 'aria-pressed': pressed })}
      {...(busy ? { 'aria-busy': true } : {})}
      disabled={busy}
      onClick={(event) => {
        event.stopPropagation();
        onPress();
      }}
      className="grid size-11 place-items-center text-white"
    >
      <span className="media-viewer-scene-control grid place-items-center rounded-full" style={{ opacity: busy ? 0.5 : 1 }}>
        {children}
      </span>
    </button>
  );
}

function SaveAction({ page, language }: { readonly page: MediaViewerPage; readonly language: InterfaceLanguage }) {
  const [busy, setBusy] = useState(false);
  const [notice, show] = useNotice();
  return (
    <div className="flex items-center gap-2">
      <Notice notice={notice} language={language} />
      <button
        type="button"
        aria-label={translate(language, 'media.viewer.save')}
        data-viewer-action="save"
        disabled={busy}
        {...(busy ? { 'aria-busy': true } : {})}
        onClick={() => {
          setBusy(true);
          void savePiece(page.attachment).then((key) => {
            setBusy(false);
            show(key);
          });
        }}
        className="media-viewer-close tap-target-34 grid place-items-center rounded-full text-white"
        style={{ opacity: busy ? 0.5 : 1 }}
      >
        <Glyph name="downloadSimple" size={16} />
      </button>
    </div>
  );
}

function ActionColumn({
  page,
  language,
  onClose,
}: {
  readonly page: MediaViewerPage;
  readonly language: InterfaceLanguage;
  readonly onClose: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [mine, setMine] = useState<readonly string[]>(page.attachment.currentUserReactions ?? []);
  const [composing, setComposing] = useState(false);
  const [notice, show] = useNotice();
  const reactButton = useRef<HTMLButtonElement | null>(null);
  const { offers } = page;

  const react = (emoji: string): void => {
    setOpen(false);
    /* Le choix retire la traînée — et le bouton choisi avec elle. Le focus
       revient à « Réagir », jamais au `<body>` : Échap fermerait sinon… rien. */
    reactButton.current?.focus();
    const before = mine;
    setMine(before.includes(emoji) ? before.filter((e) => e !== emoji) : [...before, emoji]);
    void performAttachmentReaction({
      queryClient: appQueryClient,
      conversationId: page.conversationId,
      messageId: page.messageId,
      attachmentId: page.attachment.id,
      emoji,
      mine: before,
    }).then((outcome) => {
      if (outcome === 'ok') return;
      setMine(before);
      show(outcome === 'offline' ? 'media.viewer.offline' : outcome === 'limit' ? 'media.viewer.react_limit' : 'media.viewer.react_failed');
    });
  };

  const compose = (): void => {
    setComposing(true);
    void fetchPiece(page.attachment)
      .then((fetched) => {
        setComposing(false);
        if (fetched.status === 'failed') {
          show(fetched.notice === 'media.viewer.offline' ? fetched.notice : 'media.viewer.compose_failed');
          return;
        }
        offerStudioSeed(new File([fetched.blob], fetched.fileName, { type: page.attachment.mimeType }));
        onClose();
        navigate(href('storyCompose'));
      })
      .catch(() => {
        setComposing(false);
        show('media.viewer.offline');
      });
  };

  return (
    <div
      data-viewer-actions
      className="flex flex-col items-end gap-2"
      onClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
      onPointerUp={(event) => event.stopPropagation()}
    >
      {open ? (
        <div role="group" aria-label={translate(language, 'media.viewer.react')} data-viewer-reactions className="flex max-w-[85vw] gap-1 overflow-x-auto">
          {QUICK_REACTIONS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              aria-label={translate(language, 'media.viewer.react_with', { emoji })}
              aria-pressed={mine.includes(emoji)}
              onClick={(event) => {
                event.stopPropagation();
                react(emoji);
              }}
              className="grid size-11 place-items-center text-2xl"
            >
              <span aria-hidden="true">{emoji}</span>
            </button>
          ))}
        </div>
      ) : null}
      {offers.react ? (
        <StageButton buttonRef={reactButton} action="react" label={translate(language, 'media.viewer.react')} pressed={open} onPress={() => setOpen((o) => !o)}>
          <Glyph name="smiley" size={18} />
        </StageButton>
      ) : null}
      {offers.reply && page.onReply !== undefined ? (
        <StageButton action="reply" label={translate(language, 'media.viewer.reply')} onPress={page.onReply}>
          <GlyphSvg glyph={THREAD_STATES_GLYPHS.arrowBendUpLeft} size={18} />
        </StageButton>
      ) : null}
      {offers.compose ? (
        <StageButton action="compose" label={translate(language, 'media.viewer.compose')} busy={composing} onPress={compose}>
          <GlyphSvg glyph={THREAD_MENU_GLYPHS.magicWand} size={18} />
        </StageButton>
      ) : null}
      <Notice notice={notice} language={language} />
    </div>
  );
}

export default function ViewerMediaActions({
  slot,
  page,
  language,
  onClose,
}: {
  readonly slot: 'save' | 'column';
  readonly page: MediaViewerPage;
  readonly language: InterfaceLanguage;
  readonly onClose: () => void;
}) {
  return slot === 'save' ? <SaveAction page={page} language={language} /> : <ActionColumn page={page} language={language} onClose={onClose} />;
}
