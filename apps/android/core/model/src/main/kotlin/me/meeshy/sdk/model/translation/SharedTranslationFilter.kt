package me.meeshy.sdk.model.translation

/**
 * Ce que la passerelle accepterait de lire, décidé AVANT l'appel : un seul identifiant ou
 * une seule langue invalide ferait échouer toute la lecture. Miroir de
 * `SharedTranslationService.fetch` (iOS).
 */
public object SharedTranslationFilter {

    /** Sans blancs ni doublons, dans l'ordre d'arrivée, uniquement des ObjectId. */
    public fun messageIds(raw: List<String>): List<String> =
        distinct(raw).filter(SharedTranslationFormat::isObjectId)

    /** Sans blancs ni doublons, codes valides, 8 au plus, dans l'ordre du prisme. */
    public fun languages(raw: List<String>): List<String> =
        distinct(raw).filter(SharedTranslationFormat::isLanguageCode)
            .take(SharedTranslationLimits.LANGUAGES_MAX_COUNT)

    /** Les identifiants valides, par requêtes de 100 au plus ; vide sans identifiant. */
    public fun messageIdChunks(raw: List<String>): List<List<String>> =
        messageIds(raw).chunked(SharedTranslationLimits.MESSAGE_IDS_MAX_COUNT)

    private fun distinct(values: List<String>): List<String> =
        values.map { it.trim() }.filter { it.isNotEmpty() }.distinct()
}
