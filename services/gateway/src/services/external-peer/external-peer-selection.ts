/**
 * Le CHOIX de l'implémentation « pair externe » par configuration (#17115).
 *
 * `EXTERNAL_PEER_PROVIDER=fake-whatsapp` ouvre le faux WhatsApp, et seulement
 * hors production ou au staging déclaré (`MEESHY_ENV=staging`) : en production,
 * la porte reste FERMÉE même demandée. Aucune autre valeur n'ouvre quoi que ce
 * soit : l'adaptateur Meta n'existera qu'après signature de l'accord
 * d'interopérabilité, par une décision du porteur.
 *
 * La porte rendue est toujours ADMISE (`admitExternalPeer`) : aucun appelant ne
 * reçoit une implémentation nue.
 */
import { isStagingEnvironment } from '../email/staging-marker';
import type { ExternalPeer } from './external-peer-contract';
import { admitExternalPeer, loadLibsignalMessages, type ExternalPeerLogger, type LibsignalMessagesApi } from './external-peer-gate';
import { createFakeWhatsAppPeer, type PeerStore } from './fake-whatsapp-peer';

export const FAKE_WHATSAPP_PROVIDER = 'fake-whatsapp' as const;

export type ExternalPeerSelection = {
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly store: PeerStore;
  readonly logger: ExternalPeerLogger;
  readonly libsignal?: () => LibsignalMessagesApi;
};

export function selectExternalPeer({ env, store, logger, libsignal = loadLibsignalMessages }: ExternalPeerSelection): ExternalPeer | null {
  if (env.EXTERNAL_PEER_PROVIDER !== FAKE_WHATSAPP_PROVIDER) return null;
  if (env.NODE_ENV === 'production' && !isStagingEnvironment(env.MEESHY_ENV)) return null;
  return admitExternalPeer(createFakeWhatsAppPeer({ store }), { libsignal, logger });
}
