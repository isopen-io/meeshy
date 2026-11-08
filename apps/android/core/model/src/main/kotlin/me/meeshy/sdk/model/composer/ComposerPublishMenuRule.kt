package me.meeshy.sdk.model.composer

import me.meeshy.sdk.model.MosaicLayoutMode

/**
 * Ce que l'auteur publie, décidé au moment où il publie — port de iOS `ComposerPublishChoice` (#13920). Le choix est
 * COMPOSITE : un ou plusieurs formats parmi story, post et réel, un seul geste les publie tous. Jamais vide.
 */
class ComposerPublishChoice private constructor(
    /** Les formats qui PARTENT, rangés dans l'ordre du menu : le premier GOUVERNE la scène. */
    val formats: List<ComposerFormat>,
    /** La disposition des scènes du POST ; `null` ⇒ le repli du modèle s'applique. */
    val layout: MosaicLayoutMode?,
) {
    val format: ComposerFormat get() = formats.first()

    /** La story part AUSSI en réel (#9476) : une seule requête, le serveur fait le réel de la story. */
    val alsoAsReel: Boolean get() = ComposerFormat.STORY in formats && ComposerFormat.REEL in formats

    /**
     * Une publication par format : la story emporte son réel quand les deux sont cochés, le post emporte la disposition.
     */
    val legs: List<ComposerPublishChoice>
        get() = formats.mapNotNull { f ->
            when {
                f == ComposerFormat.REEL && alsoAsReel -> null
                f == ComposerFormat.STORY -> of(ComposerFormat.STORY, null, alsoAsReel)
                f == ComposerFormat.POST -> of(ComposerFormat.POST, layout)
                else -> of(f, null)
            }
        }

    override fun equals(other: Any?): Boolean = other is ComposerPublishChoice && formats == other.formats && layout == other.layout

    override fun hashCode(): Int = 31 * formats.hashCode() + (layout?.hashCode() ?: 0)

    override fun toString(): String = "ComposerPublishChoice(formats=$formats, layout=$layout)"

    companion object {
        fun of(format: ComposerFormat, layout: MosaicLayoutMode?, alsoAsReel: Boolean = false): ComposerPublishChoice =
            ComposerPublishChoice(
                formats = if (alsoAsReel) ComposerFormat.allComposable.filter { it == format || it == ComposerFormat.REEL } else listOf(format),
                layout = layout,
            )

        /** `null` quand rien n'est coché : un choix publie toujours quelque chose. La disposition ne survit qu'avec le post. */
        fun ofFormats(formats: List<ComposerFormat>, layout: MosaicLayoutMode?): ComposerPublishChoice? {
            val ordered = ComposerFormat.allComposable.filter { it in formats }
            if (ordered.isEmpty()) return null
            return ComposerPublishChoice(ordered, layout.takeIf { ComposerFormat.POST in ordered })
        }
    }
}

/** La surface montée à l'ouverture : la scène (atelier), le document, ou la feuille de l'humeur. */
enum class ComposerSurfaceKind { SCENE, DOCUMENT, MOOD }

/**
 * Port de iOS `ComposerPublishMenuRule` : la règle PURE du menu du chevron « Publier ▾ » — ses entrées (refus grisés AVEC
 * leur raison), sa présence, le choix armé, les coches, le canal d'envoi. Le chevron ARME un choix ; seule la partie
 * principale de la capsule publie.
 */
object ComposerPublishMenuRule {

    data class Entry(
        val format: ComposerFormat,
        val verdict: FormatVerdict,
        /** Vide ⇒ un bouton simple ; sinon le sous-menu des dispositions. */
        val layouts: List<MosaicLayoutMode>,
    ) {
        val isChoosable: Boolean get() = verdict.isChoosable
        val denial: FormatDenial? get() = verdict.denial

        /** Ce que chaque geste CHOISIT : un geste, un choix. */
        val choices: List<ComposerPublishChoice>
            get() = if (layouts.isEmpty()) listOf(ComposerPublishChoice.of(format, null)) else layouts.map { ComposerPublishChoice.of(format, it) }
    }

    /**
     * Les formats de la porte dans SON ordre ; Post déplie les dispositions là où elles voyagent ([layoutsTravel] : le canal
     * porte les fichiers) et dès deux scènes.
     */
    fun entries(
        candidates: List<ComposerFormat>,
        offered: List<ComposerFormat>,
        carriesMoreThanText: Boolean,
        slideCount: Int,
        layoutsTravel: Boolean,
    ): List<Entry> = ComposerFormatAvailability.verdicts(candidates, offered, carriesMoreThanText).map { verdict ->
        val layouts = if (layoutsTravel) ComposerFormatVariant.of(verdict.format).layouts(slideCount) else emptyList()
        Entry(verdict.format, verdict, layouts)
    }

    /** Le chevron CHOISIT, il ne publie pas : seul l'envoi le fige. */
    fun chevronIsEnabled(isPublishing: Boolean): Boolean = !isPublishing

    /** `null` quand le menu n'offrirait qu'un geste : une entrée unique sans sous-menu est une affordance sans choix. */
    fun menu(
        candidates: List<ComposerFormat>,
        offered: List<ComposerFormat>,
        carriesMoreThanText: Boolean,
        slideCount: Int,
        layoutsTravel: Boolean,
    ): List<Entry>? = entries(candidates, offered, carriesMoreThanText, slideCount, layoutsTravel)
        .takeIf { menu -> menu.sumOf { it.choices.size } > 1 }

    /**
     * Ce que la partie principale publie. Un choix que le menu n'offre plus (scène retirée, format grisé) retombe sur le
     * format de la porte ; « aussi en réel » ne survit que là où le menu l'offre. Relu FORMAT PAR FORMAT.
     */
    fun armed(
        chosen: ComposerPublishChoice?,
        defaultFormat: ComposerFormat,
        entries: List<Entry>?,
        companionReelOffered: Boolean = false,
    ): ComposerPublishChoice {
        val door = ComposerPublishChoice.of(defaultFormat, null)
        if (chosen == null) return door
        val served = chosen.formats.filter { format ->
            val entry = entries?.firstOrNull { it.format == format }?.takeIf { it.isChoosable } ?: return@filter false
            val layout = chosen.layout
            format != ComposerFormat.POST || layout == null || layout in entry.layouts
        }
        val accompanies = companionReelOffered && ComposerFormat.STORY in served
        val kept = served.filter { it != ComposerFormat.REEL || accompanies || ComposerFormat.STORY !in served }
        return ComposerPublishChoice.ofFormats(kept, chosen.layout) ?: door
    }

    /** La story peut partir AUSSI en réel : story ET réel choisissables, UNE scène, jamais une republication. */
    fun companionReelOffered(entries: List<Entry>?, slideCount: Int, isRepost: Boolean = false): Boolean {
        if (slideCount != 1 || isRepost || entries == null) return false
        fun choosable(format: ComposerFormat) = entries.any { it.format == format && it.isChoosable }
        return choosable(ComposerFormat.STORY) && choosable(ComposerFormat.REEL)
    }

    /**
     * Toucher une entrée la COCHE ou la DÉCOCHE, jamais au point de ne plus rien cocher. Story et réel ne se cochent
     * ensemble que là où la story peut partir en réel : ailleurs, cocher l'un décoche l'autre. Le post se coche avec l'un
     * comme avec l'autre et garde sa disposition.
     */
    fun toggled(format: ComposerFormat, armed: ComposerPublishChoice, companionReelOffered: Boolean): ComposerPublishChoice {
        if (format in armed.formats) {
            return ComposerPublishChoice.ofFormats(armed.formats - format, armed.layout) ?: armed
        }
        val rival = if (companionReelOffered) null else when (format) {
            ComposerFormat.STORY -> ComposerFormat.REEL
            ComposerFormat.REEL -> ComposerFormat.STORY
            else -> null
        }
        return ComposerPublishChoice.ofFormats(armed.formats.filter { it != rival } + format, armed.layout) ?: armed
    }

    /** Choisir une disposition COCHE le post et garde les autres formats. */
    fun choosingLayout(layout: MosaicLayoutMode, armed: ComposerPublishChoice): ComposerPublishChoice =
        ComposerPublishChoice.ofFormats(armed.formats + ComposerFormat.POST, layout) ?: armed

    fun isChecked(entry: Entry, armed: ComposerPublishChoice): Boolean = entry.format in armed.formats

    /** La disposition cochée du sous-menu : l'armée, ou — tant que rien n'est choisi — le repli que la publication applique. */
    fun checkedLayout(entry: Entry, armed: ComposerPublishChoice): MosaicLayoutMode? {
        if (entry.format !in armed.formats || entry.layouts.isEmpty()) return null
        return ComposerMosaicChoice.checked(armed.layout)
    }

    enum class Route { ATELIER, STORY_SCENE, DOCUMENT, UNSUPPORTED }

    /**
     * La surface est celle d'OUVERTURE ; le canal suit le GESTE. Sous la scène, un choix sans disposition presse l'atelier ;
     * « post + disposition » part par le document, seul canal qui transporte `layout`.
     */
    fun route(surface: ComposerSurfaceKind, choice: ComposerPublishChoice): Route = when (surface) {
        ComposerSurfaceKind.SCENE -> if (choice.layout == null) Route.ATELIER else Route.DOCUMENT
        ComposerSurfaceKind.DOCUMENT, ComposerSurfaceKind.MOOD -> when (ComposerPublishChannel.of(choice.format)) {
            ComposerPublishChannel.SCENE -> Route.STORY_SCENE
            ComposerPublishChannel.DOCUMENT -> Route.DOCUMENT
            ComposerPublishChannel.UNSUPPORTED -> Route.UNSUPPORTED
        }
    }

    sealed interface Dispatch {
        data class Atelier(val format: ComposerFormat, val alsoAsReel: Boolean) : Dispatch
        data class StoryScene(val format: ComposerFormat, val alsoAsReel: Boolean) : Dispatch
        data class Document(val choice: ComposerPublishChoice) : Dispatch
        data object Unsupported : Dispatch
    }

    /** Une requête par format : chaque publication du choix composite emprunte le canal de son format. */
    fun dispatches(surface: ComposerSurfaceKind, choice: ComposerPublishChoice): List<Dispatch> =
        choice.legs.map { dispatch(surface, it) }

    fun dispatch(surface: ComposerSurfaceKind, choice: ComposerPublishChoice): Dispatch = when (route(surface, choice)) {
        Route.ATELIER -> Dispatch.Atelier(choice.format, choice.alsoAsReel)
        Route.STORY_SCENE -> Dispatch.StoryScene(choice.format, choice.alsoAsReel)
        Route.DOCUMENT -> Dispatch.Document(choice)
        Route.UNSUPPORTED -> Dispatch.Unsupported
    }

    /** Le texte du post que l'ATELIER doit emporter (#8473) : seulement sous le post, et un texte blanc ne remplace rien. */
    fun atelierCarriedPostText(route: Route, choice: ComposerPublishChoice, documentText: String): String? =
        documentText.takeIf { route == Route.ATELIER && choice.format == ComposerFormat.POST && it.isNotBlank() }
}
