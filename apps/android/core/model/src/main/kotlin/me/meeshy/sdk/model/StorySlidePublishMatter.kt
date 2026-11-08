package me.meeshy.sdk.model

/**
 * La seule règle qui décide qu'une slide MÉRITE un post (miroir de `StorySlidePublishMatter`, iOS, #4741).
 *
 * Le bouton Publier et le filtre des slides qui partent lisaient deux écritures de la même question, et divergeaient dans les
 * deux sens (lieu, fond choisi, coquille de texte vide). Cette loi est le site unique : les deux la lisent.
 *
 * Elle est DISTINCTE de « la page que je regarde est-elle vierge » : ici, un fond CHOISI répond oui — le geste le plus court qui
 * produise une story qu'on puisse regarder.
 */
public object StorySlidePublishMatter {

    /** Ce que la loi lit d'une slide : des comptes déjà filtrés par l'appelant (un texte vide n'est jamais compté). */
    public data class Facts(
        /** La légende de la slide. */
        val caption: String = "",
        /** Les textes posés sur le canevas dont le contenu n'est pas vide (coquille de texte écartée). */
        val realTextObjects: Int = 0,
        val mediaCount: Int = 0,
        val hasBackgroundMedia: Boolean = false,
        val stickerCount: Int = 0,
        val placeCount: Int = 0,
        val strokeCount: Int = 0,
        val soundCount: Int = 0,
        /** Un fond de couleur ou de dégradé CHOISI. */
        val hasChosenBackground: Boolean = false,
    )

    /**
     * La slide mérite-t-elle un post ? Une coquille de texte vide ne compte pas ; lieu, son, fond choisi, dessin, sticker et
     * média comptent. [countingCaption] à `false` pose la question hors légende : un post ou un réel ne se légende pas par diapo.
     */
    public fun deservesAPost(facts: Facts, countingCaption: Boolean = true): Boolean =
        (countingCaption && facts.caption.isNotBlank()) || carriesMatter(facts)

    /** La matière de la slide hors légende. */
    public fun carriesMatter(facts: Facts): Boolean =
        facts.realTextObjects > 0 || facts.mediaCount > 0 || facts.hasBackgroundMedia || facts.stickerCount > 0 ||
            facts.placeCount > 0 || facts.strokeCount > 0 || facts.soundCount > 0 || facts.hasChosenBackground

    /**
     * Un OBJET posé sur la slide (miroir de `carriesObject`, iOS) : texte réel, média, fond média, sticker, lieu, dessin ou son.
     * Un fond de couleur nu n'en est pas un : il décore une page qui reste vide, et un post n'y dit rien à personne.
     */
    public fun carriesObject(facts: Facts): Boolean =
        facts.realTextObjects > 0 || facts.mediaCount > 0 || facts.hasBackgroundMedia || facts.stickerCount > 0 ||
            facts.placeCount > 0 || facts.strokeCount > 0 || facts.soundCount > 0

    /** Y a-t-il, dans tout le composer, de quoi publier ? */
    public fun anyDeservesAPost(slides: List<Facts>, countingCaption: Boolean = true): Boolean =
        slides.any { deservesAPost(it, countingCaption) }
}
