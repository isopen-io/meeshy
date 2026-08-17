/**
 * Ce qui reste de l'ancienne page `/join/:linkId`.
 *
 * La page a disparu : rejoindre une conversation partagée se fait désormais
 * dans une modale posée sur `/chat/:linkId`
 * (`components/chat/JoinConversationModal.tsx`). Seuls survivent les deux
 * composants que cette modale — et l'écran d'erreur de lien — réutilisent tels
 * quels. `JoinHeader`, `JoinInfo`, `JoinActions` et `JoinLoading` étaient le
 * chrome de la page d'accueil : la modale porte ce rôle maintenant.
 */
export { AnonymousForm } from './AnonymousForm';
export { JoinError } from './JoinError';
