/**
 * La distribution en temps réel d'une enveloppe à SON appareil (#3706, spec
 * § 4.3) : `e2ee:envelope` vers la room de la GÉNÉRATION destinataire
 * (`deviceRoomOf`), où seule la socket liée à la session de cet appareil est
 * entrée. Un appareil hors ligne relira ses enveloppes par `GET /e2ee/envelopes` ;
 * une émission perdue ne perd donc rien.
 *
 * Le serveur Socket.IO est résolu PARESSEUSEMENT (il naît après les routes),
 * comme `setEngagementEmitIOProvider`.
 */
import { SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';
import type { E2EEServedEnvelope } from '@meeshy/shared/types/e2ee-directory';
import type { EnvelopeDelivery } from './E2EEEnvelopeRelay';
import { deviceRoomOf } from './device-room';

export type EnvelopeEmitter = {
  to(room: string): { emit(event: typeof SERVER_EVENTS.E2EE_ENVELOPE, envelope: E2EEServedEnvelope): unknown };
  in(room: string): {
    fetchSockets(): Promise<readonly { join(room: string): unknown; readonly data?: unknown }[]>;
    socketsLeave(room: string): unknown;
  };
};

let resolveIO: () => EnvelopeEmitter | null | undefined = () => null;

export function setE2EEEnvelopeIOProvider(provider: () => EnvelopeEmitter | null | undefined): void {
  resolveIO = provider;
}

export const currentE2EEIO = (): EnvelopeEmitter | null | undefined => resolveIO();

export function deliverEnvelopes(deliveries: readonly EnvelopeDelivery[]): void {
  const io = resolveIO();
  if (!io) return;
  deliveries.forEach(({ recipient, envelope }) => {
    io.to(deviceRoomOf(recipient)).emit(SERVER_EVENTS.E2EE_ENVELOPE, envelope);
  });
}
