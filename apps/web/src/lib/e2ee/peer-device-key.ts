/**
 * LA CLÉ DE LA MÉMOIRE « DÉJÀ VU AVEC UN APPAREIL » D'UN COMPTE (#20181,
 * #20197) — une par compte, jamais lue par un autre. La déconnexion la garde
 * (la reprendre ne doit pas rouvrir l'automatisme) ; retirer le compte de
 * l'appareil, ou le supprimer, l'efface (`device-accounts.ts`). Module à part :
 * le coffre des comptes n'embarque pas le magasin.
 */
export const peersSeenWithDeviceKey = (account: string): string => `meeshy.e2ee.peers-seen-with-device.u_${account}`;

export function forgetPeersSeenWithDevice(storage: { readonly removeItem: (key: string) => void } | null, account: string): void {
  try {
    storage?.removeItem(peersSeenWithDeviceKey(account));
  } catch {
    return;
  }
}
