import { useEffect, useRef, useState } from 'react';

import { recordEmojiUsage, topEmojis } from '@/lib/emoji-usage';
import { appQueryClient } from '@/lib/api/query-client';
import { translate } from '@/lib/i18n-catalog';
import { fetchPiece, savePiece, type NoticeKey } from '@/lib/media/save-piece';
import { servedMediaFile } from '@/lib/media/served-media';
import type { InterfaceLanguage } from '@/lib/interface-language';
import { openSendSheet, type SendSheetRequest } from '@/lib/send/send-sheet-store';
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
 * Disposition demandée par le porteur le 2026-10-23 (#12424, jumelles iOS
 * #12420 et #12421) : le rail vertical à droite de la légende porte, de haut
 * en bas et dans l'ordre d'iOS (`cadreActionColumn`), Réagir · Répondre ·
 * Créer avec ce média · Enregistrer · Transférer, 40 de verre dans 44 de cible
 * (`viewer-chrome.tsx`, #8879) ; une vidéo y ajoute dessous le son et « … ». Enregistrer et
 * Transférer restent AUSSI dans le menu « … » de la barre haute. Transférer
 * ouvre la feuille d'envoi commune (`openSendSheet`), que l'hôte a déjà
 * remplie (`page.share`) ; il s'appelle « Partager » quand la pièce n'est pas
 * celle d'un message (publication, média nu). « Réagir » est une ACTION, pas un
 * ornement : il ouvre la traînée d'émojis, un choix la referme.
 *
 * Chaque geste dit son issue dans la région vivante UNIQUE de la visionneuse
 * (`announce`) : enregistrer, réagir ou composer peut échouer hors ligne, et un
 * échec muet ressemble à un bouton inerte.
 */
export type { NoticeKey } from '@/lib/media/save-piece';

/** Une pièce de message se TRANSFÈRE ; une publication ou un média nu se PARTAGE. */
const sendVerbOf = (language: InterfaceLanguage, share: SendSheetRequest): string =>
  translate(language, share.intent === 'forward' ? 'message.menu.forward' : 'story.action.share');

/** Enregistrer, une fois à la fois — le rail et le menu partagent le même geste. */
function useSavePiece(page: MediaViewerPage, announce: (key: NoticeKey) => void): (() => void) | undefined {
  const saving = useRef(false);
  if (!page.offers.save) return undefined;
  return () => {
    if (saving.current) return;
    saving.current = true;
    void savePiece(page.attachment).then((key) => {
      saving.current = false;
      announce(key);
    });
  };
}

const sendOf = (page: MediaViewerPage): (() => void) | undefined => {
  const { share } = page;
  return page.offers.share && share !== undefined ? () => openSendSheet(share) : undefined;
};

function SaveMenu({
  page,
  language,
  announce,
  onOverlayChange,
}: {
  readonly page: MediaViewerPage;
  readonly language: InterfaceLanguage;
  readonly announce: (key: NoticeKey) => void;
  readonly onOverlayChange?: ((open: boolean) => void) | undefined;
}) {
  const save = useSavePiece(page, announce);
  const send = sendOf(page);
  return (
    <ViewerMenu
      label={translate(language, 'feed.post.more_options')}
      onOpenChange={onOverlayChange}
      items={[
        {
          key: 'save',
          label: translate(language, 'media.viewer.save'),
          glyph: <Glyph name="downloadSimple" size={GLYPH_SIZE.md} />,
          onSelect: save,
        },
        {
          key: 'share',
          label: page.share === undefined ? '' : sendVerbOf(language, page.share),
          glyph: <GlyphSvg glyph={THREAD_MENU_GLYPHS.arrowBendUpRight} size={GLYPH_SIZE.md} />,
          onSelect: send,
        },
      ]}
    />
  );
}

const rankedReactions = (): readonly string[] => topEmojis({ count: QUICK_REACTIONS.length, defaults: QUICK_REACTIONS });

function ActionRail({
  page,
  language,
  onClose,
  announce,
  hidden,
  onOverlayChange,
}: {
  readonly page: MediaViewerPage;
  readonly language: InterfaceLanguage;
  readonly onClose: () => void;
  readonly announce: (key: NoticeKey) => void;
  readonly hidden: boolean;
  readonly onOverlayChange?: ((open: boolean) => void) | undefined;
}) {
  const [open, setOpen] = useState(false);
  const overlayChangeRef = useRef(onOverlayChange);
  overlayChangeRef.current = onOverlayChange;
  /* La traînée ouverte TIENT le chrome de l'hôte (#10629) — il ne s'efface pas sous elle. */
  useEffect(() => {
    if (!open) return undefined;
    overlayChangeRef.current?.(true);
    return () => overlayChangeRef.current?.(false);
  }, [open]);
  const [mine, setMine] = useState<readonly string[]>(page.attachment.currentUserReactions ?? []);
  const [reactions, setReactions] = useState(rankedReactions);
  const [composing, setComposing] = useState(false);
  const reactButton = useRef<HTMLButtonElement | null>(null);
  const { offers } = page;

  const react = (emoji: string): void => {
    setOpen(false);
    recordEmojiUsage(emoji);
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

  const toggleTray = (): void => {
    if (!open) setReactions(rankedReactions());
    setOpen(!open);
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
        offerStudioSeed(servedMediaFile(fetched.blob, fetched.fileName, { type: page.attachment.mimeType }));
        onClose();
        navigate(href('storyCompose'));
      })
      .catch(() => {
        setComposing(false);
        announce('media.viewer.offline');
      });
  };

  const save = useSavePiece(page, announce);
  const { share } = page;
  const forwards = share?.intent === 'forward';
  const actions: readonly ViewerAction[] = [
    {
      action: 'react',
      label: translate(language, 'media.viewer.react'),
      glyph: <Glyph name="smiley" size={GLYPH_SIZE.lg} />,
      pressed: open,
      onPress: offers.react ? toggleTray : undefined,
      buttonRef: reactButton,
    },
    {
      action: 'reply',
      label: translate(language, 'media.viewer.reply'),
      glyph: <GlyphSvg glyph={THREAD_MENU_GLYPHS.arrowUUpLeft} size={GLYPH_SIZE.lg} />,
      onPress: offers.reply ? page.onReply : undefined,
    },
    {
      action: 'compose',
      label: translate(language, 'media.viewer.compose'),
      glyph: <GlyphSvg glyph={THREAD_MENU_GLYPHS.magicWand} size={GLYPH_SIZE.lg} />,
      busy: composing,
      onPress: offers.compose ? compose : undefined,
    },
    {
      action: 'save',
      label: translate(language, 'media.viewer.save'),
      glyph: <Glyph name="downloadSimple" size={GLYPH_SIZE.lg} />,
      onPress: save,
    },
    {
      action: 'share',
      label: share === undefined ? '' : sendVerbOf(language, share),
      glyph: <GlyphSvg glyph={forwards ? THREAD_MENU_GLYPHS.arrowBendUpRight : FEED_GLYPHS.shareNetwork} size={GLYPH_SIZE.lg} />,
      onPress: sendOf(page),
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
                  reactions={reactions}
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
  onOverlayChange,
}: {
  readonly slot: 'menu' | 'rail';
  readonly page: MediaViewerPage;
  readonly language: InterfaceLanguage;
  readonly onClose: () => void;
  /** La région vivante UNIQUE de la visionneuse — chaque issue s'y dit. */
  readonly announce: (key: NoticeKey) => void;
  readonly hidden?: boolean;
  /** Une ouverture (traînée d'émojis, menu « … ») : l'hôte garde son chrome à l'écran tant qu'elle vit. */
  readonly onOverlayChange?: (open: boolean) => void;
}) {
  return slot === 'menu' ? (
    <SaveMenu page={page} language={language} announce={announce} onOverlayChange={onOverlayChange} />
  ) : (
    <ActionRail page={page} language={language} onClose={onClose} announce={announce} hidden={hidden} onOverlayChange={onOverlayChange} />
  );
}
