package me.meeshy.sdk.model.fullscreen

import me.meeshy.sdk.model.ApiMessage
import me.meeshy.sdk.model.ConversationClearance
import me.meeshy.sdk.model.MessageExit
import me.meeshy.sdk.model.PlainSignalAdmission
import me.meeshy.sdk.model.VoiceQueueProtection
import me.meeshy.sdk.model.exitOffer
import me.meeshy.sdk.model.piece.PieceSealing

/** Les actions du rail du plein écran audio, dans l'ordre de la charte § 6 : Réagir, Répondre, Transférer, Créer. */
public enum class AudioFullscreenAction { REACT, REPLY, FORWARD, COMPOSE }

/**
 * **Ce que le rail du plein écran audio offre pour UNE pièce** (iOS `AudioFullscreenOffer`, `AudioFullscreenRules.swift`
 * et `ConversationView+MediaGallery`) — une loi pure, lue une fois pour les quatre boutons.
 *
 * Fail-closed : pas de porteur connu, pièce que le porteur ne porte pas, message supprimé, contenu protégé (vue unique,
 * flouté, éphémère, chiffré — message OU pièce) ou conversation qui n'est pas CONNUE claire ⇒ aucune action. Le transfert
 * va au-delà d'iOS (#15465) : il repasse par la loi de sortie du porteur ET par le scellement de la pièce.
 */
public data class AudioFullscreenOffer(
    val react: Boolean,
    val reply: Boolean,
    val forward: Boolean,
    val compose: Boolean,
) {
    /** Les actions offertes, dans l'ordre fixe du rail. */
    public val actions: List<AudioFullscreenAction>
        get() = listOfNotNull(
            AudioFullscreenAction.REACT.takeIf { react },
            AudioFullscreenAction.REPLY.takeIf { reply },
            AudioFullscreenAction.FORWARD.takeIf { forward },
            AudioFullscreenAction.COMPOSE.takeIf { compose },
        )

    public val isEmpty: Boolean get() = !react && !reply && !forward && !compose

    public companion object {
        public val None: AudioFullscreenOffer = AudioFullscreenOffer(react = false, reply = false, forward = false, compose = false)

        /**
         * - [isProtected] : la pièce ou son porteur est à vue unique, flouté, éphémère ou chiffré — elle ne se cite pas, ne
         *   reçoit pas de réaction, ne se transfère pas ;
         * - [hasCarrier] : l'hôte connaît le message qui la porte ;
         * - [carrierInWindow] : ce message est dans la fenêtre chargée (la réaction s'applique à SA ligne) ;
         * - [conversationClear] : la conversation est CONNUE claire (#13790 : réagir et répondre partent en clair) ;
         * - [forwardable] / [composable] : les verdicts de la loi de sortie du porteur.
         */
        public fun resolve(
            isProtected: Boolean,
            hasCarrier: Boolean,
            carrierInWindow: Boolean,
            conversationClear: Boolean,
            forwardable: Boolean,
            composable: Boolean,
        ): AudioFullscreenOffer {
            if (!hasCarrier || isProtected || !conversationClear) return None
            return AudioFullscreenOffer(react = carrierInWindow, reply = true, forward = forwardable, compose = composable)
        }

        /** La projection de [resolve] pour la pièce [pieceId] de [carrier] : toutes les gardes sont lues ici, une fois. */
        public fun of(
            carrier: ApiMessage?,
            pieceId: String,
            inWindow: Boolean,
            conversationIsEncrypted: Boolean,
            clearance: ConversationClearance,
        ): AudioFullscreenOffer {
            val message = carrier?.takeIf { it.deletedAt.isNullOrBlank() } ?: return None
            val piece = message.attachments.firstOrNull { it.id == pieceId } ?: return None
            val exit = message.exitOffer(conversationIsEncrypted)
            return resolve(
                isProtected = conversationIsEncrypted || VoiceQueueProtection.ofPiece(piece, message),
                hasCarrier = true,
                carrierInWindow = inWindow,
                conversationClear = PlainSignalAdmission.offers(clearance),
                forwardable = exit.offers(MessageExit.FORWARD) && !PieceSealing.withholds(piece, message, conversationIsEncrypted),
                composable = exit.offers(MessageExit.PUBLISH),
            )
        }
    }
}
