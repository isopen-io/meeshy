import { disconnectRevokedSessions, type RevokedSessionIO } from './disconnectRevokedSessions';

/**
 * Couper les sockets d'un compte qui vient d'être SUPPRIMÉ — fin de grâce
 * (`MaintenanceService`, via le révocateur du manager) ou purge immédiate
 * (`routes/account-deletion.ts`). Un seul site pour les deux, sans quoi l'un
 * nommerait le compte supprimé et l'autre non (#10264).
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
