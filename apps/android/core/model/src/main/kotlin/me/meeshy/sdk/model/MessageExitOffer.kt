package me.meeshy.sdk.model

/** Une SORTIE : un geste qui emporte le contenu d'un message hors de la bulle qui le porte. */
enum class MessageExit {
    /** Transférer dans une autre conversation. */
    FORWARD,

    /** Copier dans le presse-papiers. */
    COPY,

    /** Enregistrer dans la galerie ou les fichiers. */
    SAVE,

    /** Partager hors de Meeshy (feuille de partage système). */
    SHARE,

    /** « Imager » et « Imager la discussion ». */
    IMAGINE,

    /** Composer ou publier en post, réel ou story. */
    PUBLISH,
}

/**
 * **Ce qu'un message laisse sortir — LA projection de la loi de sortie côté application**
 * (#9573). Miroir de `MessageExitOffer` (iOS).
 *
 * La loi ([ContentExitLaw]) juge la nature de disparition ; le flou et le chiffrement gardent
 * leurs propres restrictions. Cette projection les COMPOSE, une fois, et tout site qui offre
 * une sortie — menu d'appui long, partage de fichier, enregistrement galerie, transfert — la
 * LIT. Aucun ne relit un drapeau. Une entrée refusée est ABSENTE, jamais grisée.
 *
 * Un message FLOUTÉ se transfère (flou hérité) et ne laisse rien d'autre sortir ; un message
 * CHIFFRÉ ne se transfère ni ne se publie ; un message qui CITE un contenu protégé ne s'image
 * pas. Le serveur fait foi et refusera.
 */
data class MessageExitOffer(
    val law: ContentExitLaw,
    /** Le message ou l'une de ses pièces est flouté. */
    val holdsBlur: Boolean,
    /** Le message ou l'une de ses pièces est chiffré. */
    val isEncrypted: Boolean,
    /** Le message cite un contenu protégé (flamme, vue unique, flou, nature illisible). */
    val quotesProtectedContent: Boolean = false,
) {
    val nature: ContentExitLaw.Nature get() = law.nature

    val capture: ContentExitLaw.CaptureVerdict get() = law.capture

    fun offers(exit: MessageExit): Boolean {
        if (exit == MessageExit.FORWARD) return law.forward.isAllowed && !isEncrypted
        if (holdsBlur) return false
        return when (exit) {
            MessageExit.FORWARD -> false
            MessageExit.COPY, MessageExit.SAVE, MessageExit.SHARE -> law.exportable
            MessageExit.IMAGINE -> law.exportable && !quotesProtectedContent
            MessageExit.PUBLISH -> law.exportable && !isEncrypted
        }
    }

    /** « Ce message peut-il être transféré ? » */
    val isForwardable: Boolean get() = offers(MessageExit.FORWARD)

    /** Les visionneuses de ce message peuvent-elles laisser sortir ses pièces ? */
    val mayLeaveViewers: Boolean get() = offers(MessageExit.SAVE)

    companion object {
        val Unrestricted = MessageExitOffer(ContentExitLaw.Ordinary, holdsBlur = false, isEncrypted = false)

        /** Une sélection multiple se transfère dès qu'UN message sort ; une sélection vide ne bloque rien. */
        fun selectionOffersForward(offers: List<MessageExitOffer>): Boolean =
            offers.isEmpty() || offers.any { it.offers(MessageExit.FORWARD) }

        /** Les pièces qu'une visionneuse peut laisser sortir : seules celles d'un message qui offre l'enregistrement. */
        fun savablePieceIds(messages: List<Pair<MessageExitOffer, List<String>>>): Set<String> =
            messages.filter { it.first.offers(MessageExit.SAVE) }.flatMap { it.second }.toSet()

        /**
         * Les pièces qu'une visionneuse rend dans la couche sécurisée : toutes, SAUF celles d'un
         * message que la règle « annoncé OU noir » laisse en clair. Une pièce inconnue est protégée.
         */
        fun captureShieldScope(
            messages: List<Pair<MessageExitOffer, List<String>>>,
            surfaceAnnounces: Boolean = false,
        ): CaptureShieldScope = CaptureShieldScope.allExcept(
            messages
                .filter { !it.first.capture.shieldsCapture(surfaceAnnounces) }
                .flatMap { it.second }
                .toSet(),
        )
    }
}

/**
 * Pourquoi un transfert est refusé — une raison, puis sa phrase localisée. Deux sources :
 * la loi de sortie lue AVANT d'envoyer ([local]) et la passerelle, qui fait foi et répond
 * par un code stable ([fromCode], `FORWARD_REFUSAL_CODES` de `packages/shared`).
 */
enum class ForwardRefusalReason {
    VIEW_ONCE,
    AFTER_READ,
    SOURCE_UNAVAILABLE,
    ENCRYPTED_SOURCE,
    ATTACHMENT_NOT_IN_SOURCE,
    ;

    companion object {
        /** Ce que l'offre refuse pour ce message, ou `null` s'il se transfère. Un flouté se transfère. */
        fun local(offer: MessageExitOffer): ForwardRefusalReason? {
            val verdict = offer.law.forward
            if (verdict is ContentExitLaw.ForwardVerdict.Refused) {
                return if (verdict.reason == ContentExitLaw.ForwardRefusal.VIEW_ONCE) VIEW_ONCE else AFTER_READ
            }
            return if (offer.isEncrypted) ENCRYPTED_SOURCE else null
        }

        /** La raison que porte le code de refus de la passerelle, ou `null` si ce n'en est pas un. */
        fun fromCode(code: String?): ForwardRefusalReason? = when (code) {
            "view-once-not-forwardable" -> VIEW_ONCE
            "ephemeral-not-forwardable" -> AFTER_READ
            "forward-source-unavailable" -> SOURCE_UNAVAILABLE
            "encrypted-source-not-server-copyable" -> ENCRYPTED_SOURCE
            "forwarded-attachment-not-in-source" -> ATTACHMENT_NOT_IN_SOURCE
            else -> null
        }
    }
}

// ── Projections du modèle de domaine ──

val ApiMessageAttachment.contentExitPiece: ContentExitLaw.Piece
    get() = ContentExitLaw.Piece(isViewOnce = isViewOnce, isBlurred = isBlurred, effectFlags = effectFlags)

private fun ApiMessageAttachment.isCipher(): Boolean = isEncrypted == true

/** Ce que la loi de sortie lit de ce message. Une vue unique déjà ouverte par ce lecteur reste une vue unique. */
val ApiMessage.contentExitSubject: ContentExitLaw.Subject
    get() = ContentExitLaw.Subject(
        isViewOnce = isViewOnce == true || isViewOnceOpenedByMe,
        isBlurred = isBlurred,
        effectFlags = effects.flags,
        ephemeralDuration = ephemeralDuration?.toDouble(),
        hasExpiry = !expiresAt.isNullOrBlank(),
        attachments = attachments.map { it.contentExitPiece },
    )

val ApiMessage.contentExitLaw: ContentExitLaw get() = ContentExitLaw.of(contentExitSubject)

private val ApiMessageReplyPreview.exitSubject: ContentExitLaw.Subject
    get() = ContentExitLaw.Subject(
        isViewOnce = isViewOnce,
        isBlurred = isBlurred,
        effectFlags = effectFlags,
        hasExpiry = !expiresAt.isNullOrBlank(),
        attachments = attachments?.map { it.contentExitPiece },
    )

/**
 * Le message CITE-t-il un contenu protégé ? Jugé sur ce que la citation déclare : nature non
 * ordinaire, flou, chiffrement ou pièce protégée. Une citation de story ou d'humeur, ou d'un
 * message supprimé, n'en relève pas. Un message qui ne cite rien ne cite rien de protégé.
 */
val ApiMessage.quotesProtectedContent: Boolean
    get() {
        val quoted = replyTo ?: return false
        if (postReplyTo != null || quoted.deletedAt != null) return false
        val law = ContentExitLaw.of(quoted.exitSubject)
        val blurred = quoted.isBlurred == true ||
            ((quoted.effectFlags ?: 0L) and MessageEffectFlags.BLURRED) != 0L
        val mediaProtected = quoted.attachments.orEmpty().any { it.isProtected }
        return law.nature != ContentExitLaw.Nature.ORDINARY || blurred || quoted.isEncrypted == true || mediaProtected
    }

/** Le message est-il FLOUTÉ, au niveau du message ou d'une de ses pièces ? */
val ApiMessage.holdsBlur: Boolean
    get() = isBlurred == true || effects.has(MessageEffectFlags.BLURRED) ||
        attachments.any { it.isBlurred == true || ((it.effectFlags ?: 0L) and MessageEffectFlags.BLURRED) != 0L }

/** Ce que ce message laisse sortir. [conversationIsEncrypted] ferme le transfert d'une conversation chiffrée. */
fun ApiMessage.exitOffer(conversationIsEncrypted: Boolean = false): MessageExitOffer = MessageExitOffer(
    law = contentExitLaw,
    holdsBlur = holdsBlur,
    isEncrypted = conversationIsEncrypted || isEncrypted == true || attachments.any { it.isCipher() },
    quotesProtectedContent = quotesProtectedContent,
)
