package me.meeshy.sdk.model

/**
 * Une sélection de types de notification BRUTS — ce que la passerelle attend
 * sous deux formes : une liste CSV en query de `GET /notifications` (`types`,
 * `hideReadTypes`) et un tableau dans le corps de `POST /notifications/read-by-types`.
 *
 * La liste appartient au CLIENT : c'est lui qui dessine les onglets de la cloche
 * et sait quelles familles se consomment en s'ouvrant (`routes/notifications.ts`,
 * `notificationTypesClause` / `hideReadTypesClause`). Le serveur ne fait que
 * l'appliquer, et traite une liste vide comme « pas de filtre » : une chaîne mal
 * formée viderait ou garderait la boîte en entier, jamais à moitié.
 *
 * Un site unique normalise (trim, retrait des vides et des doublons) pour que la
 * query et le corps disent la même chose de la même sélection.
 */
object NotificationTypeSelection {

    /** Les types utilisables : nettoyés, sans doublon, ordre d'arrivée conservé. */
    fun normalize(types: Collection<String>): List<String> =
        types.asSequence()
            .map { it.trim() }
            .filter { it.isNotEmpty() && ',' !in it }
            .distinct()
            .toList()

    /**
     * La valeur CSV d'une query, ou `null` quand il n'y a rien à dire — Retrofit
     * n'écrit pas un paramètre nul, donc « aucun filtre » ne devient pas `types=`.
     */
    fun csv(types: Collection<String>): String? =
        normalize(types).takeIf { it.isNotEmpty() }?.joinToString(",")

    /**
     * Les corps de `read-by-types` pour une sélection : un par tranche de
     * [ReadNotificationsByTypesRequest.MAX_TYPES]. Vide quand la sélection l'est
     * — aucun appel ne part alors, l'inverse d'un corps vide que la passerelle refuse.
     */
    fun readBatches(types: Collection<String>): List<ReadNotificationsByTypesRequest> =
        normalize(types)
            .chunked(ReadNotificationsByTypesRequest.MAX_TYPES)
            .map(::ReadNotificationsByTypesRequest)
}
