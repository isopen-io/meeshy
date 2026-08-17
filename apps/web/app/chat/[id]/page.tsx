'use client';

import { useParams } from 'next/navigation';
import { SharedConversationExperience } from '@/components/chat/SharedConversationExperience';

/**
 * `meeshy.me/chat/:sharedId` — le point d'entrée unique d'un lien de partage.
 *
 * Toute la décision « qui es-tu, que dois-tu voir » vit dans
 * `SharedConversationExperience` : cette page n'est plus qu'un passe-plat. En
 * particulier, plus AUCUNE redirection ici — ni vers `/join/:id`, ni vers le
 * schéma `meeshy://`. Les deux existaient et se relançaient mutuellement, au
 * point d'exiger trois gardes `sessionStorage` pour contenir la boucle : un
 * visiteur mobile pouvait rebondir Safari → app iOS → Safari sans fin.
 *
 * L'ouverture dans l'app native reste possible depuis les Universal Links iOS,
 * qui n'ont pas besoin d'une redirection JavaScript pour se déclencher.
 */
export default function SharedChatPage() {
  const params = useParams();
  const linkId = Array.isArray(params?.id) ? params.id[0] : (params?.id as string);

  return <SharedConversationExperience linkId={linkId} />;
}
