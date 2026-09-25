import { ConfirmDialog } from './confirm-dialog';
import { translate } from '@/lib/i18n-catalog';
import { currentInterfaceLanguage } from '@/lib/interface-language';

/**
 * `PostRepostConfirm` (revue-correction #6278, défaut majeur 1) — LA
 * CONFIRMATION AVANT L'ENVOI, SITE UNIQUE pour les SIX hôtes qui
 * déstructurent `onRepost` de `usePostGesture` (Flux, détail, signets,
 * hashtag, profil, Réels).
 *
 * **Pourquoi une confirmation.** Le repost est APPEND-ONLY — aucun « annuler »
 * n'existe nulle part dans l'interface une fois envoyé. iOS ne l'envoie
 * jamais depuis le seul tap du bouton : il ouvre une alerte Repartager /
 * Citer / Annuler (`FeedPostCard.swift:1049-1053`). Sans « Citer » — qui
 * dépend du composeur prérempli de #7463, hors tranche — la v3.1 réduit
 * l'alerte à ses deux choix DISPONIBLES plutôt que de montrer un troisième
 * bouton mort : « Repartager » (part réellement) et « Annuler » (role
 * `.cancel` sur iOS, tone `'default'` ici — ni l'un ni l'autre n'est un geste
 * destructeur au sens de la charte, la publication reste visible et
 * réversible jusqu'à l'envoi).
 *
 * **Un seul montage, six appelants.** `usePostGesture` pose l'état
 * (`pendingRepostId`) et les deux issues (`confirmRepost`, `cancelRepost`) ;
 * ce composant PEINT ce triplet, sans jamais lire `postId` lui-même — la
 * même divergence qu'a coûtée trois cycles au Prisme (CLAUDE.md) guette tout
 * geste irréversible recopié par ses appelants plutôt que partagé par eux.
 */
export function PostRepostConfirm({
  pendingRepostId,
  onConfirm,
  onCancel,
}: {
  readonly pendingRepostId: string | null;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
}) {
  if (pendingRepostId === null) return null;
  const language = currentInterfaceLanguage();
  return (
    <ConfirmDialog
      name="post-repost"
      title={translate(language, 'feed.post.repost.confirm.title')}
      body={translate(language, 'feed.post.repost.confirm.body')}
      cancelLabel={translate(language, 'common.cancel')}
      confirmLabel={translate(language, 'feed.post.action.repost')}
      tone="default"
      onConfirm={onConfirm}
      onCancel={onCancel}
    />
  );
}
