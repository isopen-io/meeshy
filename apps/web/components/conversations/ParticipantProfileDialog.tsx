'use client';

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useI18n } from '@/hooks/useI18n';
import { useParticipantProfile } from '@/hooks/queries/use-participant-profile';
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
  const { data, isLoading, isError } = useParticipantProfile(conversationId, participantId);

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
          <p className="text-sm text-gray-500" data-testid="participant-profile-error">
            {t('participantProfile.unavailable', 'Fiche indisponible')}
          </p>
        )}
        {data && <ParticipantProfileCard profile={data} />}
      </DialogContent>
    </Dialog>
  );
}
