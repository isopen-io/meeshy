package me.meeshy.sdk.model.composer

/**
 * Le mot par lequel le compositeur NOMME le format qu'il compose (#13913) : « Son du post », « Toile du réel ». Une
 * story ne dit jamais « post », un post jamais « story ». L'humeur ne se compose pas sur la scène : elle n'en a pas.
 */
enum class ComposerSceneNoun { STORY, POST, REEL }

/**
 * Les libellés du compositeur qui NOMMENT le format (#13913, R2 de #13863) : ils suivent la table des variantes, jamais
 * une chaîne écrite pour la story seule. Chaque plateforme les résout dans sa langue, un texte par format.
 */
enum class ComposerFormatLabel {
    /** Ce que la toile annonce au lecteur d'écran. */
    CANVAS,

    /** Le titre de la feuille Son. */
    SOUND_SHEET_TITLE,

    /** La bibliothèque « Mes sons » vide : elle se remplit en publiant ce format avec un audio original. */
    SOUND_LIBRARY_EMPTY_MINE,

    /** L'interrupteur qui laisse d'autres reprendre la bande-son des vidéos, et son indice pour le lecteur d'écran. */
    SOUND_EXTRACTION_CAPTION,
    SOUND_EXTRACTION_HINT,

    /** « Texte du post » : la légende hors de la scène, que seuls le post et le réel écrivent. */
    POST_TEXT,
}
