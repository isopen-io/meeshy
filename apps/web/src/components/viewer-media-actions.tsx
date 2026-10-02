import { useRef, useState } from 'react';

import { currentCredential } from '@/lib/api/client';
import { attachmentSrc } from '@/lib/api/media-url';
import { appQueryClient } from '@/lib/api/query-client';
import type { Attachment } from '@/lib/api/types';
import { translate, type InterfaceCatalogKey } from '@/lib/i18n-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';
import { currentGallerySaver } from '@/lib/gallery/gallery-saver';
import { saveToGallery } from '@/lib/gallery/save-to-gallery';
import { browserFileDeliveryHost } from '@/lib/media/file-delivery-host';
import { openSendSheet } from '@/lib/send/send-sheet-store';
import { offerStudioSeed } from '@/lib/stories/studio-seed';
import { performAttachmentReaction } from '@/lib/view/attachment-reaction';
import { QUICK_REACTIONS } from '@/lib/view/message-actions';
import type { MediaViewerPage } from '@/lib/view/viewer-page-offers';
import { href, navigate } from '@/routes/route-table';

import { Glyph, GlyphSvg } from './glyph';
import { FEED_GLYPHS } from './glyphs-feed';
import { THREAD_MENU_GLYPHS } from './glyphs-thread-menu';
import { GLYPH_SIZE } from './ui-chrome';
import { ViewerActionRail, type ViewerAction } from './viewer-chrome';
import { ViewerMenu, ViewerReactionTray } from './viewer-chrome-menu';

/**
 * LES ACTIONS DE LA VISIONNEUSE (#6303) — chunk À LA DEMANDE, chargé par
 * `media-viewer.tsx` seulement quand la page courante offre au moins une
 * action (`mediaPageOffers`) : une visionneuse ouverte depuis l'écran des
 * médias sur une pièce protégée n'en paie rien.
 *
 * Disposition d'iOS (`ConversationMediaGalleryView+Actions.swift`,
 * `+Menu.swift`) ET du chrome commun des plein écrans (#8879,
 * `viewer-chrome.tsx`) : « Enregistrer » DANS le menu « … » de la barre haute
 * (iOS #6145) ; Réagir · Créer avec ce média en rail vertical à droite de la
 * légende, 40 de verre dans 44 de cible. Partager (#8884) s'y pose entre les
 * deux, au MÊME endroit que dans le rail d'une story : il ouvre la feuille
 * d'envoi commune (`openSendSheet`), que l'hôte a déjà remplie (`page.share`). « Répondre… » n'est plus un bouton du
 * rail : c'est la capsule de la barre basse, que la visionneuse pose. « Réagir »
 * est une ACTION, pas un ornement : il ouvre la traînée d'émojis, un choix la
 * referme.
 *
 * Chaque geste dit son issue dans la région vivante UNIQUE de la visionneuse
 * (`announce`) : enregistrer, réagir ou composer peut échouer hors ligne, et un
 * échec muet ressemble à un bouton inerte.
 */
export type NoticeKey = Extract<
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
    const mimeType = fetched.blob.type !== '' ? fetched.blob.type : attachment.mimeType;
    const gallery = await saveToGallery({ saver: currentGallerySaver(), blob: fetched.blob, fileName: fetched.fileName, mimeType });
    if (gallery !== null) return gallery;
    const { fileDeliveryPortal } = await import('@/lib/media/deliver-file');
    const portal = fileDeliveryPortal(browserFileDeliveryHost());
    const outcome = portal === null ? 'unavailable' : await portal.deliver(fetched.blob, fetched.fileName, mimeType);
    if (outcome === 'delivered') return 'media.viewer.saved';
    return outcome === 'expired' ? 'media.viewer.retry' : 'media.viewer.save_failed';
  } catch {
    return 'media.viewer.offline';
  }
}

function SaveMenu({ page, language, announce }: { readonly page: MediaViewerPage; readonly language: InterfaceLanguage; readonly announce: (key: NoticeKey) => void }) {
  const saving = useRef(false);
  const save = (): void => {
    if (saving.current) return;
    saving.current = true;
    void savePiece(page.attachment).then((key) => {
      saving.current = false;
      announce(key);
    });
  };
  return (
    <ViewerMenu
      label={translate(language, 'feed.post.more_options')}
      items={[
        {
          key: 'save',
          label: translate(language, 'media.viewer.save'),
          glyph: <Glyph name="downloadSimple" size={GLYPH_SIZE.md} />,
          onSelect: page.offers.save ? save : undefined,
        },
      ]}
    />
  );
}

function ActionRail({
  page,
  language,
  onClose,
  announce,
  hidden,
}: {
  readonly page: MediaViewerPage;
  readonly language: InterfaceLanguage;
  readonly onClose: () => void;
  readonly announce: (key: NoticeKey) => void;
  readonly hidden: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [mine, setMine] = useState<readonly string[]>(page.attachment.currentUserReactions ?? []);
  const [composing, setComposing] = useState(false);
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
      announce(outcome === 'offline' ? 'media.viewer.offline' : outcome === 'limit' ? 'media.viewer.react_limit' : 'media.viewer.react_failed');
    });
  };

  const compose = (): void => {
    setComposing(true);
    void fetchPiece(page.attachment)
      .then((fetched) => {
        setComposing(false);
        if (fetched.status === 'failed') {
          announce(fetched.notice === 'media.viewer.offline' ? fetched.notice : 'media.viewer.compose_failed');
          return;
        }
        offerStudioSeed(new File([fetched.blob], fetched.fileName, { type: page.attachment.mimeType }));
        onClose();
        navigate(href('storyCompose'));
      })
      .catch(() => {
        setComposing(false);
        announce('media.viewer.offline');
      });
  };

  const { share } = page;
  const actions: readonly ViewerAction[] = [
    {
      action: 'react',
      label: translate(language, 'media.viewer.react'),
      glyph: <Glyph name="smiley" size={GLYPH_SIZE.lg} />,
      pressed: open,
      onPress: offers.react ? () => setOpen((o) => !o) : undefined,
      buttonRef: reactButton,
    },
    {
      action: 'share',
      label: translate(language, 'story.action.share'),
      glyph: <GlyphSvg glyph={FEED_GLYPHS.shareNetwork} size={GLYPH_SIZE.lg} />,
      onPress: offers.share && share !== undefined ? () => openSendSheet(share) : undefined,
    },
    {
      action: 'compose',
      label: translate(language, 'media.viewer.compose'),
      glyph: <GlyphSvg glyph={THREAD_MENU_GLYPHS.magicWand} size={GLYPH_SIZE.lg} />,
      busy: composing,
      onPress: offers.compose ? compose : undefined,
    },
  ];

  return (
    <ViewerActionRail
      label={translate(language, 'media.viewer.react')}
      actions={actions}
      hidden={hidden}
      {...(open
        ? {
            anchored: {
              action: 'react',
              node: (
                <ViewerReactionTray
                  label={translate(language, 'media.viewer.react')}
                  reactions={QUICK_REACTIONS}
                  mine={mine}
                  labelOf={(emoji) => translate(language, 'media.viewer.react_with', { emoji })}
                  onPick={react}
                />
              ),
            },
          }
        : {})}
    />
  );
}

export default function ViewerMediaActions({
  slot,
  page,
  language,
  onClose,
  announce,
  hidden = false,
}: {
  readonly slot: 'menu' | 'rail';
  readonly page: MediaViewerPage;
  readonly language: InterfaceLanguage;
  readonly onClose: () => void;
  /** La région vivante UNIQUE de la visionneuse — chaque issue s'y dit. */
  readonly announce: (key: NoticeKey) => void;
  readonly hidden?: boolean;
}) {
  return slot === 'menu' ? (
    <SaveMenu page={page} language={language} announce={announce} />
  ) : (
    <ActionRail page={page} language={language} onClose={onClose} announce={announce} hidden={hidden} />
  );
}
