package me.meeshy.sdk.model.imagine

import me.meeshy.sdk.model.scene.export.ImagerLength
import me.meeshy.sdk.model.scene.export.ImagerLengthChoice

/** Les parties de la carte qu'on touche ou qu'on pince sur l'aperçu. */
enum class ImaginePartId { HEADER, QUOTE, LINK, REPLY, MEDIA, TRANSCRIPT, BACKGROUND }

/**
 * **Les onglets du plateau** — dans l'ordre du porteur (#8692) : le format de l'image en tête, « Frame » (la disposition)
 * AVANT « Fond ». « Médias » n'existe qu'avec un média, « Langue » qu'avec une seconde langue.
 */
enum class ImagineTab {
    STYLES,
    FORMAT,
    FRAME,
    PALETTE,
    TYPEFACE,
    LINK,
    MEDIA,
    DETAILS,
    LANGUAGE,
    ;

    companion object {
        fun offered(hasMedia: Boolean, languageCount: Int): List<ImagineTab> = entries.filter { tab ->
            when (tab) {
                MEDIA -> hasMedia
                LANGUAGE -> languageCount > 1
                else -> true
            }
        }

        /** L'onglet qui règle la partie touchée sur l'aperçu. */
        fun of(part: ImaginePartId): ImagineTab = when (part) {
            ImaginePartId.BACKGROUND -> PALETTE
            ImaginePartId.HEADER -> FRAME
            ImaginePartId.QUOTE, ImaginePartId.REPLY -> TYPEFACE
            ImaginePartId.LINK -> LINK
            ImaginePartId.MEDIA, ImaginePartId.TRANSCRIPT -> MEDIA
        }
    }
}

/** Ce que « Imager » peut produire. L'image fixe est toujours offerte, et toujours en tête. */
enum class ImagineOutput(val fileExtension: String) {
    IMAGE("png"),
    GIF("gif"),
    VIDEO("mp4"),
    ;

    companion object {
        /** Une vidéo s'anime en GIF comme en vidéo ; un son n'a de sens qu'avec sa piste, donc en vidéo seulement. */
        fun offered(kinds: Collection<ImagineMediaKind>): List<ImagineOutput> = when {
            ImagineMediaKind.VIDEO in kinds -> listOf(IMAGE, GIF, VIDEO)
            ImagineMediaKind.AUDIO in kinds -> listOf(IMAGE, VIDEO)
            else -> listOf(IMAGE)
        }
    }
}

/** Les durées d'un son tiré en vidéo sous la minute : 15 s, 30 s, une minute. */
enum class ImagineClipLength(val seconds: Double) {
    FIFTEEN_SECONDS(15.0),
    THIRTY_SECONDS(30.0),
    ONE_MINUTE(60.0),
    ;

    /** La durée qu'elle donne à un son de [soundDuration] secondes ; durée inconnue : la sienne. */
    fun bounded(soundDuration: Double?): Double =
        if (soundDuration == null || !soundDuration.isFinite() || soundDuration <= 0) seconds else minOf(seconds, soundDuration)

    /** La durée qu'un choix désigne PARMI celles offertes : un choix plus long que le son se lit sur celle qui le prend en entier. */
    fun selected(offered: List<ImagineClipLength>, soundDuration: Double?): ImagineClipLength? {
        val effective = bounded(soundDuration)
        return offered.firstOrNull { it.bounded(soundDuration) == effective }
    }

    companion object {
        /** Celles qui coupent le son, puis la première qui le prend en entier. Un son plus court que 15 s n'offre rien. */
        fun offered(soundDuration: Double?): List<ImagineClipLength> {
            if (soundDuration == null || !soundDuration.isFinite() || soundDuration <= 0) return entries
            val offered = entries.filter { it.seconds < soundDuration } + listOfNotNull(entries.firstOrNull { it.seconds >= soundDuration })
            return if (offered.size > 1) offered else emptyList()
        }
    }
}

/** Ce que les panneaux lisent du format pour décider de leur offre — le plateau ne passe que ces drapeaux. */
data class ImagineTrayFormat(
    val showDate: Boolean = false,
    val showConversationTitle: Boolean = false,
    val showAuthors: Boolean = true,
    val showTimes: Boolean = false,
    val mediaIsBackdrop: Boolean = false,
    val arrangementIsSingle: Boolean = false,
    val showsTranscript: Boolean = true,
)

/** Le passage d'un son ou d'une vidéo que la carte animée emporte : ce que la bande d'extrait montre. */
data class ImagineExcerpt(
    val totalSeconds: Double,
    val startSeconds: Double,
    val windowSeconds: Double,
    /** Le son dont la bande montre l'onde — `null` pour une vidéo, qui montre une règle. */
    val soundId: String?,
)

/**
 * **Ce que les panneaux « Frame » et « Médias » OFFRENT** — un réglage n'existe que s'il change la carte (loi 4). Lois
 * pures, miroir de `MessageCardTrayOffer` (iOS).
 */
object ImagineTrayOffer {

    /** Le plateau d'une carte n'offre « agencement » qu'à deux visuels au moins. */
    const val MIN_VISUALS_TO_ARRANGE = 2

    fun hasHeader(format: ImagineTrayFormat, hasTitle: Boolean): Boolean =
        format.showDate || (format.showConversationTitle && hasTitle)

    /** L'orientation de l'en-tête ne se règle que s'il y a un en-tête à orienter. */
    fun offersHeaderOrientation(format: ImagineTrayFormat, hasTitle: Boolean): Boolean = hasHeader(format, hasTitle)

    /** La place des noms ne se règle que si une ligne de nom (ou d'heure) est peinte. */
    fun offersNamesPlacement(format: ImagineTrayFormat): Boolean = format.showAuthors || format.showTimes

    /** OÙ se posent les médias — rien sans image. */
    fun offersMediaLayouts(kinds: Collection<ImagineMediaKind>): Boolean = kinds.any { it.isVisual }

    /** COMMENT ils s'agencent : dès deux visuels, et jamais en fond — le fond n'en montre qu'un. */
    fun offersArrangements(format: ImagineTrayFormat, kinds: Collection<ImagineMediaKind>): Boolean =
        kinds.count { it.isVisual } >= MIN_VISUALS_TO_ARRANGE && !format.mediaIsBackdrop

    /** LEQUEL se montre : « une seule » et « en fond » choisissent parmi deux visuels au moins. */
    fun featuredChoices(format: ImagineTrayFormat, media: List<ImagineMedia>): List<ImagineMedia> {
        val visuals = media.filter { it.kind.isVisual }
        val showsOne = format.mediaIsBackdrop || format.arrangementIsSingle
        return if (visuals.size >= MIN_VISUALS_TO_ARRANGE && showsOne) visuals else emptyList()
    }

    /** « Auteur du média » : hors fond, pour un visuel dont on sait qui l'a posté. */
    fun offersMediaAuthor(format: ImagineTrayFormat, hasMediaAuthors: Boolean): Boolean = hasMediaAuthors && !format.mediaIsBackdrop

    fun offersAudioStyles(kinds: Collection<ImagineMediaKind>): Boolean = ImagineMediaKind.AUDIO in kinds

    /** Le son de la carte : celui dont « Médias » règle la transcription, le minuteur et la durée. */
    fun sound(media: List<ImagineMedia>): ImagineMedia? = media.firstOrNull { it.kind == ImagineMediaKind.AUDIO }

    fun offersTranscript(media: List<ImagineMedia>): Boolean = sound(media)?.transcript != null

    fun offersTimer(media: List<ImagineMedia>): Boolean = sound(media) != null

    /** La police de la transcription ne se choisit que pour une transcription montrée. */
    fun offersTranscriptTypefaces(format: ImagineTrayFormat, media: List<ImagineMedia>): Boolean =
        offersTranscript(media) && format.showsTranscript

    /**
     * Les durées d'une VIDÉO tirée d'un son — rien pour une image fixe, rien quand une vidéo jointe fixe la durée, rien
     * au-delà d'une minute : les quarts les remplacent.
     */
    fun clipLengths(output: ImagineOutput, media: List<ImagineMedia>): List<ImagineClipLength> {
        if (output != ImagineOutput.VIDEO || media.any { it.kind == ImagineMediaKind.VIDEO }) return emptyList()
        val sound = sound(media) ?: return emptyList()
        if (clipQuarters(output, media).isNotEmpty()) return emptyList()
        return ImagineClipLength.offered(sound.durationSeconds)
    }

    /** Au-delà d'une minute, la vidéo rend 1/4 · 2/4 · 3/4 · 4/4 de son média depuis le début (#14332, #13871). */
    fun clipQuarters(output: ImagineOutput, media: List<ImagineMedia>): List<ImagerLengthChoice> {
        if (output != ImagineOutput.VIDEO) return emptyList()
        val source = media.firstOrNull { it.kind == ImagineMediaKind.VIDEO } ?: sound(media) ?: return emptyList()
        val total = source.durationSeconds ?: return emptyList()
        return ImagerLength.choices(Math.round(total * MILLIS_PER_SECOND))
    }

    /**
     * Le passage à exporter se choisit quand la carte s'anime et que son média dure PLUS que l'extrait — sinon il part
     * en entier ; une part en quarts part du début, sans passage à glisser.
     */
    fun excerpt(plan: ImagineMotionPlan?, media: List<ImagineMedia>): ImagineExcerpt? {
        if (plan == null || clipQuarters(plan.output, media).isNotEmpty()) return null
        val source = media.firstOrNull { it.kind == ImagineMediaKind.VIDEO } ?: sound(media) ?: return null
        val total = source.durationSeconds ?: return null
        if (total <= plan.durationSeconds + EXCERPT_TOLERANCE) return null
        return ImagineExcerpt(
            totalSeconds = total,
            startSeconds = plan.startSeconds,
            windowSeconds = plan.durationSeconds,
            soundId = source.id.takeIf { source.kind == ImagineMediaKind.AUDIO },
        )
    }

    private const val MILLIS_PER_SECOND = 1000.0
    private const val EXCERPT_TOLERANCE = 0.25
}
