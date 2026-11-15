import { disconnectRevokedSessions, type RevokedSessionIO } from './disconnectRevokedSessions';

/**
 * Couper les sockets d'un compte dont la suppression est CONFIRMÉE — la purge
 * (`routes/account-deletion.ts`, demande passée à `COMPLETED`, irréversible),
 * en NOMMANT le compte supprimé (`deletedAccountId`, #10264). La fin de grâce
 * (`MaintenanceService`) n'y passe PAS : l'annulation y rend encore le compte,
 * et un appareil qui purgerait ses données sur sa foi les perdrait pour rien.
 */
export function revokeDeletedAccountSessions(params: {
  io: RevokedSessionIO | null | undefined;
  userId: string;
  onError?: (error: unknown) => void;
}): Promise<number> {
  return disconnectRevokedSessions({
    ...params,
    reason: 'logout_all_devices',
    message: 'Your account was deleted — every session was signed out.',
    accountDeleted: true,
  });
}
