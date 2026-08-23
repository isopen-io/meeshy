package me.meeshy.sdk.model

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonObject

/**
 * Le document `canvas v3` tel qu'il circule sur le fil.
 *
 * Le v3 est un format de TRANSPORT, jamais un format d'affichage : aucun
 * client ne le peint. iOS le décode puis le reprojette sur le modèle v1 qu'il
 * peignait déjà (`StoryModels.swift:1769-1774`), et Android fait de même
 * (`CanvasV3Projection.kt`) — le viewer existant n'a pas à changer d'une ligne.
 *
 * Seule la LECTURE est portée ici. Android continue d'écrire du v1, et
 * n'annoncera `X-Canvas-Caps: 3` que lorsque cette lecture sera livrée :
 * annoncer la capacité avant de savoir lire remplacerait la sentinelle
 * « Mets à jour Meeshy » — un blob v1 volontairement bien formé — par un écran
 * vide, c'est-à-dire une panne muette au lieu d'une dégradation lisible.
 *
 * Contrat de forme : `packages/shared/types/canvas-v3.ts`.
 * Toutes les valeurs portent un défaut : un document amputé doit dégrader,
 * jamais faire échouer le DOCUMENT ENTIER — la classe de défaut que la
 * tolérance des transitions et l'identifiant des keyframes ont déjà coûtée.
 */
@Serializable
data class CanvasV3(
    val v: Int = 3,
    val scenes: List<SceneV3> = emptyList(),
    val sound: BackgroundSoundV3? = null,
)

@Serializable
data class SceneV3(
    val id: String = "",
    val objects: List<ObjectV3> = emptyList(),
    val opening: JsonObject? = null,
    val closing: JsonObject? = null,
    val clipTransitions: List<JsonObject>? = null,
    val timelineDuration: Double? = null,
    val thumbHash: String? = null,
    /**
     * Ratio du PORTEUR d'origine, quand la scène provient d'une conversion v1.
     *
     * La conversion letterboxe les ancres (`y' = top + y·h`) ; la transformation
     * est affine, donc inversible — mais seulement si l'on sait encore ce que
     * valait le porteur. Un document v3 NATIF n'en a pas : il n'a jamais eu
     * d'autre porteur que sa scène, et rien ne doit alors bouger.
     */
    val carrierAspect: Double? = null,
)

@Serializable
data class ObjectV3(
    val id: String = "",
    val kind: String = "",
    val anchor: AnchorV3 = AnchorV3(),
    val plane: String = "content",
    val z: Int = 0,
    val transform: TransformV3 = TransformV3(),
    val timing: TimingV3? = null,
    val locale: String? = null,
    /** Permissif PAR CONTRAT : le schéma partagé ne le contraint pas. */
    val payload: JsonObject = JsonObject(emptyMap()),
)

/** `{"t":"free","x":…,"y":…}` ou `{"t":"band","edge":"top"|"bottom"}`. */
@Serializable
data class AnchorV3(
    val t: String = "free",
    val x: Double = 0.5,
    val y: Double = 0.5,
    val edge: String? = null,
)

@Serializable
data class TransformV3(
    val scale: Double = 1.0,
    val rotation: Double = 0.0,
    val opacity: Double = 1.0,
)

@Serializable
data class TimingV3(
    val start: Double? = null,
    val end: Double? = null,
    val rate: Double? = null,
    val keyframes: List<StoryKeyframe>? = null,
)

/**
 * Le son vit au DOCUMENT, pas dans la scène : depuis O3 une publication
 * purement sonore n'émet AUCUN cadre. Sa restitution doit donc précéder toute
 * garde de scène, sans quoi elle est sautée et le son disparaît.
 */
@Serializable
data class BackgroundSoundV3(
    val source: SoundSourceV3 = SoundSourceV3(),
    val volume: Double = 1.0,
    val bounds: SoundBoundsV3? = null,
    val variants: List<StoryAudioVariant>? = null,
    val transcriptions: List<StoryVoiceTranscription>? = null,
)

@Serializable
data class SoundSourceV3(
    val t: String = "original",
    val soundId: String? = null,
)

@Serializable
data class SoundBoundsV3(
    val start: Double = 0.0,
    val end: Double = 0.0,
)
