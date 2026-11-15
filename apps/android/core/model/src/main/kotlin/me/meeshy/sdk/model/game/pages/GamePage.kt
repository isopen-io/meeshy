package me.meeshy.sdk.model.game.pages

import me.meeshy.sdk.model.game.progression.ProgressionConcept

/**
 * Les portes du jeu au troisième niveau (iOS `GamePage`) : la Ligue, le Voyage, la Vitrine, l'Atlas, la Renaissance
 * et les Réglages. Une page a UN parent : la fiche du concept dont elle est la sous-page (les Réglages, comme le
 * carnet, se tiennent au deuxième niveau et reviennent à la première page). Le retour ramène donc toujours un niveau
 * plus haut — jamais hors du jeu.
 */
public enum class GamePage(public val wire: String, public val concept: ProgressionConcept?) {
    League("league", ProgressionConcept.League),
    Season("season", ProgressionConcept.Season),
    Showcase("showcase", ProgressionConcept.Showcase),
    Atlas("atlas", ProgressionConcept.Atlas),
    Prestige("prestige", ProgressionConcept.Prestige),
    Settings("settings", null),
    ;

    public companion object {
        public fun fromWire(value: String?): GamePage? = entries.firstOrNull { it.wire == value }
    }
}

/**
 * « Aller plus loin » : la sous-page du concept, et ELLE SEULE (iOS `ProgressionConceptModel.links`). Aucun lien
 * transverse : les sept concepts du jeu de base n'en ont pas, la section ne paraît pas.
 */
public object GamePageLinks {
    public fun of(concept: ProgressionConcept): List<GamePage> =
        GamePage.entries.filter { it.concept == concept }
}
