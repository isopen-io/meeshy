package me.meeshy.app.feed

import me.meeshy.sdk.model.ApiAuthor
import me.meeshy.sdk.model.ApiPost
import me.meeshy.sdk.model.ApiPostTranslationEntry
import me.meeshy.sdk.model.ApiRepostOf
import me.meeshy.sdk.model.MeeshyUser

/**
 * #16001 — le témoin de Prisme du compositeur de citation : un lecteur au prisme `['fr', 'en']` et une source ÉCRITE en
 * anglais, traduite en français. La langue d'origine occupe le rang 2 : un court-circuit « l'origine est dans le prisme ⇒
 * l'original » servirait l'anglais, la descente juste sert le français (leçon 261). La carte du fil sert le français ;
 * l'aperçu de citation doit servir le même texte.
 */
internal object QuotePrism {
    const val ORIGINAL = "Post to an image recipe"
    const val SERVED = "Post à une image — recette"

    val reader = MeeshyUser(id = "me", username = "moi", systemLanguage = "fr", regionalLanguage = "en")

    private val translations = mapOf("fr" to ApiPostTranslationEntry(text = SERVED))

    fun post(id: String = "p1", type: String = "POST") = ApiPost(
        id = id,
        type = type,
        content = ORIGINAL,
        originalLanguage = "en",
        translations = translations,
        author = ApiAuthor(id = "a", displayName = "Ana"),
    )

    fun root() = ApiRepostOf(
        id = "root",
        type = "POST",
        content = ORIGINAL,
        originalLanguage = "en",
        translations = translations,
        author = ApiAuthor(id = "c", displayName = "Chloé"),
    )

    fun share(id: String = "share", type: String = "POST") = ApiPost(
        id = id,
        type = type,
        content = "",
        author = ApiAuthor(id = "b", displayName = "Bilal"),
        repostOf = root(),
    )
}
