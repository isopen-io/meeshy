/**
 * Extraction des frames binaires ZMQ multipart (audio traduit + embedding vocal).
 *
 * Le Translator envoie les résultats `audio_process_completed` en multipart :
 * Frame 1 = métadonnées JSON, Frames 2+ = binaires. La métadonnée porte un dict
 * `binaryFrames` mappant chaque clé logique (`audio_<lang>`, `embedding`) vers sa
 * position **1-based** dans le message multipart. Le tableau `Buffer[]` reçu par
 * le gateway ne contient que les frames binaires (sans la frame métadonnée), donc
 * l'index doit être décrémenté de 1 pour indexer le tableau — c'est le point
 * fragile (off-by-one) que ce helper isole et rend testable.
 *
 * NB : le type déclaré `BinaryFrameInfo` dans `../types` décrit une forme
 * différente (champs fixes `audio?`/`embedding?`) et ne correspond pas à la forme
 * runtime dict-par-clé du chemin `audio_process_completed` ; d'où le type local.
 */

/** Descripteur d'un frame binaire tel qu'émis par le Translator (index 1-based). */
export type AudioBinaryFrameDescriptor = {
  index: number;
  size: number;
  mimeType?: string;
};

/** Dict `binaryFrames` de la métadonnée : clé logique → descripteur. */
export type AudioBinaryFramesMetadata = Record<string, AudioBinaryFrameDescriptor>;

export type AudioBinaryExtraction = {
  /** Audios traduits, indexés par code langue (clé `audio_<lang>` sans le préfixe). */
  audioBinaries: Map<string, Buffer>;
  /** Embedding vocal (`embedding`) s'il est présent, sinon `null`. */
  embeddingBinary: Buffer | null;
  /** Clés dont l'index pointe hors du tableau `binaryFrames` (à logger côté appelant). */
  invalidFrameKeys: string[];
};

/**
 * Extrait les buffers audio traduits et l'embedding vocal depuis les frames
 * binaires multipart, en appliquant la conversion d'index 1-based → 0-based.
 *
 * Zéro-copie : les buffers retournés sont les mêmes références que celles du
 * tableau `binaryFrames` (aucun décodage, aucune allocation). Toute clé dont
 * l'index résolu tombe hors des bornes est ignorée et remontée dans
 * `invalidFrameKeys` — jamais d'accès `undefined`, jamais de crash.
 */
export function extractAudioBinaryFrames(
  binaryFramesInfo: AudioBinaryFramesMetadata | null | undefined,
  binaryFrames: Buffer[]
): AudioBinaryExtraction {
  const audioBinaries = new Map<string, Buffer>();
  let embeddingBinary: Buffer | null = null;
  const invalidFrameKeys: string[] = [];

  for (const [key, info] of Object.entries(binaryFramesInfo ?? {})) {
    const frameIndex = info.index - 1; // Les indices dans metadata commencent à 1, array à 0

    if (frameIndex < 0 || frameIndex >= binaryFrames.length) {
      invalidFrameKeys.push(key);
      continue;
    }

    if (key.startsWith('audio_')) {
      audioBinaries.set(key.replace('audio_', ''), binaryFrames[frameIndex]);
    } else if (key === 'embedding') {
      embeddingBinary = binaryFrames[frameIndex];
    }
  }

  return { audioBinaries, embeddingBinary, invalidFrameKeys };
}
