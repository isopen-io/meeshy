import { sessionStore } from '@/lib/api/session';
import { appelNatif, coqueCourante, type CoqueNative } from '@/lib/native-shell';

import {
  watchDeliveryReceiptCredential,
  type DeliveryReceiptCredential,
  type SessionStoreLike,
} from './delivery-receipt-credential';

/**
 * **LA COQUE ANDROID CONNAÎT LA SESSION DE LA PAGE** (#10662).
 *
 * Le natif agit sans la page : il accuse la remise d'un push
 * (`PushDeliveryReceipt`), refuse un appel sans socket, joue un vocal depuis sa
 * notification et en rapporte l'écoute (`NotificationVoiceService`, #10641).
 * Il lui faut pour cela le credential de la page, rangé par le pont
 * `MeeshyCall` (`CallShellStore`).
 *
 * Ce credential partait de `bindShellCall`, que seul le pont d'appel branche, à
 * la première connexion du socket, et SEULEMENT si les appels sont offerts : la
 * coque Android les a coupés (#10611), si bien que rien ne le posait plus
 * jamais (mesuré sur émulateur : aucun appel `MeeshyCall`, préférences
 * natives vides, page connectée). Il démarre désormais avec la coque, hors du
 * premier rendu, et suit la session : posé à chaque lancement, tenu à jour,
 * retiré à la déconnexion. Une seule source : `watchDeliveryReceiptCredential`,
 * la même que le service worker web.
 */

const PONT = 'MeeshyCall';

type Native = (method: string, options: object) => Promise<unknown>;

const credentialOptions = ({ apiBase, credential }: DeliveryReceiptCredential): object | null => {
  if (credential === null) return null;
  return credential.kind === 'registered'
    ? { apiBase, kind: 'registered', token: credential.token }
    : { apiBase, kind: 'anonymous', token: credential.sessionToken };
};

export function bindShellCredential(params: { readonly native: Native; readonly sessionStore: SessionStoreLike }): () => void {
  return watchDeliveryReceiptCredential({
    sessionStore: params.sessionStore,
    write: (value) => {
      const options = credentialOptions(value);
      // Best effort : un pont qui rejette laisse le natif sans credential,
      // jamais une erreur qui remonterait à l'écran.
      return (options === null ? params.native('clearCredential', {}) : params.native('setCredential', options))
        .then(() => undefined)
        .catch(() => undefined);
    },
  });
}

let stopRunning: (() => void) | null = null;

/** Android seulement, et seulement une coque qui déclare le pont ; idempotent. */
export function startShellCredentialSync(
  params: { readonly coque?: CoqueNative | undefined; readonly sessionStore?: SessionStoreLike } = {},
): () => void {
  const coque = 'coque' in params ? params.coque : coqueCourante();
  const native = coque?.getPlatform?.() === 'android' ? appelNatif(coque, PONT) : null;
  if (native === null) return () => undefined;
  if (stopRunning !== null) return stopRunning;
  const unsubscribe = bindShellCredential({ native, sessionStore: params.sessionStore ?? sessionStore });
  const stop = (): void => {
    unsubscribe();
    if (stopRunning === stop) stopRunning = null;
  };
  stopRunning = stop;
  return stop;
}
