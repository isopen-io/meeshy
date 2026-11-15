/**
 * Codec du curseur opaque `/sync` — extrait tel quel de `routes/sync.ts`
 * (issue #4171, critère 5g : extraire AVANT d'ajouter, le fichier était à
 * 1035/1100 lignes et cette issue ajoute trois collections).
 *
 * Le token reste un base64url d'un JSON versionné `{ v: 1, ...positions }`.
 * `SyncCursor` est désormais une carte OUVERTE (`{ [flux: string]:
 * CursorKey | undefined }`) plutôt que le triplet figé `{c?; d?; h?}` d'avant
 * ce lot : les trois nouvelles collections (conversations, reactions,
 * participants) ont chacune leurs PROPRES flux keyset — `c`/`d` pour
 * conversations et participants, `c` seul pour reactions — et chaque
 * collection encode son curseur dans SON PROPRE `nextCursor` (jamais un
 * jeton partagé entre collections, donc aucun risque de collision de nom de
 * flux entre elles). La généralisation est un SURENSEMBLE pur du comportement
 * `{c,d,h}` d'avant : tout token déjà émis se décode à l'identique, et
 * `decodeSyncCursor(token).c` reste valide pour un client déjà en vol sur les
 * messages.
 */

export type CursorKey = { u: string; i: string };

/** Position keyset PAR FLUX NOMMÉ — chaque collection choisit ses propres clés. */
export type SyncCursor = { readonly [flux: string]: CursorKey | undefined };

/** Encode une position keyset en token opaque (base64url JSON versionné). */
export function encodeSyncCursor(cursor: SyncCursor): string {
  const payload: Record<string, unknown> = { v: 1 };
  for (const [flux, key] of Object.entries(cursor)) {
    if (key) payload[flux] = key;
  }
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

/**
 * Décode un token opaque ; jette sur version/forme/date invalide (→ 400).
 *
 * Un flux ABSENT du token reste FACULTATIF : un client déjà en vol porte un
 * token sans le flux d'une collection qui n'existait pas encore à l'émission
 * du token, et le rejeter ferait repartir sa fenêtre de zéro pour un champ
 * purement additif. Un flux absent démarre simplement au plancher `since`, ce
 * qui est la position correcte pour un client qui n'avait jamais rien reçu de
 * ce flux.
 */
export function decodeSyncCursor(token: string): SyncCursor {
  const parsed = JSON.parse(Buffer.from(token, 'base64url').toString('utf8')) as Record<string, unknown>;
  if (parsed.v !== 1) throw new Error('unsupported cursor version');
  const out: Record<string, CursorKey> = {};
  for (const [flux, value] of Object.entries(parsed)) {
    if (flux === 'v' || value === undefined) continue;
    if (typeof value !== 'object' || value === null) throw new Error('malformed cursor key');
    const { u, i } = value as Record<string, unknown>;
    if (typeof u !== 'string' || typeof i !== 'string') throw new Error('malformed cursor key');
    if (Number.isNaN(new Date(u).getTime())) throw new Error('malformed cursor date');
    out[flux] = { u, i };
  }
  return out;
}
