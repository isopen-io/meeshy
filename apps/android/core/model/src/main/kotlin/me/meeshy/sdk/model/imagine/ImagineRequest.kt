package me.meeshy.sdk.model.imagine

/** Ce qu'une carte « Imagine » peint d'une pièce : une photo, une vidéo (par son poster) ou un son (qu'on représente). */
enum class ImagineMediaKind {
    IMAGE,
    VIDEO,
    AUDIO,
    ;

    /** Un média qui se PEINT (photo, première image d'une vidéo) — un son se représente. */
    val isVisual: Boolean get() = this != AUDIO

    /** Un média qui a une DURÉE : il peut partir en GIF ou en vidéo. */
    val isTemporal: Boolean get() = this != IMAGE
}

/** Qui a posté une pièce — la discussion en mêle plusieurs, et chaque média garde l'auteur de SON message. */
data class ImagineMediaAuthor(val name: String, val handle: String?, val isQuoted: Boolean = false)

/**
 * Une pièce que la carte peut peindre. [fileUrl] est le fichier de la piste SERVIE pour un son (la piste traduite quand
 * l'application l'a désignée), [transcript] la transcription de CETTE piste : une transcription au-dessus d'une voix dans
 * une autre langue serait pire qu'une transcription absente.
 */
data class ImagineMedia(
    val id: String,
    val kind: ImagineMediaKind,
    val fileUrl: String,
    val posterUrl: String? = null,
    val aspect: Double = 1.0,
    val aspectKnown: Boolean = false,
    val durationSeconds: Double? = null,
    val name: String? = null,
    val transcript: String? = null,
    val isSticker: Boolean = false,
    val author: ImagineMediaAuthor? = null,
) {
    fun by(author: ImagineMediaAuthor?): ImagineMedia = copy(author = author)
}

data class ImaginePart(val author: String, val text: String, val handle: String? = null)

/** Ce que la carte dit : la citation, la réponse, l'heure et les médias peints sous la réponse. */
data class ImagineSubject(
    val quoted: ImaginePart?,
    val reply: ImaginePart,
    val sentAtMillis: Long,
    val quotedAtMillis: Long? = null,
    val media: List<ImagineMedia> = emptyList(),
) {
    /** Les pseudos sont-ils connus ? L'option « pseudo au lieu du nom affiché » n'existe qu'alors. */
    val hasHandles: Boolean get() = reply.handle != null || quoted?.handle != null || media.any { it.author?.handle != null }

    /** Un visuel au moins dit qui l'a posté : l'option « Auteur du média » n'existe qu'alors. */
    val hasMediaAuthors: Boolean get() = media.any { it.kind.isVisual && it.author != null }
}

data class ImagineViewer(val id: String?, val displayName: String?, val username: String?)

/** La carte d'une langue offerte : son code (minuscules) et le sujet écrit dans cette langue. */
data class ImagineLanguageCard(val code: String, val subject: ImagineSubject)

/** Pourquoi un message ne s'image pas. */
enum class ImagineRefusal { DELETED, NOTICE, SEALED, PROTECTED, QUOTES_PROTECTED, EMPTY }

/**
 * **Ce que l'atelier « Imagine » reçoit** (miroir de `MessageCardExportRequest`, iOS) : le sujet tel que le lecteur le
 * lit, une carte par langue offerte (vide : une seule langue), le pseudo de qui exporte, le titre de la conversation et
 * l'accent PASSÉ en paramètre — l'atelier ne calcule aucune couleur.
 */
data class ImagineRequest(
    val subject: ImagineSubject,
    val languages: List<ImagineLanguageCard>,
    val handle: String?,
    val conversationTitle: String?,
    val accentColor: String,
    val quick: Boolean = false,
) {
    /** La carte dans [language], ou le sujet lu quand cette langue n'est pas offerte. */
    fun subjectIn(language: String?): ImagineSubject =
        language?.lowercase()?.let { code -> languages.firstOrNull { it.code == code }?.subject } ?: subject
}
