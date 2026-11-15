package me.meeshy.sdk.model.reading.summary

/**
 * Ce que le menu d'appui long d'une entrée du Résumé offre, dans l'ordre où il l'offre — miroir de
 * `SummaryEntryAction` (iOS, #11225) et de `summary-exits.ts` (web).
 *
 * Un visage de la rampe et un épisode désignent chacun UN message : celui où leur toucher mène (la
 * première preuve d'un visage, le premier message d'un épisode). Le menu porte sur ce même message.
 */
enum class SummaryEntryAction { GO_TO_MESSAGE, REPLY;

    companion object {
        /** Le message qu'un visage désigne ; `null` : il ne désigne rien et n'a pas de menu. */
        fun target(entry: FaceRampEntry): String? = entry.evidenceMessageIds.firstOrNull()

        /** Le message qu'un épisode désigne ; `null` : il ne désigne rien et n'a pas de menu. */
        fun target(episode: ConversationEpisode): String? = episode.messageIds.firstOrNull()

        /**
         * Ce que le menu offre pour un message. [canReply] est le verdict de la loi d'actions du
         * message (`MessageRowOffer`), jamais réécrit ici ; `null` : le message est sorti de la
         * fenêtre chargée — on le rejoint encore, aucune loi ne l'ouvre à la citation.
         */
        fun offered(canReply: Boolean?): List<SummaryEntryAction> =
            if (canReply == true) listOf(GO_TO_MESSAGE, REPLY) else listOf(GO_TO_MESSAGE)
    }
}
