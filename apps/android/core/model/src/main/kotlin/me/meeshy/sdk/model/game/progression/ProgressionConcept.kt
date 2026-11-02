package me.meeshy.sdk.model.game.progression

import me.meeshy.sdk.model.game.GameBlock
import me.meeshy.sdk.model.game.engagement.EngagementProgress

/**
 * LES CONCEPTS DE « PROGRESSION », DANS L'ORDRE — le miroir de `ProgressionConcepts` (iOS) et de
 * `progressionConcepts()` (web). La première page porte une carte par concept ; la fiche de chacun parcourt la
 * MÊME liste. L'ordre des entrées EST l'ordre de l'écran.
 */
public enum class ProgressionConcept(public val wire: String) {
    Level("level"),
    Points("points"),
    Meesh("meesh"),
    Glory("glory"),
    Flame("flame"),
    Missions("missions"),
    League("league"),
    Season("season"),
    Prestige("prestige"),
    Elans("elans"),
    Badges("badges"),
    Defis("defis"),
    Succes("succes"),
    Showcase("showcase"),
    Atlas("atlas"),
    ;

    public companion object {
        public fun fromWire(value: String?): ProgressionConcept? = entries.firstOrNull { it.wire == value }
    }
}

/**
 * Ce que la liste LIT : la PRÉSENCE des morceaux servis, jamais leur contenu — décider qu'une ligne existe ne
 * demande aucune valeur. Une extension ne se lit pas sans le bloc `game` qui la porte.
 */
public data class ProgressionConceptSource(
    val meesh: Boolean = false,
    val defis: Boolean = false,
    val game: Boolean = false,
    val league: Boolean = false,
    val season: Boolean = false,
    val prestige: Boolean = false,
    val trophies: Boolean = false,
    val atlas: Boolean = false,
) {
    public companion object {
        /**
         * La source lue dans ce que le client a décodé. **La saison** : le partagé la dit servie « même `null` »
         * (aucune saison ne court) ; le décodage confond « absente » et « nulle », donc une saison nulle est lue
         * comme SERVIE dès qu'une autre extension de la vague 2 l'est — la même lecture que iOS.
         */
        public fun of(progress: EngagementProgress, game: GameBlock?): ProgressionConceptSource {
            val wave2Served = game != null &&
                (game.league != null || game.duo != null || game.trophies != null || game.atlas != null ||
                    game.prestige != null || game.visibility != null)
            val served = game != null
            return ProgressionConceptSource(
                meesh = progress.meesh != null,
                defis = progress.achievementSections.isNotEmpty(),
                game = served,
                league = served && game?.league != null,
                season = served && (game?.season != null || wave2Served),
                prestige = served && game?.prestige != null,
                trophies = served && game?.trophies != null,
                atlas = served && game?.atlas != null,
            )
        }
    }
}

public object ProgressionConcepts {

    /**
     * Les concepts SERVIS, dans l'ordre déclaré. `level`, `flame`, `elans`, `badges`, `succes` : toujours ;
     * `meesh` : le solde ou le bloc `game` ; `defis` : la carte d'atteignabilité a une section ; `points`,
     * `glory`, `missions` : le bloc `game` ; `league`, `prestige`, `showcase`, `atlas` : leur extension ;
     * `season` : son extension, même nulle. Devant un ancien serveur, l'écran se raccourcit, il ne ment pas.
     */
    public fun served(source: ProgressionConceptSource): List<ProgressionConcept> =
        ProgressionConcept.entries.filter { isServed(it, source) }

    public fun served(progress: EngagementProgress, game: GameBlock?): List<ProgressionConcept> =
        served(ProgressionConceptSource.of(progress, game))

    private fun isServed(concept: ProgressionConcept, source: ProgressionConceptSource): Boolean = when (concept) {
        ProgressionConcept.Level, ProgressionConcept.Flame, ProgressionConcept.Elans,
        ProgressionConcept.Badges, ProgressionConcept.Succes,
        -> true
        ProgressionConcept.Meesh -> source.game || source.meesh
        ProgressionConcept.Defis -> source.defis
        ProgressionConcept.Points, ProgressionConcept.Glory, ProgressionConcept.Missions -> source.game
        ProgressionConcept.League -> source.league
        ProgressionConcept.Season -> source.season
        ProgressionConcept.Prestige -> source.prestige
        ProgressionConcept.Showcase -> source.trophies
        ProgressionConcept.Atlas -> source.atlas
    }
}
