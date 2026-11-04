package me.meeshy.sdk.model.paste

import java.time.LocalDateTime

/** La famille d'un média collé : celle de la porte d'ingestion qui l'accueille (iOS `ComposerIngestPipeline`). */
public enum class PastedPipeline { IMAGE, VIDEO, AUDIO, FILE }

/** La nature d'un élément collé, lue sur ses seuls types MIME, sans le charger. */
public sealed interface PastedKind {
    public data object Text : PastedKind
    public data class Media(val pipeline: PastedPipeline) : PastedKind
}

/** Ce que le presse-papiers remet au champ, une fois classé. */
public sealed interface PastedContent {
    public data class Text(val text: String) : PastedContent
    public data class Media(val pipeline: PastedPipeline) : PastedContent
}

/** Ce que le composeur fait de ce qu'on colle (miroir de `PastedContentDecision`, iOS #9037). */
public sealed interface PastedContentDecision {
    /** Le texte tient dans la limite d'un message : il entre dans le champ. */
    public data object InsertText : PastedContentDecision

    /** Le texte ferait dépasser la limite : il part en document `.txt`, le champ reste intact. */
    public data object AttachText : PastedContentDecision

    /** Une image, une vidéo, un son ou un document : l'objet devient pièce jointe. */
    public data class AttachMedia(val pipeline: PastedPipeline) : PastedContentDecision
}

/**
 * Ce qu'on colle part toujours — miroir de `PastedContentRouter` (iOS). Règle pure : aucun Android, aucun disque.
 * Les longueurs sont des unités UTF-16 (`String.length`), comme `content.length` de JavaScript.
 */
public object PastedContentRouter {

    public fun length(text: String): Int = text.length

    public fun decide(
        content: PastedContent,
        currentLength: Int,
        replacedLength: Int = 0,
        limit: Int,
    ): PastedContentDecision = when (content) {
        is PastedContent.Media -> PastedContentDecision.AttachMedia(content.pipeline)
        is PastedContent.Text -> {
            val resulting = maxOf(0, currentLength - replacedLength) + length(content.text)
            if (resulting > limit) PastedContentDecision.AttachText else PastedContentDecision.InsertText
        }
    }

    /**
     * Le texte brut gagne sur le média (un passage illustré se colle comme du texte) ; une image seule est l'image ;
     * un fichier copié est une pièce, jamais un chemin.
     */
    public fun classify(mimeTypes: List<String>): PastedKind {
        val types = mimeTypes.map { it.lowercase().substringBefore(';').trim() }
        fun any(predicate: (String) -> Boolean) = types.any(predicate)
        return when {
            any { it == "text/plain" } -> PastedKind.Text
            any { it.startsWith("image/") } -> PastedKind.Media(PastedPipeline.IMAGE)
            any { it.startsWith("video/") } -> PastedKind.Media(PastedPipeline.VIDEO)
            any { it.startsWith("audio/") } -> PastedKind.Media(PastedPipeline.AUDIO)
            any { it.startsWith("text/") } -> PastedKind.Text
            any { it.isNotEmpty() } -> PastedKind.Media(PastedPipeline.FILE)
            else -> PastedKind.Text
        }
    }

    /** `texte-colle-AAAAMMJJ-HHMMSS.txt` : lisible dans une conversation, sans rien du contenu. */
    public fun fileName(at: LocalDateTime): String {
        fun p(v: Int) = v.toString().padStart(2, '0')
        return "texte-colle-${at.year}${p(at.monthValue)}${p(at.dayOfMonth)}-${p(at.hour)}${p(at.minute)}${p(at.second)}.txt"
    }
}
