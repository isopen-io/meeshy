import { useState } from 'react';

import { maskedAttachment } from '@meeshy/shared/utils/attachment-protection';

import { apiConfig } from '@/lib/api/config';
import type { ConversationsDeps } from '@/lib/api/conversations';
import { attachmentSrc } from '@/lib/api/media-url';
import type { Message } from '@/lib/api/types';
import { translate } from '@/lib/i18n-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';
import { internalPathOf } from '@/lib/links/internal-link';
import { webOriginOf } from '@/lib/links/web-origin';
import { thumbHashPlaceholder } from '@/lib/media/thumbhash';
import type { MediaHubAttachmentItem, MediaHubItem, MediaHubLinkItem } from '@/lib/view/media-hub';
import { isMineOf } from '@/lib/view/message';
import { isAppPath } from '@/routes/app-paths';
import { navigate } from '@/routes/route-table';

import { Attachments } from './attachment-blocks';
import { ConversationLinkCards } from './conversation-link-cards';
import { Glyph } from './glyph';
import { MediaUnavailable } from './media-unavailable';
import { LocationCard } from './message-body-blocks';

/**
 * LES ÉLÉMENTS DE L'ÉCRAN « MÉDIAS, LIENS ET DOCUMENTS » (#8103).
 *
 * Aucun lecteur n'est réécrit ici : un vocal se joue par le lecteur du fil
 * (`Attachments` → `VoiceAttachment`, reprise et rapport d'écoute compris), un
 * document s'ouvre par la rangée du fil (`<a target="_blank">` qui télécharge
 * à l'ouverture et rapporte l'ouverture), une carte de visite par la carte du
 * fil (#8101, `Attachments` → `ContactCard`), une adresse de conversation par
 * sa carte (#8099, `ConversationLinkCards`), un lieu par `LocationCard`. Ce module ne pose que la GRILLE des
 * vignettes et la ligne « qui, quand · aller au message » de chaque élément.
 *
 * Les octets d'un média ne partent qu'à l'ouverture : la grille ne charge que
 * la VIGNETTE servie (`thumbnailUrl`), en `loading="lazy"`, sur le fond
 * ThumbHash — jamais le fichier d'une vidéo, jamais une pièce floutée.
 */
export const TILE_MIN_SIDE = 104;
export const ROW_MIN_HEIGHT = 56;

const dateOf = (message: Message, language: InterfaceLanguage): string => {
  const date = message.createdAt instanceof Date ? message.createdAt : new Date(message.createdAt as unknown as string);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString(language, { day: 'numeric', month: 'short', year: 'numeric' });
};

const senderOf = (message: Message): string => message.sender?.displayName ?? '';

const inAppPathOf = (href: string): string | null =>
  internalPathOf(href, {
    origins: [webOriginOf(apiConfig.base, window.location.origin), window.location.origin],
    isAppPath,
  });

export type ItemHosts = {
  readonly language: InterfaceLanguage;
  readonly languages: readonly string[];
  readonly viewerId: string;
  readonly accent: string;
  readonly onJumpToMessage?: ((messageId: string) => void) | undefined;
  /**
   * LE MESSAGE EST-IL DANS LE FIL CHARGÉ ? — le saut du fil n'atteint que les
   * messages chargés (`useThreadJump`, l'ouverture sur un message ancien est
   * #7420). Un « Aller au message » qui ne mènerait nulle part n'est pas posé.
   */
  readonly canJumpTo?: ((messageId: string) => boolean) | undefined;
  readonly deps?: ConversationsDeps | undefined;
};

/** La tuile d'un média — la vignette seule, jamais le fichier. */
export function MediaTile({
  item,
  language,
  onOpen,
}: {
  readonly item: MediaHubAttachmentItem;
  readonly language: InterfaceLanguage;
  readonly onOpen: (key: string) => void;
}) {
  const { attachment, message } = item;
  const [failedThumb, setFailedThumb] = useState<string | null>(null);
  const masked = maskedAttachment(attachment);
  const isVideo = attachment.mimeType.startsWith('video/');
  const thumb =
    attachment.thumbnailUrl !== undefined && attachment.thumbnailUrl !== ''
      ? attachmentSrc(attachment.thumbnailUrl)
      : !isVideo && attachment.fileUrl !== ''
        ? attachmentSrc(attachment.fileUrl)
        : undefined;
  const placeholder = masked ? undefined : thumbHashPlaceholder(attachment.thumbHash);
  const label = translate(language, isVideo ? 'media_hub.tile.video' : 'media_hub.tile.image', {
    name: senderOf(message),
    date: dateOf(message, language),
  });

  return (
    <li className="relative" style={{ aspectRatio: '1 / 1' }}>
      <button
        type="button"
        aria-label={label}
        data-media-hub-tile={item.key}
        onClick={() => onOpen(item.key)}
        className="relative block size-full overflow-hidden"
        style={{
          backgroundColor: 'var(--color-ios-card)',
          ...(placeholder === undefined ? {} : { backgroundImage: `url("${placeholder}")`, backgroundSize: 'cover' }),
        }}
      >
        {masked ? (
          <span className="absolute inset-0 grid place-items-center" style={{ color: 'var(--color-ios-ink-2)' }}>
            <Glyph name="eyeSlash" size={22} />
          </span>
        ) : thumb === undefined ? null : failedThumb === thumb ? (
          /* Une vignette introuvable (#8141) : l'état dessiné compact, jamais
             l'icône brisée du navigateur. */
          <span className="absolute inset-0">
            <MediaUnavailable language={language} tone="on-card" compact />
          </span>
        ) : (
          <img
            src={thumb}
            alt=""
            loading="lazy"
            decoding="async"
            className="size-full object-cover"
            draggable={false}
            onError={() => setFailedThumb(thumb)}
          />
        )}
        {isVideo ? (
          <span className="absolute bottom-1 left-1 grid place-items-center rounded-full text-white" style={{ width: 22, height: 22, backgroundColor: 'rgba(0,0,0,0.55)' }}>
            <Glyph name="fillPlay" size={12} />
          </span>
        ) : null}
      </button>
    </li>
  );
}

/** « Nour · 12 sept. 2026 » et, quand l'hôte sait y aller, « Aller au message ». */
function ItemMeta({ message, hosts }: { readonly message: Message; readonly hosts: ItemHosts }) {
  const sender = senderOf(message);
  const date = dateOf(message, hosts.language);
  const jump = hosts.onJumpToMessage !== undefined && (hosts.canJumpTo?.(message.id) ?? true) ? hosts.onJumpToMessage : undefined;
  return (
    <div className="flex items-center gap-2">
      <span className="min-w-0 flex-1 truncate text-caption" style={{ color: 'var(--color-ios-ink-2)' }}>
        {[sender, date].filter((part) => part !== '').join(' · ')}
      </span>
      {jump === undefined ? null : (
        <button
          type="button"
          onClick={() => jump(message.id)}
          data-media-hub-jump={message.id}
          className="shrink-0 rounded-chip px-3 text-caption font-semibold"
          style={{ minHeight: 44, color: 'var(--accent)' }}
        >
          {translate(hosts.language, 'media_hub.go_to_message')}
        </button>
      )}
    </div>
  );
}

function LinkRow({ item, hosts }: { readonly item: MediaHubLinkItem; readonly hosts: ItemHosts }) {
  const inApp = inAppPathOf(item.href);
  const label = translate(hosts.language, 'media_hub.open_link', { host: item.host });
  return (
    <a
      href={inApp ?? item.href}
      {...(inApp === null ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
      aria-label={label}
      data-media-hub-link={item.href}
      onClick={(event) => {
        if (inApp === null || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        event.preventDefault();
        navigate(inApp);
      }}
      className="flex items-center gap-3 py-1"
      style={{ minHeight: 44 }}
    >
      <span className="grid shrink-0 place-items-center rounded-field" style={{ width: 40, height: 40, backgroundColor: 'var(--color-ios-card)', color: 'var(--accent)' }}>
        <Glyph name={item.kind === 'conversation' ? 'users' : 'linkSimple'} size={20} />
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-body font-semibold" style={{ color: 'var(--color-ios-ink)' }}>
          {item.host}
        </span>
        <span className="truncate text-caption" style={{ color: 'var(--color-ios-ink-2)' }} dir="ltr">
          {item.href}
        </span>
      </span>
    </a>
  );
}

/** Une rangée d'élément : son corps (lecteur, document, lien, lieu) puis sa ligne « qui, quand ». */
export function MediaHubRow({ item, hosts }: { readonly item: MediaHubItem; readonly hosts: ItemHosts }) {
  const { message } = item;
  const body = (() => {
    switch (item.kind) {
      case 'audio':
      case 'document':
      case 'contact':
      case 'visual':
        return (
          <Attachments
            attachments={[item.attachment]}
            languages={hosts.languages}
            fallbackLanguage={message.originalLanguage}
            mediaFrame="tiles"
            isMine={isMineOf(message, hosts.viewerId)}
            {...(hosts.deps === undefined ? {} : { deps: hosts.deps })}
          />
        );
      case 'conversation':
        return <ConversationLinkCards text={item.href} trackingLinks={message.trackingLinks} />;
      case 'link':
        return <LinkRow item={item} hosts={hosts} />;
      case 'location':
        return <LocationCard place={item.place} accent={hosts.accent} language={hosts.language} />;
    }
  })();

  return (
    <li className="flex flex-col gap-1 px-4 py-2" style={{ minHeight: ROW_MIN_HEIGHT }} data-media-hub-row={item.key}>
      {body}
      <ItemMeta message={message} hosts={hosts} />
    </li>
  );
}
