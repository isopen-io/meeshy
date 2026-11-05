package me.meeshy.sdk.model

import me.meeshy.sdk.model.media.MediaUploadProgress

/**
 * Le pourcentage que la bulle d'un message en cours d'envoi montre à la place de l'horloge (#16133, iOS #14702).
 * Le registre des octets en vol est tenu par `cmid` de téléversement, et l'identifiant d'une pièce d'une bulle
 * optimiste EST ce `cmid` tant que la passerelle ne lui a pas donné le sien : la correspondance se lit donc
 * directement, sans table intermédiaire. Pur.
 *
 * Sur iOS, les pièces d'une bulle partent dans UNE session : un seul pourcentage, qui ne fait que monter. Ici chaque
 * pièce est sa propre ligne de file, téléversée l'une après l'autre, et le registre oublie une pièce dès qu'elle a
 * fini : la bulle compte donc AUSSI ce qui a déjà atterri ([landed]), sans quoi trois photos montreraient trois fois
 * 0 → 99 %, l'horloge revenant entre chaque.
 */
object BubbleSendProgress {

    /** Une pièce de la bulle : son identifiant (le `cmid` de son téléversement) et son poids, s'il est connu. */
    data class Piece(val id: String, val sizeBytes: Long?)

    /**
     * Le pourcentage entier (arrondi vers le bas, jamais au-delà de 100) des [pieces] de la bulle : chaque pièce
     * atterrie compte pleine, celle en vol pour ses octets, les autres (en file, en échec qui attend sa reprise) pour
     * rien. Les pièces pèsent leurs octets quand toutes les déclarent, une part égale sinon ; une pièce citée deux
     * fois ne pèse qu'une fois. `null` tant qu'aucune n'est ni en vol ni atterrie — l'horloge d'envoi reste alors,
     * un anneau figé à zéro serait pire que pas d'anneau.
     */
    fun percent(
        pieces: List<Piece>,
        progress: Map<String, MediaUploadProgress>,
        landed: (String) -> Boolean,
    ): Int? {
        val distinct = pieces.distinctBy { it.id }
        val shares = distinct.map { share(it.id, progress, landed) }
        if (shares.all { it == null }) return null
        val sizes = distinct.mapNotNull { piece -> piece.sizeBytes?.takeIf { it > 0L }?.toDouble() }
        val weights = if (sizes.size == distinct.size) sizes else distinct.map { 1.0 }
        val sent = shares.zip(weights).sumOf { (share, weight) -> (share ?: 0.0) * weight }
        val ratio = sent / weights.sum()
        return (ratio * PERCENT + EPSILON).toInt().coerceIn(0, PERCENT)
    }

    private fun share(id: String, progress: Map<String, MediaUploadProgress>, landed: (String) -> Boolean): Double? {
        val inFlight = (progress[id] as? MediaUploadProgress.Uploading)?.takeIf { it.total > 0 }
        if (inFlight != null) return inFlight.sent.coerceIn(0L, inFlight.total).toDouble() / inFlight.total
        return if (landed(id)) 1.0 else null
    }

    private const val PERCENT = 100
    private const val EPSILON = 1e-9
}
