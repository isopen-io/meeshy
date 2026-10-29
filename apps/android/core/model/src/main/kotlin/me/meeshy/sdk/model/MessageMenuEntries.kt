package me.meeshy.sdk.model

/**
 * LES ENTRÉES DU MENU D'UN MESSAGE QU'iOS OFFRE ET QU'ANDROID N'AVAIT PAS (#13778, #13779) — miroir des conditions de
 * `MessageActionResolver` (iOS : `primaryActions` et `moreSections`). Loi PURE : elle reçoit des faits, jamais un
 * message ni un écran, et l'hôte dit ensuite lesquelles il sait servir.
 *
 * Communes à toutes : un message parti (supprimé, éphémère échu) ou à vue unique ne montre rien de son contenu, son
 * menu se réduit à Supprimer et Infos. Un message flouté ou scellé (chiffré de bout en bout, non ouvert ici) ne rend
 * pas son contenu par une autre porte. Une conversation chiffrée de bout en bout n'a ni traduction ni transcription
 * par le serveur : la feuille le DIT ([saysServerFeaturesAbsent]), elle ne les offre pas.
 */
object MessageMenuEntries {

    enum class Entry { OPEN_LINK, COPY_LINK, THREAD, TRANSLATE, SAVE_MEDIA, SHARE, TRANSCRIPTION, REACTIONS }

    /** La forme d'une pièce, telle que le menu la compte (un lieu n'en est pas une). */
    enum class Piece { IMAGE, VIDEO, AUDIO, FILE }

    /** Ce que « Partager » emporte : le texte du message, ou sa seule pièce. */
    enum class ShareTarget { TEXT, PIECE }

    data class Facts(
        /** Supprimé, ou éphémère échu. */
        val isGone: Boolean = false,
        /** Connu du serveur : ni en vol, ni en échec, ni identifiant client. */
        val isLive: Boolean = true,
        val isNotice: Boolean = false,
        val isViewOnce: Boolean = false,
        val isBlurred: Boolean = false,
        /** Chiffré de bout en bout et non ouvert sur cet appareil. */
        val isSealed: Boolean = false,
        val conversationIsEndToEnd: Boolean = false,
        val hasText: Boolean = false,
        /** Le Prisme sert déjà une traduction : « Explorer les langues » tient la place de « Traduire ». */
        val isTranslated: Boolean = false,
        /** Les actions du TYPE, lues sur [MessageActionPolicy.kindActionsOf]. */
        val kindActions: List<MessageActionPolicy.Action> = emptyList(),
        /** Le premier lien du texte, cible d'« Ouvrir » et de « Copier le lien ». */
        val link: String? = null,
        /** Au moins une réponse vivante cite ce message. */
        val hasThread: Boolean = false,
        val pieces: List<Piece> = emptyList(),
        val exits: MessageExitOffer = MessageExitOffer.Unrestricted,
    ) {
        private val showsNothing: Boolean get() = isGone || isViewOnce

        /** iOS `showsContent` : ni flouté, ni scellé. */
        val showsContent: Boolean get() = !showsNothing && !isBlurred && !isSealed

        val hasTimebasedMedia: Boolean get() = pieces.any { it == Piece.AUDIO || it == Piece.VIDEO }
    }

    fun offers(facts: Facts): Set<Entry> = buildSet {
        if (facts.offersOpenLink()) add(Entry.OPEN_LINK)
        if (facts.offersCopyLink()) add(Entry.COPY_LINK)
        if (facts.offersThread()) add(Entry.THREAD)
        if (facts.offersTranslate()) add(Entry.TRANSLATE)
        if (facts.offersSaveMedia()) add(Entry.SAVE_MEDIA)
        if (shareTarget(facts) != null) add(Entry.SHARE)
        if (facts.offersTranscription()) add(Entry.TRANSCRIPTION)
        if (facts.offersReactions()) add(Entry.REACTIONS)
    }

    /**
     * Ce que « Partager » emporte, ou `null` quand il ne s'offre pas. Une pièce SEULE (photo, son) part comme fichier ;
     * un texte sans pièce part comme texte. Un fichier ou une vidéo ont déjà « Partager le fichier » ; plusieurs pièces
     * mentiraient sur ce qui part.
     */
    fun shareTarget(facts: Facts): ShareTarget? {
        if (!facts.showsContent || !facts.exits.offers(MessageExit.SHARE)) return null
        val only = facts.pieces.singleOrNull()
        return when {
            only == Piece.IMAGE || only == Piece.AUDIO -> ShareTarget.PIECE.takeIf { facts.isLive }
            facts.pieces.isEmpty() && facts.hasText -> ShareTarget.TEXT
            else -> null
        }
    }

    /** iOS `moreSections` : « Chiffrée de bout en bout : la traduction et la transcription par le serveur ne sont pas disponibles ». */
    fun saysServerFeaturesAbsent(facts: Facts): Boolean = facts.conversationIsEndToEnd && !facts.isGone && !facts.isViewOnce

    private fun Facts.offersOpenLink(): Boolean =
        showsContent && link != null && MessageActionPolicy.Action.OPEN_LINK in kindActions

    private fun Facts.offersCopyLink(): Boolean =
        showsContent && link != null && MessageActionPolicy.Action.COPY_LINK in kindActions && exits.offers(MessageExit.COPY)

    /** La feuille du fil ne s'ouvre que sur un fil vivant : un contrôle existe s'il a un effet. */
    private fun Facts.offersThread(): Boolean = !isGone && !isViewOnce && isLive && hasThread

    /** Sans traduction servie : « Traduire » ouvre l'explorateur des langues, qui demande au serveur. */
    private fun Facts.offersTranslate(): Boolean =
        showsContent && isLive && !isNotice && hasText && !isTranslated && !conversationIsEndToEnd

    /** iOS : EXACTEMENT une pièce, photo ou vidéo, vers la galerie. */
    private fun Facts.offersSaveMedia(): Boolean {
        val only = pieces.singleOrNull() ?: return false
        return showsContent && isLive && (only == Piece.IMAGE || only == Piece.VIDEO) && exits.offers(MessageExit.SAVE)
    }

    private fun Facts.offersTranscription(): Boolean = showsContent && hasTimebasedMedia && !conversationIsEndToEnd

    private fun Facts.offersReactions(): Boolean = !isGone && !isViewOnce && isLive

    private val LINK = Regex("https?://[^\\s<>\"]+", RegexOption.IGNORE_CASE)

    /** Le premier lien brut du texte (iOS `MessageKindTarget.firstRawLink`). */
    fun firstLink(text: String?): String? = text?.let { LINK.find(it)?.value }
}
