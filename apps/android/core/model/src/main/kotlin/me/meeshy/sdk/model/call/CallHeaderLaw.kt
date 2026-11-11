package me.meeshy.sdk.model.call

import me.meeshy.sdk.model.call.frames.CallFrameConversationInfo
import me.meeshy.sdk.model.call.frames.CallFrameTextsRule

/** Les boutons de l'en-tête, de gauche à droite (#17329, miroir de iOS `CallHeaderAction`). */
enum class CallHeaderAction { Minimize, PictureInPicture, Conversation }

data class CallHeaderContext(
    val canEnterPictureInPicture: Boolean,
    val isPictureInPictureActive: Boolean,
    val hasConversation: Boolean,
)

enum class CallHeaderCapsuleLayout { Audio, Video, Group }

data class CallHeaderCapsuleInput(
    val layout: CallHeaderCapsuleLayout,
    val isEstablished: Boolean,
    val isNetworkDegraded: Boolean,
    val givenName: String?,
    val displayName: String?,
    val groupName: String?,
    val participantCount: Int,
)

/** Ce que la capsule de droite écrit : un titre, un nombre, la durée, le réseau (jamais que dégradé). */
data class CallHeaderCapsule(
    val title: String?,
    val participantCount: Int?,
    val showsDuration: Boolean,
    val showsNetwork: Boolean,
)

/**
 * Les noms que la conversation en cache donne à la capsule : le nom que j'ai donné à la personne en duo,
 * le nom du groupe en groupe (son nom personnalisé, sinon son titre, sinon celui que le maillage connaît).
 */
data class CallHeaderNames(val givenName: String?, val groupName: String?) {
    companion object {
        fun resolve(conversation: CallFrameConversationInfo?, knownGroupTitle: String?): CallHeaderNames {
            val known = CallFrameTextsRule.meaningful(knownGroupTitle)
            if (conversation == null) return CallHeaderNames(givenName = null, groupName = known)
            val customName = CallFrameTextsRule.meaningful(conversation.customName)
            if (!CallFrameTextsRule.isGroup(conversation.type)) return CallHeaderNames(givenName = customName, groupName = null)
            return CallHeaderNames(
                givenName = null,
                groupName = customName ?: CallFrameTextsRule.meaningful(conversation.title) ?: known,
            )
        }
    }
}

/**
 * L'en-tête de l'écran d'appel (miroir de iOS `CallView+Header.swift`) : Réduire · Image dans l'image ·
 * Conversation à GAUCHE, la capsule à DROITE (#17341). Le nom, la qualité et le
 * compteur ne flottent plus au centre d'une scène vidéo : le centre appartient à l'image.
 */
object CallHeaderLaw {
    /** Le signal est INVISIBLE sur un lien sain ; il apparaît à la dégradation et reste ce temps-là, vert, une fois guéri (iOS : 30 s). */
    const val SIGNAL_RECOVERY_LINGER_MILLIS: Long = 30_000

    /**
     * Image dans l'image n'est offerte que si l'appel y est éligible, ou pour en sortir ; Conversation que si elle
     * est connue (un appel réveillé par un push sans salon n'a pas de porte vers elle).
     */
    fun actions(context: CallHeaderContext): List<CallHeaderAction> = buildList {
        add(CallHeaderAction.Minimize)
        if (context.canEnterPictureInPicture || context.isPictureInPictureActive) add(CallHeaderAction.PictureInPicture)
        if (context.hasConversation) add(CallHeaderAction.Conversation)
    }

    /**
     * #17341 — vidéo : le nom donné (sinon le nom d'affichage) et la durée ; audio : le nom et la durée sont déjà sous
     * l'avatar, la capsule n'existe que pour le réseau dégradé ; groupe : le nom du groupe, le nombre et la durée.
     */
    fun capsule(input: CallHeaderCapsuleInput): CallHeaderCapsule? {
        if (!input.isEstablished) return null
        return when (input.layout) {
            CallHeaderCapsuleLayout.Audio ->
                if (input.isNetworkDegraded) CallHeaderCapsule(null, null, showsDuration = false, showsNetwork = true) else null
            CallHeaderCapsuleLayout.Video -> CallHeaderCapsule(
                title = CallFrameTextsRule.meaningful(input.givenName) ?: CallFrameTextsRule.meaningful(input.displayName),
                participantCount = null,
                showsDuration = true,
                showsNetwork = input.isNetworkDegraded,
            )
            CallHeaderCapsuleLayout.Group -> CallHeaderCapsule(
                title = CallFrameTextsRule.meaningful(input.groupName),
                participantCount = input.participantCount.takeIf { it > 0 },
                showsDuration = true,
                showsNetwork = input.isNetworkDegraded,
            )
        }
    }

    /** La porte vers la conversation : absente quand l'appel ne sait pas dans quelle conversation il vit (appel réveillé par un push sans salon). */
    fun showsConversationButton(conversationId: String?): Boolean = !conversationId.isNullOrBlank()

    /** Le bloc pair (nom · statut · qualité) ne se pose au centre qu'hors scène vidéo. */
    fun centersPeerBlock(isVideoStage: Boolean): Boolean = !isVideoStage

    fun signalStrength(quality: ConnectionQuality?): CallSignalStrength = when (quality) {
        ConnectionQuality.EXCELLENT -> CallSignalStrength.EXCELLENT
        ConnectionQuality.GOOD -> CallSignalStrength.GOOD
        ConnectionQuality.FAIR -> CallSignalStrength.FAIR
        ConnectionQuality.POOR -> CallSignalStrength.POOR
        null -> CallSignalStrength.CONNECTING
    }
}
