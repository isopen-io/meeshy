package me.meeshy.sdk.model.game.progression

import me.meeshy.sdk.model.game.engagement.EngagementAxisFamily

/**
 * L'IDENTITÉ D'UN FAIT RENDU — un fait ne paraît qu'une fois par écran. Miroir de `ProgressionFactID` (iOS) et de
 * `FactId` (`progression-state.ts`) : les mêmes noms de fil. Le dédoublonnage compare des IDENTITÉS, jamais des
 * chaînes : le même fait habillé autrement (une ligne, une phrase qui l'enchâsse) reste le même fait.
 */
@JvmInline
public value class ProgressionFactId(public val wire: String) {
    override fun toString(): String = wire

    public companion object {
        /** « 3 / 12 » pour Médailles, Défis, Hauts faits : ce qui est obtenu, PAR concept. */
        public fun earned(concept: ProgressionConcept): ProgressionFactId = ProgressionFactId("${concept.wire}_earned")

        /** « encore 9 à décrocher » : ce qui reste, PAR concept. */
        public fun left(concept: ProgressionConcept): ProgressionFactId = ProgressionFactId("${concept.wire}_left")

        /** Une famille de médailles, chacune son fait. */
        public fun badgeFamily(family: EngagementAxisFamily): ProgressionFactId =
            ProgressionFactId("badge_family_${family.wire}")

        /**
         * L'identité d'un [ConceptFact] sur la fiche de [concept]. `Earned` et `Left` dépendent du concept ; tout
         * autre fait porte son nom de fil (`LevelNext` → `level_next`).
         */
        public fun of(fact: ConceptFact, concept: ProgressionConcept? = null): ProgressionFactId = when {
            fact == ConceptFact.Earned && concept != null -> earned(concept)
            fact == ConceptFact.Left && concept != null -> left(concept)
            else -> ProgressionFactId(snake(fact.name))
        }

        private fun snake(name: String): String =
            name.fold(StringBuilder()) { out, c ->
                if (c.isUpperCase() && out.isNotEmpty()) out.append('_')
                out.append(c.lowercaseChar())
            }.toString()
    }
}

/** Le dédoublonnage par identité : le premier rendu d'un fait garde sa place, les suivants disparaissent. */
public object ProgressionFactIds {

    /** Les identités d'une liste de faits, dans l'ordre, chacune une fois. */
    public fun distinct(facts: List<ProgressionFactId>): List<ProgressionFactId> = facts.distinct()

    /** Les identités rendues plus d'une fois — un défaut d'écran. */
    public fun duplicates(rendered: List<ProgressionFactId>): Set<ProgressionFactId> =
        rendered.groupingBy { it }.eachCount().filterValues { it > 1 }.keys

    /** Deux phrases à la suite : leurs faits s'additionnent, chacun une fois (iOS `ProgressionFactText.then`). */
    public fun then(first: List<ProgressionFactId>, next: List<ProgressionFactId>): List<ProgressionFactId> =
        first + next.filter { it !in first }
}
