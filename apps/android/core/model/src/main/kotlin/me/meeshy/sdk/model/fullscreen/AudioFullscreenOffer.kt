package me.meeshy.sdk.model.fullscreen

import me.meeshy.sdk.model.ApiMessage
import me.meeshy.sdk.model.ConversationClearance
import me.meeshy.sdk.model.MessageExit
import me.meeshy.sdk.model.PlainSignalAdmission
import me.meeshy.sdk.model.VoiceQueueProtection
import me.meeshy.sdk.model.exitOffer
import me.meeshy.sdk.model.imagine.ImagineRequestBuilder
import me.meeshy.sdk.model.piece.PieceSealing

/**
 * Les actions du rail du plein écran audio, dans l'ordre de la charte § 6 : Réagir, Répondre, Transférer, Créer — et la
 * baguette « Imager » avant Créer (#16334), qui fait du message porteur et de sa pièce une carte image.
 */
public enum class AudioFullscreenAction { REACT, REPLY, FORWARD, IMAGER, COMPOSE }

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
    /** « Imager » le message porteur avec sa pièce (#16334) : le verdict de la carte ([ImagineRequestBuilder.isExportable]). */
    val imager: Boolean = false,
) {
    /** Les actions offertes, dans l'ordre fixe du rail. */
    public val actions: List<AudioFullscreenAction>
        get() = listOfNotNull(
            AudioFullscreenAction.REACT.takeIf { react },
            AudioFullscreenAction.REPLY.takeIf { reply },
            AudioFullscreenAction.FORWARD.takeIf { forward },
            AudioFullscreenAction.IMAGER.takeIf { imager },
            AudioFullscreenAction.COMPOSE.takeIf { compose },
        )

    public val isEmpty: Boolean get() = !react && !reply && !forward && !compose && !imager

    public companion object {
        public val None: AudioFullscreenOffer = AudioFullscreenOffer(react = false, reply = false, forward = false, compose = false)

        /**
         * - [isProtected] : la pièce ou son porteur est à vue unique, flouté, éphémère ou chiffré — elle ne se cite pas, ne
         *   reçoit pas de réaction, ne se transfère pas ;
         * - [hasCarrier] : l'hôte connaît le message qui la porte ;
         * - [carrierInWindow] : ce message est dans la fenêtre chargée (la réaction s'applique à SA ligne) ;
         * - [conversationClear] : la conversation est CONNUE claire (#13790 : réagir et répondre partent en clair) ;
         * - [forwardable] / [composable] : les verdicts de la loi de sortie du porteur ;
         * - [imageable] : le verdict de la carte d'« Imager » sur le porteur (#16334).
         */
        public fun resolve(
            isProtected: Boolean,
            hasCarrier: Boolean,
            carrierInWindow: Boolean,
            conversationClear: Boolean,
            forwardable: Boolean,
            composable: Boolean,
            imageable: Boolean = false,
        ): AudioFullscreenOffer {
            if (!hasCarrier || isProtected || !conversationClear) return None
            return AudioFullscreenOffer(
                react = carrierInWindow,
                reply = true,
                forward = forwardable,
                compose = composable,
                imager = imageable,
            )
        }

        /** La projection de [resolve] pour la pièce [pieceId] de [carrier] : toutes les gardes sont lues ici, une fois. */
        public fun of(
            carrier: ApiMessage?,
            pieceId: String,
            inWindow: Boolean,
            conversationIsEncrypted: Boolean,
            clearance: ConversationClearance,
            nowMillis: Long = System.currentTimeMillis(),
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
                imageable = ImagineRequestBuilder.isExportable(message, nowMillis, conversationIsEncrypted = conversationIsEncrypted),
            )
        }
    }
}
