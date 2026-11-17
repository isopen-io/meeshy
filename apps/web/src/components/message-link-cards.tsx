import { memo, useMemo } from 'react';

import type { ContentTrackingLink } from '@meeshy/shared/types/post';

import { linkEmbedOf } from '@/lib/links/content-link';
import { isAppPath } from '@/routes/app-paths';

import { ContentLinkCards } from './content-link-cards';
import { ConversationCardsHost, pageOrigins } from './conversation-link-cards';

/**
 * **LA CARTE D'UN LIEN SOUS LE TEXTE D'UN MESSAGE** (#8099, #19334) — posée par
 * les deux peaux du fil (bulle et rangée plate) : même geste, même effet
 * (dimension 6). UNE carte par message, par préséance (`linkEmbedOf`) : la
 * carte de conversation, puis celle du premier lien de contenu.
 *
 * Le texte lu est l'ORIGINAL (`message.content`), jamais la traduction servie.
 * Les hôtes ne la montent pas pour un expéditeur sans compte (ses adresses
 * restent du texte, #10286) ni pour un sticker ou un emoji seul ; un message
 * scellé de bout en bout ne rend jamais son contenu, carte comprise. Mémoïsé :
 * un fil qui se re-rend sans changer le texte ne repasse pas par les cartes.
 */
export const MessageLinkCards = memo(function MessageLinkCards({
  text,
  trackingLinks,
}: {
  readonly text: string;
  readonly trackingLinks?: readonly ContentTrackingLink[] | undefined;
}) {
  const embed = useMemo(() => linkEmbedOf(text, { origins: pageOrigins(), isAppPath, trackingLinks }), [text, trackingLinks]);
  if (embed === null) return null;
  return embed.kind === 'conversation' ? <ConversationCardsHost targets={embed.targets} /> : <ContentLinkCards candidates={embed.candidates} />;
});
