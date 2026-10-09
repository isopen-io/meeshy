/**
 * CE QU'UN SON DONNE À VOIR SUR UNE SCÈNE (#9737) — la règle UNIQUE, agnostique
 * du client : elle lit un objet du canvas v3 (`kind`, `payload`) et rien d'autre.
 *
 * - un objet audio de FOND (`payload.isBackground === true`) ne produit AUCUN
 *   pixel sur la scène : il se dit hors scène, par le crédit ;
 * - un objet audio de PREMIER PLAN se rend sur la scène en pastille, à la
 *   place, l'échelle et la rotation de l'objet, dans la forme que sa
 *   provenance décide (`sceneAudioChipForm`) ;
 * - tout autre objet n'est pas concerné (`null`).
 *
 * Source : `docs/product/meeshy-composer-modele.md`, loi 6 — ce qui ne produit
 * aucun pixel au rendu ne se pose pas sur le canvas. Miroir iOS :
 * `StoryAudioPlayerObject.isBackground` et `StoryAudioIdentity.form(of:)`.
 */
export type SceneAudioCarrier = {
  readonly kind: string;
  readonly payload: Readonly<Record<string, unknown>>;
};

export type SceneAudioPresence = 'offstage' | 'chip';

export function isBackgroundAudio(object: SceneAudioCarrier): boolean {
  return object.kind === 'audio' && object.payload.isBackground === true;
}

export function sceneAudioPresence(object: SceneAudioCarrier): SceneAudioPresence | null {
  if (object.kind !== 'audio') return null;
  return isBackgroundAudio(object) ? 'offstage' : 'chip';
}

const text = (value: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
};

/** `@auteur`, sans doubler un `@` déjà gravé. */
export function soundAuthorTag(username: unknown): string | undefined {
  const author = text(username)?.replace(/^@+/, '');
  return author === undefined || author === '' ? undefined : `@${author}`;
}

/**
 * LA FORME de la pastille — `soundId` décide, jamais la présence d'un titre :
 * un son CAPTÉ montre son onde (les échantillons gravés à la composition, vides
 * quand ils manquent) ; un son EMPRUNTÉ à la bibliothèque montre « titre ·
 * @auteur », sans onde.
 */
export type SceneAudioChipForm =
  | { readonly kind: 'recording'; readonly samples: readonly number[] }
  | { readonly kind: 'borrowed'; readonly label: string | undefined };

export function sceneAudioChipForm(object: SceneAudioCarrier): SceneAudioChipForm {
  const { payload } = object;
  if (text(payload.soundId) === undefined) {
    const raw = Array.isArray(payload.waveformSamples) ? payload.waveformSamples : [];
    return {
      kind: 'recording',
      samples: raw.filter((sample): sample is number => typeof sample === 'number' && Number.isFinite(sample)),
    };
  }
  const parts = [text(payload.name), soundAuthorTag(payload.soundAuthorUsername)].filter(
    (part): part is string => part !== undefined,
  );
  return { kind: 'borrowed', label: parts.length === 0 ? undefined : parts.join(' · ') };
}

/**
 * LA PROVENANCE DU SON DE FOND d'une scène — `null` : aucun fond, rien à
 * annoncer. La déclaration du document (`CanvasV3.sound.source.t`) prime ;
 * sinon l'objet de fond : `soundId` posé ⇒ bibliothèque, absent ⇒ piste propre.
 */
export type BackgroundSoundProvenance = 'original' | 'library';

export function backgroundAudioOf<T extends SceneAudioCarrier>(objects: readonly T[]): T | undefined {
  return objects.find(isBackgroundAudio);
}

export function backgroundSoundProvenance(params: {
  readonly documentSound: unknown;
  readonly objects: readonly SceneAudioCarrier[];
}): BackgroundSoundProvenance | null {
  const sound = params.documentSound;
  if (typeof sound === 'object' && sound !== null) {
    const source = (sound as { readonly source?: unknown }).source;
    if (typeof source === 'object' && source !== null) {
      const t = (source as { readonly t?: unknown }).t;
      if (t === 'library' || t === 'original') return t;
    }
  }
  const object = backgroundAudioOf(params.objects);
  if (object === undefined) return null;
  return text(object.payload.soundId) === undefined ? 'original' : 'library';
}
