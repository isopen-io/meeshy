import { AdminInterpretedBadge } from '@/components/admin/badges';
import { interpretInvitationStatus } from '@/lib/admin/interpret/enums';
import type { AdminLanguage } from '@/lib/i18n-admin-catalog';

/** Le statut d'une demande, nommé — « Non reconnu » pour un code que la bibliothèque ne connaît pas, jamais le code. */
export function InvitationStatusBadge({ language, status }: { readonly language: AdminLanguage; readonly status: string }) {
  return <AdminInterpretedBadge value={interpretInvitationStatus(status, language)} />;
}
