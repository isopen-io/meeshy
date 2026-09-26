import { CLAIM_PAYLOAD_KEYS, isCanvasV3OrNewer } from './storyEffectsV3';

const OBJECT_ID = /^[a-f0-9]{24}$/;

function records(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.filter((v): v is Record<string, unknown> => typeof v === 'object' && v !== null)
    : [];
}

function payloadOf(object: Record<string, unknown>): Record<string, unknown> {
  const payload = object['payload'];
  return typeof payload === 'object' && payload !== null ? (payload as Record<string, unknown>) : {};
}

/**
 * Tous les `PostMedia` qu'un canvas v3 RÉFÉRENCE — toute scène, tout `kind`
 * (une piste `audio` porte aussi `payload.postMediaId`), plus les variantes TTS
 * du son de scène.
 *
 * Pourquoi le serveur les relit (#8012) : un média pré-téléversé par le
 * composer iOS garde son id dans le canvas mais ne figure pas dans `mediaIds`.
 * Non rattaché, il restait `postId: null` — invisible de la capture de sons
 * (scopée au post) et SUPPRIMÉ, octets compris, par `sweepPendingPostMedia`
 * vingt-quatre heures plus tard. Le rattachement reste soumis à la garde de
 * propriété de l'appelant (`claimableMediaWhere`) : lire le canvas n'autorise
 * rien de plus que lister l'id dans `mediaIds`.
 */
export function canvasReferencedMediaIds(blob: unknown): string[] {
  if (!isCanvasV3OrNewer(blob)) return [];
  const doc = blob as unknown as Record<string, unknown>;
  const fromObjects = records(doc['scenes'])
    .flatMap((scene) => records(scene['objects']))
    .flatMap((object) => CLAIM_PAYLOAD_KEYS.map((key) => payloadOf(object)[key]));
  const sound = typeof doc['sound'] === 'object' && doc['sound'] !== null
    ? (doc['sound'] as Record<string, unknown>)
    : {};
  const fromVariants = records(sound['variants']).map((variant) => variant['postMediaId']);
  const ids = [...fromObjects, ...fromVariants]
    .filter((id): id is string => typeof id === 'string' && OBJECT_ID.test(id));
  return [...new Set(ids)];
}

/**
 * `mediaIds` de la requête, dans SON ordre (l'ordre de sélection de l'auteur),
 * suivis des médias que seul le canvas référence — hormis ceux que le post
 * porte déjà (`alreadyLinked`, à l'édition), qui n'ont rien à réclamer.
 */
export function withCanvasMedia(
  mediaIds: readonly string[] | undefined,
  storyEffects: unknown,
  alreadyLinked: ReadonlySet<string> = new Set(),
): string[] | undefined {
  const requested = mediaIds ?? [];
  const canvasOnly = canvasReferencedMediaIds(storyEffects)
    .filter((id) => !requested.includes(id) && !alreadyLinked.has(id));
  if (canvasOnly.length === 0) return mediaIds === undefined ? undefined : [...requested];
  return [...requested, ...canvasOnly];
}
