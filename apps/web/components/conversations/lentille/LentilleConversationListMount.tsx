/**
 * Point de montage de la peau Lentille dans la liste — WL-101 (LWS-10).
 *
 * PLACEHOLDER DÉLIBÉRÉ. `WL-102` (`LentilleRow` + `LentilleBridgeLine`) et
 * `WL-103` (`LentilleSticker` + `SectionScrollPill` + `LivesRail` +
 * `LentilleSkeletonRow`) remplaceront le contenu de ce composant par le rang
 * plat réel. Jusque-là :
 *
 * - Ce composant n'est JAMAIS montré à un utilisateur réel : le drapeau
 *   Lentille est OFF par défaut (`resolveLentilleFlag`), et ce fichier n'est
 *   même pas TÉLÉCHARGÉ tant que personne ne l'active — il est chargé en
 *   `next/dynamic` depuis `ConversationList.tsx`.
 * - Il ne rend PAS un rendu « identique au legacy » : ce serait mentir sur
 *   l'état d'avancement (faire croire que la Lentille est livrée alors que
 *   la loi de rang n'existe pas encore).
 * - Il ne rend pas non plus de contenu réel : prématuré avant WL-102/103.
 *
 * Il sert donc de conteneur vide, documenté, qui :
 *   1. prouve que le mux (`next/dynamic` + `FeatureErrorBoundary`) de
 *      WL-101 fonctionne de bout en bout (montage réel, pas juste un test
 *      qui appelle une fonction) ;
 *   2. porte déjà l'abonnement typing (`useLentilleListTyping`) — actif
 *      SEULEMENT parce que ce composant n'est monté que sous drapeau ON
 *      (voir `hooks/lentille/use-lentille-list-typing.ts`) — pour que
 *      WL-102 n'ait plus qu'à CONSOMMER `typingByConversation`, jamais à
 *      re-découvrir comment l'obtenir.
 */
'use client';

import { useLentilleListTyping } from '@/hooks/lentille/use-lentille-list-typing';

export interface LentilleConversationListMountProps {
  /** Utilisateur courant — sert à ignorer son propre écho typing. */
  currentUserId: string | null | undefined;
}

export function LentilleConversationListMount({
  currentUserId,
}: LentilleConversationListMountProps) {
  // Consommé par WL-102 (`LentilleRow` : ligne 2 « X écrit… », dot forcé
  // vert). Pas encore rendu ici — voir en-tête.
  const typingByConversation = useLentilleListTyping(currentUserId);
  void typingByConversation;

  return <div data-testid="lentille-list-mount" aria-hidden="true" />;
}

export default LentilleConversationListMount;
