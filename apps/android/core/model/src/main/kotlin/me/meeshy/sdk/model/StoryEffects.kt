package me.meeshy.sdk.model

import kotlinx.serialization.EncodeDefault
import kotlinx.serialization.ExperimentalSerializationApi
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.Transient

/**
 * Story canvas models — port of StoryModels.swift.
 *
 * The client-side edit-command machinery (EditCommand, AddClipCommand, …,
 * AnyEditCommand, TimelineProject) is intentionally not ported: it is undo/redo
 * editor logic with no wire representation.
 */

/** Photo filter preset for a story slide — port of StoryFilter (StoryModels.swift). */
@Serializable
enum class StoryFilter {
    @SerialName("vintage") VINTAGE,
    @SerialName("bw") BW,
    @SerialName("warm") WARM,
    @SerialName("cool") COOL,
    @SerialName("dramatic") DRAMATIC,
    @SerialName("vivid") VIVID,
    @SerialName("fade") FADE,
    @SerialName("chrome") CHROME,
}

/** Normalised text anchor position — port of StoryTextPosition (StoryModels.swift). */
@Serializable
data class StoryTextPosition(
    val x: Double = 0.5,
    val y: Double = 0.5,
)

/** The full effects payload for a story slide — port of StoryEffects (StoryModels.swift). */
@OptIn(ExperimentalSerializationApi::class)
@Serializable
data class StoryEffects(
    val background: String? = null,
    val textStyle: String? = null,
    val textColor: String? = null,
    val textPosition: String? = null,
    val filter: String? = null,
    val filterIntensity: Double? = null,
    val stickers: List<String>? = null,
    val textAlign: String? = null,
    val textSize: Double? = null,
    val textBg: String? = null,
    val textOffsetY: Double? = null,
    @Serializable(with = StoryStickerListSerializer::class)
    val stickerObjects: List<StorySticker>? = null,
    val textPositionPoint: StoryTextPosition? = null,
    val backgroundAudioId: String? = null,
    val backgroundAudioVolume: Float? = null,
    val backgroundAudioStart: Double? = null,
    val backgroundAudioEnd: Double? = null,
    val voiceAttachmentId: String? = null,
    val voiceTranscriptions: List<StoryVoiceTranscription>? = null,
    @Serializable(with = StoryTransitionTolerantSerializer::class)
    val opening: StoryTransitionEffect? = null,
    @Serializable(with = StoryTransitionTolerantSerializer::class)
    val closing: StoryTransitionEffect? = null,
    @Serializable(with = StoryTextObjectListSerializer::class)
    val textObjects: List<StoryTextObject> = emptyList(),
    /** Pastilles de lieu posées sur la slide — distinctes du lieu de la PUBLICATION. */
    @EncodeDefault(EncodeDefault.Mode.NEVER)
    @Serializable(with = StoryLocationObjectListSerializer::class)
    val locationObjects: List<StoryLocationObject> = emptyList(),
    @Serializable(with = StoryMediaObjectListSerializer::class)
    val mediaObjects: List<StoryMediaObject>? = null,
    @Serializable(with = StoryAudioPlayerObjectListSerializer::class)
    val audioPlayerObjects: List<StoryAudioPlayerObject>? = null,
    /**
     * Editable freehand strokes — parity with iOS `StoryEffects.drawingStrokes`. On
     * the v1 wire they sit at this flat key; on the v3 wire they ride the
     * `kind:"drawing"` scene object's `payload.strokes`, projected back here by
     * [CanvasV3Projection]. The legacy PKDrawing blob (`drawingData` on iOS) has no
     * Android renderer and is not modelled — a future writer's base64 `data` is read
     * as nothing to paint, never as a decode failure.
     */
    @Serializable(with = StoryDrawingStrokeListSerializer::class)
    val drawingStrokes: List<StoryDrawingStroke>? = null,
    val backgroundAudioVariants: List<StoryAudioVariant>? = null,
    val thumbHash: String? = null,
    val backgroundTransform: StoryBackgroundTransform? = null,
    val slideDuration: Float? = null,
    /**
     * Author-pinned slide duration (seconds) set via the timeline editor — the
     * priority-0 override in [StorySlideDuration]. Distinct from the legacy
     * [slideDuration], which carries arbitrary backend values and is ignored.
     * `null` for everything published before the timeline editor existed, so the
     * duration falls back to the content-derived rule with zero regression.
     */
    val timelineDuration: Double? = null,
    @Serializable(with = StoryClipTransitionListSerializer::class)
    val clipTransitions: List<StoryClipTransition>? = null,
    val musicTrackId: String? = null,
    val musicStartTime: Double? = null,
    val musicEndTime: Double? = null,
    /**
     * L'agencement choisi par l'AUTEUR de la publication (#6514), que seul un
     * document canvas v3 déclare (`CanvasV3.layout`) et que
     * [StoryEffects.Companion.rendering] recopie ici. `null` pour tout le corpus
     * antérieur ; on le lit par [resolvedLayout], jamais en direct.
     *
     * Il n'a pas de famille v1 : la forme v1 ne le porte que parce qu'Android
     * réécrit `storyEffects` en v1 (le cache Room des stories), et que la
     * relecture doit rendre la même mise en page, comme iOS qui garde
     * `document?.layout` en réencodant (`CanvasV3(migrating:keeping:)`). Nul par
     * défaut, il n'est jamais émis par un contenu composé sur Android.
     */
    val layout: MosaicLayoutMode? = null,
    /**
     * Les kinds d'objet v3 que ce build ne sait pas peindre (document plus récent). Mémo de
     * lecture : jamais écrit sur le fil v1 — voir [carriesUnpaintableContent].
     */
    @Transient
    val unpaintableKinds: List<String> = emptyList(),
    /**
     * Les objets v3 eux-mêmes (kind réservé, mention), gardés pour être réémis tels quels :
     * aucun composer ne les édite, leur retrait ne peut donc jamais être une volonté de l'auteur.
     */
    @Transient
    val unpaintableObjects: List<ObjectV3> = emptyList(),
)
