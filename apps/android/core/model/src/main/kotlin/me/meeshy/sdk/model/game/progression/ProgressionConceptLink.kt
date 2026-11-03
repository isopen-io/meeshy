package me.meeshy.sdk.model.game.progression

import me.meeshy.sdk.model.game.pages.GamePage
import me.meeshy.sdk.model.game.pages.GamePageLinks

/**
 * La sous-page d'une fiche (« Aller plus loin ») : le troisième niveau du jeu. Miroir de `ProgressionConceptLink`
 * (iOS) : une page du jeu, ou une section de la progression (Médailles, Défis, Hauts faits).
 */
public sealed interface ProgressionConceptLink {
    public val id: String

    public data class Page(val page: GamePage) : ProgressionConceptLink {
        override val id: String get() = "page.${page.wire}"
    }

    public data class Section(val concept: ProgressionConcept) : ProgressionConceptLink {
        override val id: String get() = "section.${concept.wire}"
    }
}

public object ProgressionConceptLinks {

    private val sections = setOf(ProgressionConcept.Badges, ProgressionConcept.Defis, ProgressionConcept.Succes)

    /**
     * La sous-page du concept, et ELLE SEULE. Les sept concepts du jeu de base n'en ont pas : la section ne paraît
     * pas.
     */
    public fun of(concept: ProgressionConcept): List<ProgressionConceptLink> =
        GamePageLinks.of(concept).map { ProgressionConceptLink.Page(it) } +
            if (concept in sections) listOf(ProgressionConceptLink.Section(concept)) else emptyList()
}
