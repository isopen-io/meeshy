import type { CanvasV3, SceneV3, ObjectV3, AudioVariantV3 } from '@meeshy/shared/types/canvas-v3';

/**
 * ÉCRITURE / VALIDATION — « ce blob est-il EXACTEMENT la v3 que je sais
 * valider ? » (#4774)
 *
 * `CanvasV3Schema` décrit la v3, pas la v4 : accepter à l'écriture un rang que
 * l'on ne sait pas valider revient à persister un document dont AUCUNE garde
 * n'a lu la forme. Ce prédicat existe donc à part de `isCanvasV3OrNewer`, et
 * les deux ne peuvent pas fusionner : **on lit avec tolérance ce que l'on
 * refuse d'écrire sans l'avoir validé** — un lecteur qui se durcit rend un
 * écran vide, un valideur qui se relâche grave en base ce qu'il n'a pas
 * compris.
 *
 * Le rang 3 ne les distingue PAS (leçon 261) : le seul témoin qui les sépare
 * se pose sur un rang supérieur (`storyEffectsV3.versionSense.test.ts`).
 */
export function isCanvasV3Exactly(blob: unknown): blob is CanvasV3 {
  return typeof blob === 'object' && blob !== null && (blob as { v?: unknown }).v === 3;
}

/**
 * LECTURE / RENDU — « ce blob est-il un document canvas, fût-il plus récent
 * que moi ? » (#4774)
 *
 * Un `v: 4` servi TEL QUEL à un client caps-3 (table O17) doit continuer d'être
 * LU comme un canvas : le rétrograder sur la branche v1 ne rend pas un rendu
 * dégradé, il rend le VIDE — la forme v1 (`textObjects`, `background`…) est
 * absente d'un document v3+. Miroir exact des deux ponts natifs
 * (`StoryModels.swift` `mark >= 3`, `StoryEffectsWireSerializer.kt` `mark < 3`)
 * et du web (`isCanvasV3OrNewer`, `apps/web/lib/story-transforms.ts`).
 *
 * Le rétrécissement vers `CanvasV3` est DÉLIBÉRÉMENT optimiste : un document
 * d'un rang supérieur se lit champ par champ à travers la lentille v3, ce qui
 * EST la tolérance au futur. La sévérité, elle, vit chez `isCanvasV3Exactly`.
 */
export function isCanvasV3OrNewer(blob: unknown): blob is CanvasV3 {
  if (typeof blob !== 'object' || blob === null) return false;
  const mark = (blob as { v?: unknown }).v;
  return typeof mark === 'number' && mark >= 3;
}

/**
 * @deprecated Alias historique d'`isCanvasV3Exactly`, conservé pour les deux
 * importateurs hors territoire de ce lot : `routes/posts/core.ts`
 * (`rejectNonV3StoryEffects` — sens ÉCRITURE, l'alias y est JUSTE) et
 * `StoryTextObjectTranslationService.ts` (`docIsV3` — sens LECTURE, l'alias y
 * est FAUX ; suivi #4774). Aucun site neuf ne l'appelle : on nomme son sens.
 */
export const isCanvasV3 = isCanvasV3Exactly;

const num = (v: unknown, d: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const str = (v: unknown): string | undefined => (typeof v === 'string' && v.length > 0 ? v : undefined);

const SCENE_ASPECT = 9 / 16;

function asArray(v: unknown): Record<string, unknown>[] {
  return Array.isArray(v) ? (v as Record<string, unknown>[]) : [];
}

function isPivot(v: unknown): v is { x: number; y: number } {
  return typeof v === 'object' && v !== null
    && typeof (v as { x?: unknown }).x === 'number'
    && typeof (v as { y?: unknown }).y === 'number';
}

function baseObject(
  o: Record<string, unknown>,
  kind: ObjectV3['kind'],
  plane: ObjectV3['plane'],
  fallbackZ: number
): ObjectV3 {
  const timing: NonNullable<ObjectV3['timing']> = {};
  // La fenêtre temporelle d'un objet ne s'émet QUE comme un intervalle valide.
  // Un blob v1 (qui n'a jamais porté l'invariant `end >= start`) avec
  // `startTime > endTime` sortait auparavant `timing: { start, end }` inversé —
  // que le contrat CanvasV3 (`TimingSchema`, itération 234/236) refuse à juste
  // titre. Comme pour l'audio `bounds`, le convertisseur reste tolérant : une
  // fenêtre inversée dégrade en « pas de fenêtre » (l'objet reste visible tout
  // du long), jamais en donnée corrompue servie aux clients v3. Une borne
  // partielle (une seule des deux) reste valide et passe telle quelle.
  const start = o.startTime;
  const end = o.endTime;
  const hasStart = typeof start === 'number' && Number.isFinite(start);
  const hasEnd = typeof end === 'number' && Number.isFinite(end);
  const invertedWindow = hasStart && hasEnd && (end as number) < (start as number);
  if (hasStart && !invertedWindow) timing.start = start as number;
  if (hasEnd && !invertedWindow) timing.end = end as number;
  if (Array.isArray(o.keyframes)) {
    timing.keyframes = o.keyframes as NonNullable<ObjectV3['timing']>['keyframes'];
  }
  const locale = str(o.sourceLanguage);
  return {
    id: str(o.id) ?? `${kind}-${fallbackZ}`,
    kind,
    anchor: { t: 'free', x: num(o.x, 0.5), y: num(o.y, 0.5) },
    plane,
    z: typeof o.zIndex === 'number' ? o.zIndex : fallbackZ,
    transform: { scale: num(o.scale, 1), rotation: num(o.rotation, 0), opacity: num(o.opacity, 1) },
    ...(Object.keys(timing).length ? { timing } : {}),
    ...(locale ? { locale } : {}),
    payload: {},
  };
}

function remapFreeAnchor(anchor: ObjectV3['anchor'], carrierAspect: number): ObjectV3['anchor'] {
  if (anchor.t !== 'free') return anchor;
  if (!Number.isFinite(carrierAspect) || carrierAspect <= 0) return anchor;
  if (carrierAspect > SCENE_ASPECT) {
    const h = SCENE_ASPECT / carrierAspect;
    const top = (1 - h) / 2;
    return { t: 'free', x: anchor.x, y: top + anchor.y * h };
  }
  if (carrierAspect < SCENE_ASPECT) {
    const w = carrierAspect / SCENE_ASPECT;
    const left = (1 - w) / 2;
    return { t: 'free', x: left + anchor.x * w, y: anchor.y };
  }
  return anchor;
}

export function convertV1ToV3(
  blob: Record<string, unknown>,
  context?: { content?: string | null }
): CanvasV3 {
  const objects: ObjectV3[] = [];
  let z = 0;

  if (str(blob.background)) {
    objects.push({
      ...baseObject({ id: 'bg' }, 'media', 'bg', z++),
      payload: { background: blob.background, transform: blob.backgroundTransform ?? null },
    });
  }

  const textObjects = asArray(blob.textObjects);
  for (const t of textObjects) {
    const o = baseObject(t, 'text', 'fg', z++);
    const {
      id: _i, x: _x, y: _y, scale: _s, rotation: _r, opacity: _op, zIndex: _z,
      startTime: _st, endTime: _e, keyframes: _k, sourceLanguage: _l,
      ...rest
    } = t;
    o.payload = rest;
    objects.push(o);
  }
  if (textObjects.length === 0) {
    const content = str(context?.content);
    const hasLegacyStyling =
      str(blob.textStyle) !== undefined ||
      str(blob.textColor) !== undefined ||
      typeof blob.textPosition === 'number';
    if (content && hasLegacyStyling) {
      const o = baseObject({ id: 'legacy-text', y: num(blob.textPosition, 0.5) }, 'text', 'fg', z++);
      o.payload = {
        text: content,
        ...(str(blob.textStyle) ? { textStyle: blob.textStyle } : {}),
        ...(str(blob.textColor) ? { textColor: blob.textColor } : {}),
      };
      objects.push(o);
    }
  }

  for (const m of asArray(blob.mediaObjects)) {
    const o = baseObject(m, 'media', 'content', z++);
    const volume = typeof m.volume === 'number' ? m.volume : undefined;
    const muted =
      typeof m.isMuted === 'boolean' ? m.isMuted
      : typeof m.muted === 'boolean' ? m.muted
      : volume !== undefined ? volume <= 0 : undefined;
    o.payload = {
      postMediaId: m.postMediaId ?? null,
      ...(str(m.mediaURL) ? { mediaURL: m.mediaURL } : {}),
      ...(str(m.mediaType) ? { mediaType: m.mediaType } : {}),
      ...(volume !== undefined ? { volume } : {}),
      ...(muted !== undefined ? { muted } : {}),
      ...(typeof m.loop === 'boolean' ? { loop: m.loop } : {}),
      ...(typeof m.isBackground === 'boolean' ? { isBackground: m.isBackground } : {}),
      ...(typeof m.duration === 'number' ? { duration: m.duration } : {}),
      ...(typeof m.aspectRatio === 'number' ? { aspectRatio: m.aspectRatio } : {}),
      ...(isPivot(m.anchor) ? { anchor: m.anchor } : {}),
    };
    objects.push(o);
  }

  for (const st of asArray(blob.stickerObjects)) {
    const o = baseObject(st, 'sticker', 'fg', z++);
    // `postMediaId`/`provider` : un sticker peut porter une IMAGE INTÉGRÉE au
    // post, pas seulement un glyphe. Ce convertisseur RECONSTRUIT le payload au
    // lieu de le transporter — omettre ces deux clés faisait donc perdre son
    // image à un sticker qui traverse le serveur, en silence.
    //
    // La spec O8 les attendait déjà ici : `unclaimedCanvasMediaIds` compte
    // `sticker` parmi les CLAIM_BEARING_KINDS et lit `payload.postMediaId`
    // (ci-dessous). Le convertisseur était simplement en retard sur elle.
    //
    // MÊME piège, deuxième morsure (#4741). Les stickers à GABARIT — pastille
    // de lieu, cadre de coeurs, ruban d'heure — portent leur dessin dans
    // `templateId` et leur texte dans `slots`. Sans ces deux clés, une
    // décoration qui traverse le serveur redevient son emoji de REPLI : le
    // composer dessine, le lecteur rend un glyphe.
    //
    // L'emoji continue de voyager, et c'est délibéré : il sert le lecteur dont
    // le build ne connaît pas ce `templateId`, qui verra un glyphe plutôt qu'un
    // trou. Mais un repli conservé SANS la chose dont il est le repli n'est
    // plus un repli — c'est le contenu.
    o.payload = {
      emoji: st.emoji,
      ...(str(st.templateId) ? { templateId: st.templateId } : {}),
      ...(st.slots && typeof st.slots === 'object' && !Array.isArray(st.slots)
        ? { slots: st.slots }
        : {}),
      ...(str(st.postMediaId) ? { postMediaId: st.postMediaId } : {}),
      ...(str(st.provider) ? { provider: st.provider } : {}),
      ...(typeof st.baseSize === 'number' ? { baseSize: st.baseSize } : {}),
      ...(str(st.anchorPoint) ? { anchorPoint: st.anchorPoint } : {}),
      ...(typeof st.fadeIn === 'number' ? { fadeIn: st.fadeIn } : {}),
      ...(typeof st.fadeOut === 'number' ? { fadeOut: st.fadeOut } : {}),
    };
    objects.push(o);
  }
  for (const emoji of Array.isArray(blob.stickers) ? blob.stickers : []) {
    if (typeof emoji !== 'string' || emoji.length === 0) continue;
    const o = baseObject({}, 'sticker', 'fg', z++);
    o.payload = { emoji };
    objects.push(o);
  }

  const strokes = Array.isArray(blob.drawingStrokes) ? blob.drawingStrokes : [];
  const drawingData = str(blob.drawingData);
  if (strokes.length > 0 || drawingData !== undefined) {
    const o = baseObject({ id: 'drawing' }, 'drawing', 'fg', z++);
    o.payload = {
      ...(strokes.length > 0 ? { strokes } : {}),
      ...(drawingData !== undefined ? { data: drawingData } : {}),
    };
    objects.push(o);
  }

  for (const L of asArray(blob.locationObjects)) {
    const o = baseObject(L, 'place', 'fg', z++);
    // MÊME piège, TROISIÈME morsure (#4832) — sur le FRÈRE du champ ci-dessus.
    // Le lot #4717 a donné un gabarit à la pastille de lieu : `styleId` nomme
    // le gabarit qui la DÉCORE. Sans lui, une pastille décorée qui traverse le
    // serveur redevient la pastille de BASE, et la perte est invisible parce
    // que cette pastille de base EST le repli d'un `styleId` absent.
    //
    // La forme du défaut n'est pas humaine : ce convertisseur RECOMPOSE la
    // charge clé par clé, donc chaque branche est un inventaire à tenir à jour
    // et toute clé ajoutée en amont s'y perd en silence. Le témoin qui
    // l'attraperait vraiment est un témoin d'EXHAUSTIVITÉ (#4833) — celui par
    // clé ne parle que des clés auxquelles on a déjà pensé.
    o.payload = {
      place: L.place ?? null,
      ...(str(L.styleId) ? { styleId: L.styleId } : {}),
    };
    objects.push(o);
  }
  for (const a of asArray(blob.audioPlayerObjects)) {
    const o = baseObject(a, 'audio', 'content', z++);
    o.payload = {
      postMediaId: str(a.postMediaId) ?? null,
      mediaURL: a.mediaURL ?? null,
      placement: a.placement ?? null,
      ...(str(a.soundId) ? { soundId: a.soundId } : {}),
      ...(str(a.soundAuthorUsername) ? { soundAuthorUsername: a.soundAuthorUsername } : {}),
      ...(str(a.name) ? { name: a.name } : {}),
      // `volume` est un champ VIVANT (F10) mais son défaut de décodage vaut 1
      // des deux côtés : l'omettre le restitue, l'émettre à 1 ferait diverger
      // le golden gelé de son propre convertisseur.
      ...(typeof a.volume === 'number' && a.volume !== 1 ? { volume: a.volume } : {}),
      ...(typeof a.isBackground === 'boolean' ? { isBackground: a.isBackground } : {}),
      ...(typeof a.loop === 'boolean' ? { loop: a.loop } : {}),
      ...(typeof a.duration === 'number' ? { duration: a.duration } : {}),
      ...(typeof a.fadeIn === 'number' ? { fadeIn: a.fadeIn } : {}),
      ...(typeof a.fadeOut === 'number' ? { fadeOut: a.fadeOut } : {}),
    };
    objects.push(o);
  }

  const filterTarget =
    objects.find(o => o.kind === 'media' && o.plane === 'content') ??
    objects.find(o => o.kind === 'media' && o.plane === 'bg');
  if (filterTarget && str(blob.filter)) {
    filterTarget.payload = {
      ...filterTarget.payload,
      filter: blob.filter,
      ...(typeof blob.filterIntensity === 'number' ? { filterIntensity: blob.filterIntensity } : {}),
    };
  }

  const carrierAspect = blob.canvasAspectRatio;
  const remapped = typeof carrierAspect === 'number'
    ? objects.map(o =>
        o.plane === 'bg' || o.kind === 'media'
          ? o
          : { ...o, anchor: remapFreeAnchor(o.anchor, carrierAspect) }
      )
    : objects;

  const scene: SceneV3 = { id: 's1', objects: remapped };
  // Le ratio du porteur SURVIT à la conversion (révision de S8). `remapFreeAnchor`
  // ci-dessus est affine, donc inversible — à condition de savoir ce que valait
  // le porteur. Le jeter rendait le recadrage définitif et faisait de l'édition
  // d'un ancien contenu une perte sèche. La clé v1 `canvasAspectRatio`, elle,
  // disparaît toujours : c'est la LETTRE de S8, tenue.
  //
  // Il ne compte PAS dans `sceneCarriesSomething` : un ratio sans objet ne fait
  // pas un contenu, et O3 interdit le cadre vide.
  if (typeof carrierAspect === 'number' && Number.isFinite(carrierAspect) && carrierAspect > 0) {
    scene.carrierAspect = carrierAspect;
  }
  if (typeof blob.timelineDuration === 'number') scene.timelineDuration = blob.timelineDuration;
  if (blob.opening && typeof blob.opening === 'object') scene.opening = blob.opening as Record<string, unknown>;
  if (blob.closing && typeof blob.closing === 'object') scene.closing = blob.closing as Record<string, unknown>;
  if (Array.isArray(blob.clipTransitions)) scene.clipTransitions = blob.clipTransitions as Record<string, unknown>[];
  const thumbHash = str(blob.thumbHash);
  if (thumbHash !== undefined) scene.thumbHash = thumbHash;

  const sceneCarriesSomething = remapped.length > 0
    || scene.thumbHash !== undefined
    || scene.timelineDuration !== undefined
    || scene.opening !== undefined
    || scene.closing !== undefined
    || (scene.clipTransitions?.length ?? 0) > 0;
  const doc: CanvasV3 = { v: 3, ...(sceneCarriesSomething ? { scenes: [scene] } : {}) };

  const transcriptions = asArray(blob.voiceTranscriptions)
    .flatMap(t => {
      const language = str(t.language);
      return language && typeof t.content === 'string'
        ? [{ language, content: t.content }]
        : [];
    });

  const variants = asArray(blob.backgroundAudioVariants)
    .flatMap((v): AudioVariantV3[] => {
      const postMediaId = str(v.postMediaId);
      const language = str(v.language);
      return postMediaId && language
        ? [{ postMediaId, language, isAutoGenerated: v.isAutoGenerated !== false }]
        : [];
    });

  const soundId = str(blob.backgroundAudioId);
  const own = str(blob.voiceAttachmentId);
  if (soundId || own || transcriptions.length > 0) {
    // `bounds` ne s'émet QUE comme un intervalle complet et valide. Un blob v1
    // qui ne porte qu'une seule borne (trim de début seul) donnait auparavant
    // `end: 0` via `num(..., 0)` — un intervalle qui finit AVANT de commencer,
    // que le contrat CanvasV3 (invariant `end >= start`) refuse à juste titre.
    // Le convertisseur est tolérant (spec « convertisseur v1→v3 tolérant ») :
    // une borne manquante ou inversée dégrade en « pas de trim » (clip entier),
    // jamais en donnée corrompue servie aux clients v3.
    const audioStart = blob.backgroundAudioStart;
    const audioEnd = blob.backgroundAudioEnd;
    doc.sound = {
      source: soundId ? { t: 'library', soundId } : { t: 'original' },
      volume: soundId || own ? num(blob.backgroundAudioVolume, 1) : 1,
      ...(typeof audioStart === 'number' && Number.isFinite(audioStart) &&
          typeof audioEnd === 'number' && Number.isFinite(audioEnd) &&
          audioEnd >= audioStart
        ? { bounds: { start: audioStart, end: audioEnd } }
        : {}),
      ...(transcriptions.length > 0 ? { transcriptions } : {}),
      ...(variants.length > 0 ? { variants } : {}),
    };
  }
  return doc;
}

/**
 * Claim des stickers posés (spec O8) — un objet `sticker`/`media` du canvas
 * v3 qui référence un média par id (`payload.mediaId`/`payload.postMediaId`,
 * chaîne non vide) doit le CLAIMER via `body.mediaIds`. Rend les ids
 * référencés qui MANQUENT à la liste claimée, dédupliqués, dans l'ordre de
 * scène. La propriété du média reste jugée par `claimableMediaWhere`
 * (PostService) — jamais dupliquée ici : cette fonction ne juge que
 * l'appartenance. Blob non-v3 ⇒ [] (l'archive v1 n'est pas concernée).
 *
 * Prédicat de LECTURE (#4774) : la garde ÉNUMÈRE un document, elle ne le
 * valide pas. La tolérance ne peut qu'AJOUTER des références à réclamer — un
 * rang inconnu lu strictement ferait échapper tout son canvas au claim.
 */
const CLAIM_BEARING_KINDS: ReadonlySet<string> = new Set(['sticker', 'media']);
const CLAIM_PAYLOAD_KEYS = ['mediaId', 'postMediaId'] as const;

export function unclaimedCanvasMediaIds(
  blob: unknown,
  claimedMediaIds: readonly string[]
): string[] {
  if (!isCanvasV3OrNewer(blob)) return [];
  const claimed = new Set(claimedMediaIds);
  const unclaimed: string[] = [];
  for (const scene of asArray((blob as { scenes?: unknown }).scenes)) {
    for (const object of asArray(scene.objects)) {
      if (typeof object.kind !== 'string' || !CLAIM_BEARING_KINDS.has(object.kind)) continue;
      const payload = typeof object.payload === 'object' && object.payload !== null
        ? (object.payload as Record<string, unknown>)
        : {};
      for (const key of CLAIM_PAYLOAD_KEYS) {
        const id = str(payload[key]);
        if (id !== undefined && !claimed.has(id) && !unclaimed.includes(id)) {
          unclaimed.push(id);
        }
      }
    }
  }
  return unclaimed;
}

/**
 * A7b (revue totale C6) — le pipeline de traduction des objets texte parle v3.
 *
 * Un texte v1 vit dans `textObjects[i]` ; un texte v3 vit dans
 * `scenes[].objects[kind=text]`, son texte sous `payload.text`, sa langue
 * d'origine sous `locale`, ses traductions sous `payload.translations`.
 * Les deux helpers ci-dessous sont la SEULE lecture de cette différence :
 * l'énumération (trigger + index de recherche + recomposition dérivée) et le
 * chemin de persistance Mongo (l'objet ciblé par ID, jamais par index aveugle
 * — une scène contient aussi des objets non-texte).
 */
export type StoryTranslatableText = {
  id?: string;
  text?: string;
  content?: string;
  sourceLanguage?: string;
  translations?: Record<string, string>;
  [key: string]: unknown;
};

/**
 * Prédicat de LECTURE (#4774) — un document d'un rang supérieur porte ses
 * textes là où la v3 les porte (`scenes[].objects[kind=text]`), jamais dans la
 * forme v1. Le lire strictement le ferait retomber sur `textObjects`, absent :
 * zéro texte traduit sur un document qui en a.
 */
export function storyTranslatableTexts(blob: unknown): StoryTranslatableText[] | undefined {
  if (isCanvasV3OrNewer(blob)) {
    const texts = asArray((blob as { scenes?: unknown }).scenes)
      .flatMap((scene) => asArray(scene.objects))
      .filter((object) => object.kind === 'text')
      .map((object): StoryTranslatableText => {
        const payload = typeof object.payload === 'object' && object.payload !== null
          ? (object.payload as Record<string, unknown>)
          : {};
        const translations = Object.fromEntries(
          Object.entries(
            typeof payload.translations === 'object' && payload.translations !== null
              ? (payload.translations as Record<string, unknown>)
              : {}
          ).filter((entry): entry is [string, string] => typeof entry[1] === 'string')
        );
        return {
          ...(str(object.id) !== undefined ? { id: str(object.id) } : {}),
          ...(typeof payload.text === 'string' ? { text: payload.text } : {}),
          ...(str(object.locale) !== undefined ? { sourceLanguage: str(object.locale) } : {}),
          ...(Object.keys(translations).length ? { translations } : {}),
        };
      });
    return texts.length > 0 ? texts : undefined;
  }
  const textObjects = typeof blob === 'object' && blob !== null
    ? (blob as { textObjects?: unknown }).textObjects
    : undefined;
  return Array.isArray(textObjects) ? (textObjects as StoryTranslatableText[]) : undefined;
}

/**
 * Prédicat de LECTURE (#4774) — et c'est ici que le rendre strict coûterait le
 * plus cher : sans chemin v3, l'appelant retombe sur le chemin v1
 * (`storyEffects.textObjects.$i.…`) et GRAVE une forme v1 dans un document
 * v3+. Un `$set` Mongo ne demande pas la permission au document qu'il modifie.
 */
export function translationSetPath(blob: unknown, objectId: string, lang: string): string | null {
  if (!isCanvasV3OrNewer(blob)) return null;
  const scenes = asArray((blob as { scenes?: unknown }).scenes);
  for (let s = 0; s < scenes.length; s++) {
    const o = asArray(scenes[s].objects).findIndex((object) => object.id === objectId);
    if (o >= 0) return `storyEffects.scenes.${s}.objects.${o}.payload.translations.${lang}`;
  }
  return null;
}

/**
 * Prédicat de LECTURE (#4774) — « c'est déjà un document canvas, ne le
 * convertis pas ». Le lire strictement enverrait un rang supérieur au
 * convertisseur v1→v3, qui n'y trouverait AUCUNE clé v1 et rendrait une
 * coquille : le serveur retirerait ce que le client savait afficher.
 */
export function convertStoryEffectsForWire(effects: unknown): unknown {
  if (effects == null) return effects;
  if (isCanvasV3OrNewer(effects)) return effects;
  if (typeof effects !== 'object') return effects;
  try {
    return convertV1ToV3(effects as Record<string, unknown>);
  } catch {
    return effects;
  }
}

/**
 * Le LECTEUR d'une charge utile, tel que la négociation O17 le connaît.
 *
 * `canvasCaps` vient de l'en-tête `X-Canvas-Caps` (absent = client legacy) ;
 * `readerLanguage` est la langue DÉJÀ résolue par le middleware d'auth
 * (`authContext.userLanguage` — le Prisme s'applique jusqu'à l'invite de mise
 * à jour). `broadcast` est l'exception temps réel F3 : une seule charge pour
 * une audience hétérogène, le blob part tel quel — la négociation se fait au
 * premier fetch REST de chaque client.
 */
export type WireReader = {
  readonly canvasCaps?: number;
  readonly readerLanguage?: string;
  readonly broadcast?: boolean;
};

export const WIRE_BROADCAST: WireReader = { broadcast: true };

export type WireForm = 'as-is' | 'convert' | 'sentinel';

/**
 * La table O17 (spec §C3 rév. 7), pure :
 * v1 + sans caps ⇒ tel quel (restitution garantie) ; v1 + caps ≥ 3 ⇒ converti
 * si `CANVAS_V3_READ` armé, sinon v1 ; v3-natif + caps ≥ 3 ⇒ v3 ; v3-natif +
 * sans caps ⇒ sentinelle. Le prédicat v3-natif est la MARQUE
 * (`isCanvasV3OrNewer`, sens LECTURE — #4774), jamais la validité du schéma :
 * un blob marqué mais invalide part tel quel aux clients capables (rendu
 * best-effort) et en sentinelle aux autres.
 */
export function resolveWireForm(
  blob: unknown,
  caps: number | undefined,
  readArmed: boolean
): WireForm {
  if (blob == null || typeof blob !== 'object') return 'as-is';
  const isV3Native = isCanvasV3OrNewer(blob);
  if (caps !== undefined && caps >= 3) {
    if (isV3Native) return 'as-is';
    return readArmed ? 'convert' : 'as-is';
  }
  return isV3Native ? 'sentinel' : 'as-is';
}

export function parseCanvasCaps(header: unknown): number | undefined {
  const raw = Array.isArray(header) ? header[0] : header;
  if (typeof raw !== 'string' || raw.length === 0) return undefined;
  const caps = Number(raw);
  return Number.isFinite(caps) ? caps : undefined;
}

export function wireReaderFromRequest(request: {
  readonly headers: { readonly [name: string]: unknown };
  readonly authContext?: { readonly userLanguage?: string };
}): WireReader {
  return {
    canvasCaps: parseCanvasCaps(request.headers['x-canvas-caps']),
    readerLanguage: request.authContext?.userLanguage,
  };
}

/**
 * Catalogue serveur de l'invite (repli fr). Local au service : la sentinelle
 * n'a qu'une phrase, un système i18n complet serait une dette pour rien.
 */
const UPGRADE_INVITES: Readonly<Record<string, string>> = {
  fr: 'Mets à jour Meeshy pour voir ce contenu',
  en: 'Update Meeshy to see this content',
  es: 'Actualiza Meeshy para ver este contenido',
  de: 'Aktualisiere Meeshy, um diesen Inhalt zu sehen',
  pt: 'Atualiza o Meeshy para ver este conteúdo',
  it: 'Aggiorna Meeshy per vedere questo contenuto',
  ar: 'حدِّث ميشي لرؤية هذا المحتوى',
};

/**
 * Un blob v1 GRAMMATICALEMENT VALIDE pour les vieux parseurs — fond `"RRGGBB"`
 * sans préfixe ni `#` (rév. 7). Généré à la lecture, jamais stocké.
 */
export function upgradeSentinel(readerLanguage: string | undefined): Record<string, unknown> {
  const base = (readerLanguage ?? 'fr').toLowerCase().split('-')[0];
  const text = UPGRADE_INVITES[base] ?? UPGRADE_INVITES['fr'];
  return {
    background: '1E1B4B',
    textObjects: [{
      id: 'upgrade-invite',
      text,
      textStyle: 'classic',
      x: 0.5,
      y: 0.45,
      scale: 1,
      rotation: 0,
      opacity: 1,
      zIndex: 0,
    }],
  };
}

/**
 * Applique la table O17 à UN post (racine ou `repostOf`). Active dès le merge
 * pour la sentinelle ; `CANVAS_V3_READ` (lu à chaque appel, défaut OFF) ne
 * gouverne que la conversion de l'archive v1. Règle 5 : un post à média
 * porteur ne reçoit pas de sentinelle — `storyEffects` est OMIS, le média se
 * lit tel quel.
 */
export function negotiateWireStoryEffects<T>(post: T, reader?: WireReader): T {
  if (reader?.broadcast === true) return post;
  const effects = (post as { storyEffects?: unknown }).storyEffects;
  if (effects == null) return post;
  const readArmed = process.env.CANVAS_V3_READ === '1';
  const form = resolveWireForm(effects, reader?.canvasCaps, readArmed);
  if (form === 'as-is') return post;
  if (form === 'convert') {
    return { ...post, storyEffects: convertStoryEffectsForWire(effects) };
  }
  const media = (post as { media?: unknown }).media;
  if (Array.isArray(media) && media.length > 0) {
    return { ...post, storyEffects: undefined };
  }
  return { ...post, storyEffects: upgradeSentinel(reader?.readerLanguage) };
}
