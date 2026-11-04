package me.meeshy.app.stories

/**
 * Les envois différés d'une slide SUPPRIMÉE : ils ne sont pas annulés à la suppression, ils attendent ici, octets gardés,
 * tant que l'historique peut encore rétablir la slide. Annuler la suppression les rend à la slide (sans nouvel envoi) ;
 * ils ne sont abandonnés que lorsque plus aucune étape joignable par annuler/rétablir ne les montre.
 */
internal class BuriedUploads {
    var held: List<PendingMediaUpload> = emptyList()
        private set

    fun bury(uploads: List<PendingMediaUpload>) {
        held = (held + uploads).distinctBy(PendingMediaUpload::cmid)
    }

    /** Après un retour à un instantané : ce que la slide montre n'est plus enterré, ce qu'elle ne montre plus l'est. */
    fun settled(before: List<PendingMediaUpload>, after: List<PendingMediaUpload>) {
        val shown = after.mapTo(mutableSetOf(), PendingMediaUpload::cmid)
        held = (held + before).distinctBy(PendingMediaUpload::cmid).filterNot { it.cmid in shown }
    }

    /** Un envoi enterré qui vient d'aboutir (#15598) : il quitte la pile, l'historique le nommera sous son média reçu. */
    fun resolved(cmid: String): PendingMediaUpload? = held.firstOrNull { it.cmid == cmid }?.also { found -> held = held - found }

    /** Les envois qu'aucune étape de l'historique ne montre plus : ils quittent la pile, l'appelant les libère et les annule. */
    fun abandoned(reaches: (String) -> Boolean): List<PendingMediaUpload> {
        val (kept, lost) = held.partition { reaches(it.cmid) }
        held = kept
        return lost
    }
}
