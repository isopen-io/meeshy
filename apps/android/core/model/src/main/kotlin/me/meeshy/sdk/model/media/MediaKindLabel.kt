package me.meeshy.sdk.model.media

/**
 * Table des libellés localisés d'un média, fournie par la couche UI (ressources).
 * La logique de choix vit dans [MediaKindLabel] ; la langue, dans les ressources.
 */
public interface MediaKindStrings {
    /** Registre compact : « Photo », « Vidéo », « Audio », « Fichier », « Position ». */
    public fun name(kind: MediaKindLabel.Kind): String

    /** Registre aperçu, emoji compris : « 📷 Photo », « 🎙️ Message vocal »… */
    public fun summary(kind: MediaKindLabel.Kind): String

    /** « Message vocal » nu. */
    public val voiceMessage: String

    /** « Message vocal (0:12) » à partir de la durée déjà formatée. */
    public fun voiceRecording(formattedDuration: String): String
}

/**
 * SOURCE UNIQUE de l'étiquette humaine d'un média (miroir d'iOS `MediaKindLabel`).
 * Deux registres : [name] quand une icône double le texte, [summary] pour un aperçu seul en ligne.
 */
public object MediaKindLabel {
    public enum class Kind { PHOTO, VIDEO, AUDIO, FILE, LOCATION }

    public fun name(kind: Kind, strings: MediaKindStrings): String = strings.name(kind)

    public fun summary(kind: Kind, strings: MediaKindStrings): String = strings.summary(kind)

    /** « Message vocal (0:12) » ; durée inconnue ou invalide = « 0:00 ». */
    public fun voiceRecording(durationSeconds: Double?, strings: MediaKindStrings): String =
        strings.voiceRecording(formatMediaDuration(durationSeconds) ?: "0:00")

    /** Le nom du lieu, sinon le mot générique (la chaîne vide ne passe pas). */
    public fun placeLabel(placeName: String?, strings: MediaKindStrings): String =
        placeName?.takeIf { it.isNotEmpty() } ?: strings.name(Kind.LOCATION)

    /** Titre d'un lieu : nom, à défaut adresse, à défaut le mot générique. */
    public fun placeTitle(placeName: String?, address: String?, strings: MediaKindStrings): String =
        placeName?.takeIf { it.isNotEmpty() }
            ?: address?.takeIf { it.isNotEmpty() }
            ?: strings.name(Kind.LOCATION)

    /** Depuis le type sérialisé d'un message / d'une pièce jointe ; `null` pour « text » ou inconnu. */
    public fun kindFor(rawType: String?): Kind? = when (rawType?.lowercase()) {
        "image" -> Kind.PHOTO
        "video" -> Kind.VIDEO
        "audio" -> Kind.AUDIO
        "file" -> Kind.FILE
        "location" -> Kind.LOCATION
        else -> null
    }

    /** Étiquette d'une pièce jointe réelle : durée pour un audio, nom pour un fichier, sinon le nom du type. */
    public fun attachmentLabel(
        rawType: String?,
        originalName: String?,
        durationSeconds: Double?,
        strings: MediaKindStrings,
    ): String {
        val kind = kindFor(rawType) ?: Kind.FILE
        return when (kind) {
            Kind.AUDIO -> formatMediaDuration(durationSeconds) ?: strings.name(Kind.AUDIO)
            Kind.FILE -> originalName?.takeIf { it.isNotEmpty() } ?: strings.name(Kind.FILE)
            else -> strings.name(kind)
        }
    }
}
