package me.meeshy.sdk.model

/** Où le pied d'une bulle se pose (iOS `BubbleFooterStyle`). */
enum class BubbleFooterStyle {
    /** Sous le contenu (texte, vocal, fichier…), dans la bulle. */
    Row,

    /** Capsule sombre posée en coin sur une image, une vidéo ou un carrousel. */
    Overlay,

    /** Collé à un émoji seul : heure et coche, rien d'autre. */
    Compact;

    companion object {
        /**
         * Le style du pied selon ce que la bulle porte. Un émoji seul garde le pied compact ; un média
         * visuel (image, vidéo, carrousel) SANS texte ni autre pièce reçoit la capsule ; tout le reste
         * garde la rangée sous le contenu.
         */
        fun forContent(isEmojiOnly: Boolean, hasVisualMedia: Boolean, hasOtherContent: Boolean): BubbleFooterStyle = when {
            isEmojiOnly -> Compact
            hasVisualMedia && !hasOtherContent -> Overlay
            else -> Row
        }
    }
}

/**
 * L'état « modifié » tel que le pied le dit : le crayon, ou la rotation pendant que l'édition part au
 * serveur (iOS `BubbleEditMark`). [EditedByModerator] se dit en mots, jamais par le crayon seul.
 */
enum class BubbleEditMark {
    Edited, EditedByModerator, Saving;

    companion object {
        fun resolve(isEdited: Boolean, isSaving: Boolean, byModerator: Boolean = false): BubbleEditMark? = when {
            isSaving -> Saving
            !isEdited -> null
            byModerator -> EditedByModerator
            else -> Edited
        }
    }
}

/**
 * Le descripteur pur d'un pied de bulle (iOS `BubbleFooterModel`) : l'heure, la livraison, le mode hors
 * ligne et la marque « modifié ». [timestamp] nul = l'heure est omise, sans erreur.
 */
data class BubbleFooterModel(
    val style: BubbleFooterStyle = BubbleFooterStyle.Row,
    val timestamp: String? = null,
    val delivery: DeliveryGlyphState? = null,
    val isOffline: Boolean = false,
    val isMe: Boolean = false,
    val showsTranslate: Boolean = false,
    val edit: BubbleEditMark? = null,
    val sendStartedAtMillis: Long? = null,
) {
    val isFailed: Boolean get() = delivery == DeliveryGlyphState.Failed

    val isPending: Boolean
        get() = when (delivery) {
            DeliveryGlyphState.Sending, DeliveryGlyphState.Clock, DeliveryGlyphState.Slow, DeliveryGlyphState.Invisible -> true
            else -> false
        }

    companion object {
        /**
         * Une bulle n'offre la traduction que si elle porte un TEXTE (ou un audio, dont la transcription
         * se traduit). Une position, un fichier, un média seul ou un émoji n'ont rien à traduire.
         */
        fun offersTranslation(hasText: Boolean, isEmojiOnly: Boolean, hasAudio: Boolean): Boolean =
            !isEmojiOnly && (hasText || hasAudio)

        /**
         * L'état que la COCHE doit dire : un échec que la bande de renvoi porte déjà ne se répète pas en
         * rouge (la coche se tait).
         */
        fun glyphStatus(status: DeliveryGlyphState?, retryBandShown: Boolean): DeliveryGlyphState? =
            if (status == DeliveryGlyphState.Failed && retryBandShown) null else status

        fun make(
            style: BubbleFooterStyle,
            timestamp: String?,
            deliveryStatus: DeliveryGlyphState,
            isMe: Boolean,
            isOnline: Boolean,
            showsTranslate: Boolean,
            sendStartedAtMillis: Long? = null,
            retryBandShown: Boolean = false,
            edit: BubbleEditMark? = null,
        ): BubbleFooterModel = BubbleFooterModel(
            style = style,
            timestamp = timestamp,
            delivery = if (isMe) glyphStatus(deliveryStatus, retryBandShown) else null,
            isOffline = !isOnline,
            isMe = isMe,
            showsTranslate = showsTranslate,
            edit = edit,
            sendStartedAtMillis = if (isMe && deliveryStatus == DeliveryGlyphState.Sending) sendStartedAtMillis else null,
        )
    }
}
