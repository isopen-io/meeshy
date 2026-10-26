/**
 * **L'EMPREINTE D'UN CLAIR PHOTOGRAPHIÉ** (#12992, audit adversarial du lot) —
 * ce que ce navigateur retient d'un message en clair qu'il tenait avant
 * d'apprendre le bout en bout : son identifiant ET tout ce qui se rend de lui
 * (`PRINT_COVERS`). Retenir l'identifiant seul laissait une passerelle
 * compromise réécrire un ancien message en gardant son id et sa date.
 *
 * SHA-256 synchrone, tronqué à 64 bits : la passerelle connaît le clair
 * d'origine (elle l'a servi), une empreinte non cryptographique se
 * contournerait par seconde préimage. Synchrone parce que le fil, la ligne de
 * liste et l'aperçu tranchent au rendu.
 */

const K = Array.from({ length: 64 }, (_, index) => {
  const primes: number[] = [];
  for (let candidate = 2; primes.length <= index; candidate += 1) if (primes.every((prime) => candidate % prime !== 0)) primes.push(candidate);
  const root = Math.cbrt(primes[index]!);
  return ((root - Math.floor(root)) * 2 ** 32) >>> 0;
});

const INITIAL = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19] as const;

const rotate = (value: number, by: number): number => (value >>> by) | (value << (32 - by));

function compress(state: number[], words: Uint32Array): void {
  const w = new Uint32Array(64);
  w.set(words);
  for (let t = 16; t < 64; t += 1) {
    const s0 = rotate(w[t - 15]!, 7) ^ rotate(w[t - 15]!, 18) ^ (w[t - 15]! >>> 3);
    const s1 = rotate(w[t - 2]!, 17) ^ rotate(w[t - 2]!, 19) ^ (w[t - 2]! >>> 10);
    w[t] = (w[t - 16]! + s0 + w[t - 7]! + s1) >>> 0;
  }
  let [a, b, c, d, e, f, g, h] = state as [number, number, number, number, number, number, number, number];
  for (let t = 0; t < 64; t += 1) {
    const t1 = (h + (rotate(e, 6) ^ rotate(e, 11) ^ rotate(e, 25)) + ((e & f) ^ (~e & g)) + K[t]! + w[t]!) >>> 0;
    const t2 = ((rotate(a, 2) ^ rotate(a, 13) ^ rotate(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) >>> 0;
    [h, g, f, e, d, c, b, a] = [g, f, e, (d + t1) >>> 0, c, b, a, (t1 + t2) >>> 0];
  }
  [a, b, c, d, e, f, g, h].forEach((value, index) => {
    state[index] = (state[index]! + value) >>> 0;
  });
}

/** SHA-256 d'une chaîne (UTF-8), en hexadécimal. */
export function sha256Hex(text: string): string {
  const bytes = new TextEncoder().encode(text);
  const length = Math.ceil((bytes.length + 9) / 64) * 64;
  const padded = new Uint8Array(length);
  padded.set(bytes);
  padded[bytes.length] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(length - 8, Math.floor((bytes.length * 8) / 2 ** 32));
  view.setUint32(length - 4, (bytes.length * 8) >>> 0);
  const state = [...INITIAL];
  for (let offset = 0; offset < length; offset += 64) {
    compress(state, Uint32Array.from({ length: 16 }, (_, index) => view.getUint32(offset + index * 4)));
  }
  return state.map((word) => word.toString(16).padStart(8, '0')).join('');
}

/**
 * **CE QU'UNE EMPREINTE COUVRE, ET RIEN D'AUTRE NE SE REND** (revue de sécurité
 * du lot) — tout champ d'un message qui porte du CONTENU : texte, traductions,
 * pièces ENTIÈRES (url, nom, type, aperçus, transcriptions), lieu, sticker,
 * métadonnées, story citée, liens suivis, mentions, provenance d'un transfert,
 * régime. Un clair d'avant l'activation reconnu par son empreinte se rend avec
 * son identité et CES SEULS champs (`verifiedForm`, `view/end-to-end-sealed.ts`) :
 * un champ que la passerelle ajouterait ou changerait à côté ne passe pas, et
 * une seule valeur changée parmi eux défait l'empreinte — le message se scelle.
 */
export const PRINT_COVERS = [
  'content', 'translations', 'attachments', 'location', 'sticker', 'metadata', 'postReplyTo', 'trackingLinks',
  'validatedMentions', 'mentionedUsers', 'forwardedFromId', 'forwardedFromConversationId', 'forwardedFromConversation',
  'storyReplyToId', 'isEncrypted', 'encryptionMode', 'encryptedContent', 'encryptionMetadata',
] as const;

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> => typeof value === 'object' && value !== null;

/** JSON canonique : clés triées à toute profondeur, dates en ISO (`toJSON`), `undefined` omis comme le fait le stockage. */
function canonical(value: unknown): unknown {
  if (value instanceof Date) return value.toJSON();
  if (Array.isArray(value)) return value.map(canonical);
  if (!isRecord(value)) return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .filter((key) => value[key] !== undefined)
      .map((key) => [key, canonical(value[key])] as const),
  );
}

/** Les traductions ne se distinguent pas par leur ordre. */
const orderedTranslations = (value: unknown): unknown =>
  Array.isArray(value) ? value.map((translation) => JSON.stringify(canonical(translation))).sort() : value;

/** `id:empreinte` — `null` pour une ligne sans identifiant. */
export function clearPrintOf(row: object): string | null {
  const message = row as Readonly<Record<string, unknown>>;
  if (typeof message.id !== 'string') return null;
  const covered = Object.fromEntries(PRINT_COVERS.map((key) => [key, key === 'translations' ? orderedTranslations(message[key]) : message[key]] as const));
  return `${message.id}:${sha256Hex(JSON.stringify(canonical(covered))).slice(0, 16)}`;
}
