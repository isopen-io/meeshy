package me.meeshy.sdk.model.playback

/** Les langues d'une piste d'une pile : celle de sa transcription d'origine, puis celles de ses pistes traduites. */
public data class VoiceTrackLanguages(
    val attachmentId: String,
    val original: String?,
    val translated: List<String>,
)

/** Une rangée de la pile, qui sait sa place (« Vocal 2 sur 3 ») ; [position] commence à 1. */
public data class VoiceStackRow(val attachmentId: String, val position: Int, val count: Int)

/**
 * **La pile des vocaux d'un message** (iOS `AudioStackView`) : chaque piste sur sa rangée, de haut en bas, et UN pied
 * partagé dont les drapeaux sont l'union des langues de toutes les pistes.
 */
public object VoiceStackPlan {

    public fun rows(attachmentIds: List<String>): List<VoiceStackRow> =
        attachmentIds.mapIndexed { index, id -> VoiceStackRow(id, position = index + 1, count = attachmentIds.size) }

    /**
     * iOS `sharedFooterModel` : l'union ordonnée (la première vue gagne) des langues d'origine puis traduites de chaque
     * piste, normalisées en minuscules. Vide quand aucune piste n'en porte : le pied garde alors les drapeaux du texte.
     */
    public fun footerLanguages(tracks: List<VoiceTrackLanguages>): List<String> =
        tracks.flatMap { track -> listOfNotNull(track.original) + track.translated }
            .map { it.trim().lowercase() }
            .filter { it.isNotEmpty() }
            .distinct()
}
