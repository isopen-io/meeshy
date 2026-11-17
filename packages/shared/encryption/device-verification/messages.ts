/**
 * LA VALIDATION À LA RÉCEPTION d'un message de comparaison (#18906, #19154).
 *
 * Spécification `docs/superpowers/specs/2026-11-17-e2ee-ajout-appareil-par-code.md`, § 4.8 :
 *  - `v == 1`, sinon `cancel(unsupported)` ; un champ en trop, un type inconnu, une forme
 *    fausse, un champ dont le NOM évoque une clé privée : `cancel(unexpected-message)` ;
 *  - `from.userId` est mon compte, en minuscules ; `from` n'est pas moi (ni ma place, ni ma
 *    clé) ; pour `request` et `accept`, `from` est la génération que le relais a vérifiée
 *    (`relayedFrom`) ;
 *  - tout AUTRE message d'une transaction doit venir de la génération pair de cette
 *    transaction ; sinon il est IGNORÉ : ni `cancel`, ni échec compté (un tiers ne peut
 *    pas faire échouer la comparaison de deux autres appareils).
 *
 * Ce module ne journalise rien.
 */
import { containsPrivateKeyField } from '../../types/e2ee-directory.js';
import {
  DEVICE_VERIFICATION_VERSION,
  deviceVerificationMessageSchema,
  type DeviceVerificationMessage,
} from '../../types/e2ee-device-trust.js';
import { isSelfDescriptor, type DeviceDescriptor, type DeviceGenerationRef } from './descriptor.js';

export type VerificationReading =
  | { readonly verdict: 'accepted'; readonly message: DeviceVerificationMessage }
  | { readonly verdict: 'refused'; readonly cancel: 'unexpected-message' | 'unsupported' }
  | { readonly verdict: 'ignored' };

export type ReceptionContext = {
  /** Mon compte (24 caractères hexadécimaux minuscules). */
  readonly account: string;
  /** Ma génération et ma clé d'identité. */
  readonly self: Pick<DeviceDescriptor, 'deviceId' | 'registrationId' | 'identityKey'>;
  /** La génération émettrice telle que le relais l'a vérifiée, posée HORS du message. */
  readonly relayedFrom: DeviceGenerationRef;
  /** La génération pair de la transaction ouverte pour ce `tx`, s'il y en a une. */
  readonly peer?: DeviceGenerationRef;
};

const refused = (cancel: 'unexpected-message' | 'unsupported'): VerificationReading => ({ verdict: 'refused', cancel });

const sameGeneration = (left: DeviceGenerationRef, right: DeviceGenerationRef): boolean =>
  left.deviceId === right.deviceId && left.registrationId === right.registrationId;

const declaresAnotherVersion = (raw: unknown): boolean =>
  typeof raw === 'object' && raw !== null && 'v' in raw && (raw as { v: unknown }).v !== DEVICE_VERIFICATION_VERSION;

export function readVerificationMessage(raw: unknown, context: ReceptionContext): VerificationReading {
  if (containsPrivateKeyField(raw)) return refused('unexpected-message');
  if (declaresAnotherVersion(raw)) return refused('unsupported');
  const parsed = deviceVerificationMessageSchema.safeParse(raw);
  if (!parsed.success) return refused('unexpected-message');
  const message = parsed.data;
  if (message.type !== 'request' && message.type !== 'accept') {
    return context.peer !== undefined && !sameGeneration(context.relayedFrom, context.peer)
      ? { verdict: 'ignored' }
      : { verdict: 'accepted', message };
  }
  if (message.from.userId !== context.account) return refused('unexpected-message');
  if (isSelfDescriptor(message.from, context.self)) return refused('unexpected-message');
  if (!sameGeneration(message.from, context.relayedFrom)) return refused('unexpected-message');
  return { verdict: 'accepted', message };
}
