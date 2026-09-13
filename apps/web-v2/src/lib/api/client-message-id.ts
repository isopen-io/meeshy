/**
 * L'IDENTIFIANT CLIENT D'UN ENVOI (#5813, étape 1) — même contrat que
 * `@meeshy/shared/utils/client-message-id` (`CLIENT_MESSAGE_ID_REGEX`,
 * D-14), une implémentation LOCALE : ce module partagé importe
 * `randomUUID` de `'crypto'` (Node) et ne peut donc pas entrer dans le
 * bundle navigateur (§ 3.3 de la spécification #5813). `crypto.getRandomValues`
 * est disponible partout où ce fichier s'exécute (web, WebView Capacitor) —
 * jamais `crypto.randomUUID`, absent en contexte non sécurisé et sur
 * d'anciennes WebView Android.
 *
 * Format : `cid_<UUID v4 minuscule>` — les bits de VERSION (`0100` sur
 * l'octet 6) et de VARIANTE (`10` sur les deux bits de poids fort de
 * l'octet 8) sont posés à la main, comme l'exige la forme que
 * `CLIENT_MESSAGE_ID_REGEX` valide.
 */
const HEX = Array.from({ length: 256 }, (_, i) => i.toString(16).padStart(2, '0'));

export function newClientMessageId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;

  const hex = Array.from(bytes, (b) => HEX[b]).join('');
  const uuid = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  return `cid_${uuid}`;
}
