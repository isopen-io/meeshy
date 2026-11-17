/**
 * Sépare la charge de chiffrement d'un envoi en ce qui se PERSISTE sur la ligne
 * `Message` (le marqueur et les métadonnées) et ce qui ne s'y écrit JAMAIS :
 * le relais libsignal (#3706), dont les enveloppes vont dans `MessageEnvelope`,
 * une par appareil. `encryptionMetadata` a une borne de 8 Ko et chaque appareil
 * lirait celles des autres : c'est l'alternative rejetée par la décision
 * passerelle du 2026-10-23.
 *
 * La métadonnée gardée est une LISTE BLANCHE posée par la passerelle (constat
 * GW-12 de la revue E2EE du 2026-11-17, #18906 ; #9998) : le protocole,
 * l'appareil émetteur et l'époque du régime, chacun de son type, sous le mode
 * `e2ee` que la passerelle affirme elle-même — un chiffré n'est admis qu'en
 * conversation `e2ee`, et un `mode` glissé dans la métadonnée libre ne le
 * remplace plus. La ligne d'un envoi relayé porte le marqueur `libsignal-v1`,
 * jamais la chaîne que le client aurait posée à sa place. Tout le reste est
 * RETENU, jamais refusé : un client plus récent qui ajoute une clé ne perd pas
 * son message (#9223). `onWithheld` reçoit les NOMS des clés retenues, jamais
 * leurs valeurs, qui pourraient porter du clair.
 */
import type { Prisma } from '@meeshy/shared/prisma/client';
import { LIBSIGNAL_PROTOCOL, type E2EERelayRequest } from '@meeshy/shared/types/e2ee-directory';
import type { MessageRequest } from '@meeshy/shared/types/messaging';

/**
 * La langue que porte la LIGNE d'un message chiffré de bout en bout : le défaut
 * de la colonne, une constante qui ne dit rien du message. Le client déclare
 * parfois la sienne ; la passerelle ne l'écrit pas (GW-12). La langue réelle
 * voyage DANS le contenu chiffré (`E2EEContent.language`), et c'est déjà la
 * valeur que portent les envois d'iPhone et d'Android, qui n'en déclarent aucune.
 */
export const E2EE_ROW_ORIGINAL_LANGUAGE = 'fr';

export type PersistableEncryption = {
  readonly encryptedContent?: string;
  readonly encryptionMetadata?: Prisma.InputJsonValue;
  readonly e2eeRelay?: E2EERelayRequest;
};

const isNonNegativeInteger = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) >= 0;

/** Les clés gardées, et ce que chacune doit être pour l'être. Une `Map` : aucune clé héritée (`constructor`…) n'y passe. */
const KEPT: ReadonlyMap<string, (value: unknown) => boolean> = new Map<string, (value: unknown) => boolean>([
  ['protocol', (value) => value === LIBSIGNAL_PROTOCOL],
  ['senderDeviceId', isNonNegativeInteger],
  ['regimeEpoch', isNonNegativeInteger],
]);

/** Ce que la composition de la charge pose elle-même : le chiffré part dans `encryptedContent`, le mode est affirmé, le relais ne s'écrit pas. */
const COMPOSED: ReadonlySet<string> = new Set(['ciphertext', 'mode', 'relay']);

export function persistableEncryption(
  payload: MessageRequest['encryptedPayload'],
  options: { readonly onWithheld?: (keys: readonly string[]) => void } = {},
): PersistableEncryption {
  if (!payload) return {};
  const fields = payload as unknown as Readonly<Record<string, unknown>>;
  const declared = Object.keys(fields).filter((key) => !COMPOSED.has(key) && fields[key] !== undefined);
  const kept = declared.filter((key) => KEPT.get(key)?.(fields[key]) ?? false);
  // Un envoi relayé n'a pas de chiffré sur sa ligne : ses chiffrés sont ses
  // enveloppes. La ligne porte le marqueur que tout client publié envoie, jamais
  // une autre chaîne, qui y resterait lisible.
  const relayed = Boolean(payload.relay);
  const ciphertextWithheld = relayed && payload.ciphertext !== LIBSIGNAL_PROTOCOL;
  const withheld = [...(ciphertextWithheld ? ['ciphertext'] : []), ...declared.filter((key) => !kept.includes(key))];
  if (withheld.length > 0) options.onWithheld?.(withheld);
  return {
    encryptedContent: relayed ? LIBSIGNAL_PROTOCOL : payload.ciphertext,
    encryptionMetadata: { mode: 'e2ee', ...Object.fromEntries(kept.map((key) => [key, fields[key]])) } as Prisma.InputJsonValue,
    ...(payload.relay ? { e2eeRelay: payload.relay } : {}),
  };
}
