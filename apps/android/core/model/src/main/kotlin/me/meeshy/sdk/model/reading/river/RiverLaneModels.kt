package me.meeshy.sdk.model.reading.river

/**
 * La Rivière — types et constantes de la loi des couloirs. Miroir Kotlin de
 * `packages/shared/utils/river-lanes.ts` et de `RiverLaneResolver.swift` (iOS) : la rivière de
 * deux appareils différents est la même rivière ou n'est pas, d'où le rejeu des vecteurs
 * partagés (`fixtures/reading-modes/river-{lanes,step,headers}.vectors.json`).
 *
 * Deux axes : le TEMPS (un `rank` par message, ordre chronologique global) et les
 * INTERLOCUTEURS (un `laneIndex` par branche). Zéro pixel, zéro horloge : les horodatages
 * viennent des messages.
 */
object RiverLawConstants {
    /** Fenêtre de silence au bout de laquelle une branche s'éteint : 30 minutes. */
    const val LANE_SILENCE_WINDOW_MS: Double = 30.0 * 60.0 * 1000.0

    /** Largeur maximale de l'axe horizontal : 7 couloirs simultanés. */
    const val MAX_LANES: Int = 7

    /** Sous 3 voix, la rivière se sérialise : l'alternance suffit à suivre. */
    const val MIN_VOICES: Int = 3

    /** Sur combien de rangs le nom d'un couloir s'allume et s'éteint. */
    const val HEADER_FADE_RANKS: Int = 2
}

/** Un message tel que la Rivière a besoin de le connaître. [isSystem] : un avis n'est la voix de personne. */
data class RiverMessageInput(
    val id: String,
    val senderId: String,
    /** Millisecondes depuis l'epoch ; une valeur non finie est écartée (une bulle sans place dans le temps n'a pas de rang). */
    val createdAtMs: Double,
    val replyToMessageId: String? = null,
    val isSystem: Boolean = false,
)

/** [displayName] sert de GRAINE DE COULEUR ; la loi ne calcule aucune couleur. */
data class RiverParticipantInput(val id: String, val displayName: String)

data class ResolveRiverLanesInput(
    val messages: List<RiverMessageInput>,
    val participants: List<RiverParticipantInput>,
    /** Le lecteur : sa branche, quand elle existe, tient la colonne 0 (la rive). */
    val viewerId: String,
    val silenceWindowMs: Double? = null,
    val maxLanes: Int? = null,
    val minVoices: Int? = null,
    /** Décalage UTC du calendrier du lecteur, en minutes : sert seulement à trancher `isFirstInGroup` sur un changement de jour. */
    val dayBoundaryOffsetMinutes: Double? = null,
)

/** `BUBBLE` : son propriétaire a écrit ici ; `ADDRESSED` : on lui a répondu ici (branche reparue sans bulle). */
enum class RiverNodeKind(val wire: String) { BUBBLE("bubble"), ADDRESSED("addressed") }

data class RiverNode(val rank: Int, val kind: RiverNodeKind, val messageId: String)

/** Un segment de branche, de sa naissance à sa mort. [isOpen] : encore vivant en bas de la fenêtre. */
data class RiverLaneSpan(val startRank: Int, val endRank: Int, val isOpen: Boolean, val nodes: List<RiverNode>)

data class RiverLane(
    val laneId: String,
    /** Colonne réservée à vie tant que la rivière tient dans sa largeur ; au-delà, deux couloirs peuvent la partager. */
    val laneIndex: Int,
    val isViewer: Boolean,
    val colorSeed: String,
    val spans: List<RiverLaneSpan>,
)

data class RiverBubble(
    val messageId: String,
    val laneId: String,
    val laneIndex: Int,
    val rank: Int,
    val createdAtMs: Double,
    val isViewer: Boolean,
    val replyToMessageId: String?,
    /** Tête de groupe : la bulle porte l'en-tête d'identité. */
    val isFirstInGroup: Boolean,
    val isSystem: Boolean,
)

data class RiverConnector(
    val fromMessageId: String,
    val toMessageId: String,
    val fromLaneIndex: Int,
    val toLaneIndex: Int,
    val fromRank: Int,
    val toRank: Int,
)

/** `LANES` : la rivière tient sur ses deux axes ; `SERIALIZED` : le temps seul, c'est le fil. */
enum class RiverLayout(val wire: String) { LANES("lanes"), SERIALIZED("serialized") }

/** POURQUOI la rivière s'est sérialisée — jamais un simple booléen. */
enum class RiverSerializationReason(val wire: String) {
    BELOW_MINIMUM("belowMinimum"),
    ABOVE_MAXIMUM("aboveMaximum"),
}

data class RiverGeometry(
    val lanes: List<RiverLane>,
    /** Ordre chronologique STRICT — c'est aussi l'ordre d'accessibilité. */
    val bubbles: List<RiverBubble>,
    val connectors: List<RiverConnector>,
    val rankCount: Int,
    /** Nombre de COLONNES occupées (jamais `lanes.size` : elles se partagent). */
    val laneCount: Int,
    val voiceCount: Int,
    val layout: RiverLayout,
    val serializationReason: RiverSerializationReason?,
    val silenceWindowMs: Double,
    val maxLanes: Int,
    val minVoices: Int,
)

data class RiverCursor(val laneIndex: Int, val rank: Int)

enum class RiverStepDirection(val wire: String) {
    LEFT("left"), RIGHT("right"), UP("up"), DOWN("down");

    companion object {
        fun fromWire(raw: String): RiverStepDirection? = entries.firstOrNull { it.wire == raw }
    }
}

/** `MOVED` : le curseur a bougé ; `EDGE` : bord de l'axe, il ne bouge pas ; `EMPTY` : rien à parcourir. */
enum class RiverStepReason(val wire: String) { MOVED("moved"), EDGE("edge"), EMPTY("empty") }

data class RiverStep(val cursor: RiverCursor, val reason: RiverStepReason)

data class ResolveRiverStepInput(val geometry: RiverGeometry, val cursor: RiverCursor, val direction: RiverStepDirection)

/** Le nom en tête d'une colonne. [alpha] dans `]0, 1]`. */
data class RiverLaneHeader(
    val laneIndex: Int,
    val laneId: String,
    val colorSeed: String,
    val isViewer: Boolean,
    val alpha: Double,
)

data class ResolveRiverLaneHeadersInput(
    val geometry: RiverGeometry,
    /** Peut être fractionnaire : la peau le calcule depuis son défilement. */
    val focusRank: Double,
    val fadeRanks: Int? = null,
)
