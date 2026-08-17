/**
 * `UserProfileModal` — directive produit du 2026-08-17 : « l'auteur d'un
 * message doit être clickable pour afficher son profil EN MODALE ».
 *
 * Patron du dépôt : `Dialog`/`DialogContent` Radix, MÊME structure que
 * `JoinConversationModal.tsx` (en-tête fixe borduré, corps défilant,
 * `showCloseButton`, aucune surcharge de `onEscapeKeyDown`/`onInteractOutside`
 * — Échap et le clic sur le fond ferment TOUJOURS cette modale, contrairement
 * à `JoinConversationModal` qui les bloque conditionnellement : ce profil n'a
 * aucune raison de retenir l'utilisateur). Le focus-trap et l'`aria-modal`
 * viennent de Radix, gratuits.
 *
 * CONTENU : `UserProfileContent` (extraction de `/u/[id]/page.tsx`, voir sa
 * docstring) — un seul jeu de hooks de données, jamais une copie divergente.
 * Squelette pendant le chargement et carte « introuvable » honnête sont DANS
 * ce composant partagé ; la modale n'a qu'à le monter.
 *
 * LIEN « PROFIL COMPLET » — toujours présent dès que `userId` est fourni
 * (calculé depuis le PROP, pas depuis l'utilisateur chargé) : c'est
 * EXACTEMENT le segment `/u/{…}` que l'affordance appelante utilisait comme
 * `href` avant ce lot, donc disponible immédiatement, y compris pendant le
 * chargement ou si l'utilisateur s'avère introuvable. Un vrai `<Link href>`
 * (pas un bouton `router.push`) : le clic simple ferme la modale et NAVIGUE
 * (accès page complète préservé), un clic modifié (⌘/Ctrl/molette) ouvre un
 * nouvel onglet SANS fermer celle-ci — c'est le navigateur qui gère ce cas,
 * jamais interceptée ici.
 */
'use client';

import { useCallback, useState } from 'react';
import Link from 'next/link';
import { ExternalLink } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useI18n } from '@/hooks/useI18n';
import { UserProfileContent, type UserProfileLoadState } from './UserProfileContent';
import { getUserDisplayName } from '@/utils/user-display-name';

export interface UserProfileModalProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  /**
   * Segment de route `/u/{userId}` — id OU username, EXACTEMENT ce que
   * l'affordance appelante aurait mis dans son `href` avant ce lot. `null`
   * tant qu'aucune cible n'est choisie ; l'appelant garde alors `open=false`
   * (le type nullable évite un état halte-tout entre deux ouvertures — voir
   * `FocalThread`/`LentilleConversationListMount`, qui possèdent l'état).
   */
  readonly userId: string | null;
}

export function UserProfileModal({ open, onOpenChange, userId }: UserProfileModalProps) {
  const { t } = useI18n('profile');
  const [loadState, setLoadState] = useState<UserProfileLoadState>({ loading: true, user: null });

  const handleStateChange = useCallback((next: UserProfileLoadState) => {
    setLoadState(next);
  }, []);

  const handleBeforeNavigate = useCallback(() => {
    onOpenChange(false);
  }, [onOpenChange]);

  const title = loadState.user
    ? getUserDisplayName(loadState.user, loadState.user.username || t('modalTitle', 'Profil'))
    : t('modalTitle', 'Profil');

  const fullProfileHref = userId ? `/u/${encodeURIComponent(userId)}` : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="flex max-h-[85vh] w-[min(100vw-2rem,32rem)] flex-col gap-0 overflow-hidden p-0"
        data-testid="user-profile-modal"
      >
        <div className="shrink-0 border-b px-6 pb-4 pt-6">
          <DialogHeader>
            <DialogTitle data-testid="user-profile-modal-title">{title}</DialogTitle>
            <DialogDescription className="sr-only">{t('userProfile')}</DialogDescription>
          </DialogHeader>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          {open && userId && (
            <UserProfileContent
              userId={userId}
              layout="modal"
              onStateChange={handleStateChange}
              onBeforeNavigate={handleBeforeNavigate}
            />
          )}
        </div>

        {fullProfileHref && (
          <div className="shrink-0 border-t px-6 py-4">
            <Link
              href={fullProfileHref}
              data-testid="user-profile-modal-full-link"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
              onClick={() => onOpenChange(false)}
            >
              {t('viewFullProfile', 'Voir le profil complet')}
              <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default UserProfileModal;
