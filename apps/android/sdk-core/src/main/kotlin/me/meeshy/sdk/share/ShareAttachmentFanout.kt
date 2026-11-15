package me.meeshy.sdk.share

/**
 * **Une pièce n'est téléversée qu'une fois** : la première cible (l'ORIGINE) porte les octets ; les cibles 2..N
 * réclament au serveur la copie des pièces de l'origine (`copyAttachmentsFromMessageId`), jamais un second téléversement.
 *
 * Au moment de l'enfilage l'identifiant serveur de l'origine n'existe pas : la cible porte le `clientMessageId` de
 * l'origine, que la greffe de l'outbox ([me.meeshy.sdk.conversation.ShareFanoutWriteBack]) remplace par l'id réel à
 * l'accusé. Pure : aucune E/S.
 */
public object ShareAttachmentFanout {

    /** Le message de la cible [targetClientMessageId] porte les octets lui-même (origine) ou copie ceux de [copyFrom]. */
    public data class Leg(val targetClientMessageId: String, val copyFrom: String?) {
        public val isOrigin: Boolean get() = copyFrom == null
    }

    /** Les étapes, dans l'ordre : la première cible est l'origine, les suivantes en copient les pièces. */
    public fun plan(targetClientMessageIds: List<String>): List<Leg> {
        val targets = targetClientMessageIds.filter { it.isNotBlank() }.distinct()
        val origin = targets.firstOrNull() ?: return emptyList()
        return targets.mapIndexed { index, id -> Leg(id, copyFrom = if (index == 0) null else origin) }
    }

    /** Le nombre de téléversements que le plan déclenche : un seul dès qu'il y a une cible. */
    public fun uploadCount(plan: List<Leg>): Int = plan.count { it.isOrigin }
}
