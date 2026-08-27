'use client';

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useI18n } from '@/hooks/useI18n';
import { useParticipantProfile } from '@/hooks/queries/use-participant-profile';
import { useUpdateParticipantRights } from '@/hooks/queries/use-update-participant-rights';
import { useUpdateHistoryGrant } from '@/hooks/queries/use-update-history-grant';
import { ParticipantProfileCard } from './ParticipantProfileCard';

interface ParticipantProfileDialogProps {
  readonly conversationId: string;
  /** `Participant.id` — `null` ferme la fiche. */
  readonly participantId: string | null;
  readonly onClose: () => void;
}

/**
 * Fiche d'un participant, en modale.
 *
 * Existe d'abord pour les visiteurs SANS COMPTE : eux n'ont pas de page
 * `/u/{pseudo}` — le lien que le tiroir leur posait quand même ne menait nulle
 * part. Leur identité vit dans la conversation, pas sur le site ; sa fiche
 * s'ouvre donc là où ils existent.
 */
export function ParticipantProfileDialog({
  conversationId,
  participantId,
  onClose,
}: ParticipantProfileDialogProps) {
  const { t } = useI18n('conversations');
  const { data, isLoading, isError, error } = useParticipantProfile(conversationId, participantId);
  const hasLeft = (error as (Error & { code?: string }) | null)?.code === 'PARTICIPANT_LEFT';
  const updateRights = useUpdateParticipantRights(conversationId, participantId);
  const updateHistoryGrant = useUpdateHistoryGrant(conversationId, participantId);

  return (
    <Dialog open={!!participantId} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('participantProfile.title', 'Fiche du participant')}</DialogTitle>
        </DialogHeader>
        {isLoading && (
          <div className="space-y-2" data-testid="participant-profile-loading">
            <div className="h-4 w-1/2 animate-pulse rounded bg-gray-200 dark:bg-gray-700" />
            <div className="h-24 animate-pulse rounded bg-gray-100 dark:bg-gray-800" />
          </div>
        )}
        {isError && (
          // « Parti » et « indisponible » ne disent pas la même chose. Un avis
          // d'arrivée reste dans le fil pour toujours et mène ici longtemps
          // après le départ de son auteur : servir « Fiche indisponible » dans
          // ce cas ferait passer un fait de conversation pour une panne.
          <p className="text-sm text-gray-500" data-testid="participant-profile-error">
            {hasLeft
              ? t('participantProfile.hasLeft', 'Cette personne a quitté la conversation')
              : t('participantProfile.unavailable', 'Fiche indisponible')}
          </p>
        )}
        {data && (
          <ParticipantProfileCard
            profile={data}
            // `entryLink` n'est servi qu'aux administrateurs et modérateurs :
            // sa présence EST la réponse du gateway à « ce lecteur peut-il
            // écrire ». Le client ne refait pas cet arbitrage — un droit
            // recalculé côté navigateur n'est pas un droit.
            onToggleCapability={
              data.entryLink
                ? (capability, value) => updateRights.mutate({ [capability]: value })
                : undefined
            }
            // `canGrantHistory` répond à « ce lecteur peut-il écrire ? » —
            // question distincte d'`entryLink` : l'octroi par date vaut pour
            // tout participant, inscrit compris, là où `entryLink` n'existe
            // que pour un visiteur sans compte.
            onSetHistoryGrant={
              data.canGrantHistory
                ? (historyVisibleFrom) => updateHistoryGrant.mutate(historyVisibleFrom)
                : undefined
            }
            historyGrantPending={updateHistoryGrant.isPending}
            historyGrantError={
              updateHistoryGrant.isError
                ? t('participantProfile.historyGrant.error', 'Échec de la mise à jour')
                : null
            }
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
