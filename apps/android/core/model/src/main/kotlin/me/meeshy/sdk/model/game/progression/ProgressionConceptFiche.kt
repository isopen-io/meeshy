package me.meeshy.sdk.model.game.progression

import me.meeshy.sdk.model.game.GameBlock
import me.meeshy.sdk.model.game.GameCopyLaws
import me.meeshy.sdk.model.game.GameText
import me.meeshy.sdk.model.game.GameTextArg
import me.meeshy.sdk.model.game.GameTextKey
import me.meeshy.sdk.model.game.SeasonMoment
import me.meeshy.sdk.model.game.engagement.EngagementAxisFamily
import me.meeshy.sdk.model.game.engagement.EngagementProgress

/** Une phrase et les faits qu'elle enchâsse (iOS `ProgressionFactText`). */
public data class FicheStateLine(val text: GameText, val facts: List<ConceptFact>) {
    public constructor(text: GameText, vararg facts: ConceptFact) : this(text, facts.toList())
}

/** Une ligne « libellé → valeur » de « Où j'en suis » et l'IDENTITÉ du fait qu'elle dit (iOS `ProgressionConceptFact`). */
public data class FicheFact(val label: GameText, val value: GameText, val identity: ConceptFact?)

/** Ce qui tient la tête de la fiche. */
public sealed interface FicheHead {
    /** L'emblème en grand, la valeur, la ligne de la carte, la jauge. */
    public data object Generic : FicheHead

    /** TA LUMIÈRE : la poche en grand, le « depuis toujours » en petit, l'Ombre avant tout. */
    public data class Sparks(val head: GameSparksHead) : FicheHead

    /** La pièce de jeu du concept, à la place du héros générique. */
    public data object Piece : FicheHead
}

/**
 * CE QUE LA FICHE D'UN CONCEPT DIT SOUS SA TÊTE — « Où j'en suis » NE REDIT RIEN : un fait ne paraît qu'une fois par
 * écran (miroir de `ProgressionConceptFiche`, iOS, #11180, et de `ficheView`, web). On compare des IDENTITÉS, jamais des
 * chaînes :
 *
 *  - la tête et les gestes du concept disent déjà certains faits ;
 *  - la phrase d'état disparaît dès qu'elle en enchâsse un ;
 *  - quand elle reste, les lignes ne redisent ni ce que l'écran montre, ni ce qu'elle dit.
 */
public data class ProgressionConceptFiche(
    val head: FicheHead,
    /** La ligne sous la valeur du héros générique ; `null` quand les gestes de la fiche la disent déjà. */
    val heroLine: GameText?,
    /** La phrase d'état, quand elle ne redit aucun fait déjà à l'écran. */
    val state: FicheStateLine?,
    /** « Où j'en suis » : les faits que l'écran ne dit pas déjà. */
    val facts: List<FicheFact>,
) {
    /** La section « Où j'en suis » paraît-elle ? */
    val hasWhere: Boolean get() = state != null || facts.isNotEmpty()
}

public object ProgressionConceptFiches {

    /**
     * [pieceIsHero] : la PIÈCE de jeu du concept (l'anneau du niveau, l'Héritage, la joute, les Élans) tient la tête à
     * la place du héros générique — iOS `ProgressionConceptGestures.isHero`. C'est l'écran qui le sait.
     */
    public fun make(
        concept: ProgressionConcept,
        progress: EngagementProgress,
        game: GameBlock?,
        nowMillis: Long,
        moment: SeasonMoment,
        pieceIsHero: Boolean = false,
    ): ProgressionConceptFiche {
        val head = headKind(concept, game, pieceIsHero)
        val shown = shows(concept, game, pieceIsHero)
        if (shown == Shown.All) return ProgressionConceptFiche(head, heroLine = null, state = null, facts = emptyList())
        val gestures = gesturesShow(concept, game)
        val card = ProgressionConceptModel.card(concept, progress, game, nowMillis, moment)
        val heroLine = if (shown == null && card.lineFacts.none { it in gestures }) card.line else null
        val onScreen: Set<ConceptFact> = when (shown) {
            is Shown.Facts -> shown.facts + gestures
            else -> setOfNotNull(card.valueFact, card.emblemFact) + (if (heroLine != null) card.lineFacts else emptySet()) + gestures
        }
        val state = ProgressionConceptStates.stateLine(concept, progress, game)?.takeIf { said -> said.facts.none { it in onScreen } }
        val told = onScreen + state?.facts.orEmpty()
        val facts = rows(concept, progress, game, nowMillis).filter { fact -> fact.identity?.let { it !in told } ?: true }
        return ProgressionConceptFiche(head, heroLine, state, facts)
    }

    private sealed interface Shown {
        data object All : Shown

        data class Facts(val facts: Set<ConceptFact>) : Shown
    }

    private fun headKind(concept: ProgressionConcept, game: GameBlock?, pieceIsHero: Boolean): FicheHead {
        if (concept == ProgressionConcept.Points && game != null) return FicheHead.Sparks(GameSparksHead.of(game.level))
        return if (pieceIsHero) FicheHead.Piece else FicheHead.Generic
    }

    /** Les faits que la tête montre quand elle n'est pas le héros générique ; `null` : le héros générique. */
    private fun shows(concept: ProgressionConcept, game: GameBlock?, pieceIsHero: Boolean): Shown? {
        if (concept == ProgressionConcept.Points && game != null) return Shown.Facts(GameSparksHead.of(game.level).facts.toSet())
        if (!pieceIsHero) return null
        return when (concept) {
            ProgressionConcept.League ->
                Shown.Facts(setOf(ConceptFact.League, ConceptFact.LeaguePlace, ConceptFact.WeekPoints, ConceptFact.LeagueCloses))
            ProgressionConcept.Elans -> Shown.Facts(setOf(ConceptFact.Factor, ConceptFact.ElanFamilies))
            else -> Shown.All
        }
    }

    /** Les faits que les GESTES de la fiche montrent déjà : les tuiles de la Flamme, l'Offrande du Rêve. */
    private fun gesturesShow(concept: ProgressionConcept, game: GameBlock?): Set<ConceptFact> {
        if (game == null) return emptySet()
        return when (concept) {
            ProgressionConcept.Flame -> setOf(ConceptFact.FlameForm, ConceptFact.Freezes)
            ProgressionConcept.Missions -> setOf(ConceptFact.Chest, ConceptFact.PrismDay)
            else -> emptySet()
        }
    }

    // Les lignes de « Où j'en suis », chacune avec son identité

    private fun fact(label: GameTextKey, value: GameText, identity: ConceptFact?): FicheFact =
        FicheFact(GameText(label), value, identity)

    /** Un nombre seul, écrit par la locale (iOS `GameCopy.formatCount`). */
    private fun count(value: Int): GameText = GameText(GameTextKey.JoinedBySpace, listOf(GameTextArg.Count(value)))

    private fun ratio(done: Int, total: Int): GameText = GameText.of(GameTextKey.Ratio, GameTextArg.Count(done), GameTextArg.Count(total))

    /**
     * Les lignes d'un concept. Niveau, Héritage, Ligue, Voyage, Renaissance et Élans attendent leur port (#13909) :
     * leur fiche ne dit encore que ce que sa tête montre.
     */
    public fun rows(
        concept: ProgressionConcept,
        progress: EngagementProgress,
        game: GameBlock?,
        @Suppress("UNUSED_PARAMETER") nowMillis: Long,
    ): List<FicheFact> = when (concept) {
        ProgressionConcept.Glory -> gloryRows(game)
        ProgressionConcept.Flame -> flameRows(progress, game)
        ProgressionConcept.Badges -> badgesRows(progress)
        ProgressionConcept.Defis -> listOf(
            fact(
                GameTextKey.FactRemaining,
                count((ProgressionConceptModel.defisTotal(progress) - ProgressionConceptModel.defisDone(progress)).coerceAtLeast(0)),
                ConceptFact.Left,
            ),
        )
        ProgressionConcept.Succes -> listOf(
            fact(
                GameTextKey.FactRemaining,
                count((progress.achievements.size - progress.unlockedAchievementCount).coerceAtLeast(0)),
                ConceptFact.Left,
            ),
        )
        ProgressionConcept.Showcase -> listOfNotNull(
            game?.visibility?.let {
                fact(GameTextKey.FactVisible, ProgressionConceptModel.visibilityLabel(it.showcase), ConceptFact.ShowcaseVisibility)
            },
        )
        ProgressionConcept.Atlas -> atlasRows(game)
        ProgressionConcept.Points, ProgressionConcept.Meesh, ProgressionConcept.Missions,
        ProgressionConcept.Level, ProgressionConcept.League, ProgressionConcept.Season,
        ProgressionConcept.Prestige, ProgressionConcept.Elans,
        -> emptyList()
    }

    private fun gloryRows(game: GameBlock?): List<FicheFact> {
        val glory = game?.glory ?: return emptyList()
        val next = glory.next?.let { ProgressionConceptModel.rankLabel(it.rank, it.division5 ?: it.division) }
        return listOfNotNull(
            fact(GameTextKey.ConceptNameGlory, count(glory.glory), ConceptFact.Glory),
            next?.let { fact(GameTextKey.FactNextRank, it, ConceptFact.RankNext) },
            next?.let { name ->
                glory.gloryMissing?.let { missing ->
                    FicheFact(
                        GameText.of(GameTextKey.FactMissingForRank, GameTextArg.Nested(name)),
                        GameCopyLaws.gloryAmount(GameTextArg.Count(missing)),
                        ConceptFact.GloryMissing,
                    )
                }
            },
        )
    }

    /** La forme et les Veilleuses sont aux tuiles de la fiche, leurs prix aux gestes : ici, ce qui reste. */
    private fun flameRows(progress: EngagementProgress, game: GameBlock?): List<FicheFact> = listOfNotNull(
        fact(GameTextKey.FactRecord, GameCopyLaws.days(progress.streak.longestDays), ConceptFact.StreakRecord),
        game?.let { ProgressionConceptStates.flameStatus(it.flame.status) }?.let { fact(GameTextKey.FactState, it, ConceptFact.FlameState) },
    )

    private fun badgesRows(progress: EngagementProgress): List<FicheFact> {
        val families = progress.axesByFamily.map { group ->
            val reached = group.axes.sumOf { it.scale.reachedCount }
            val total = group.axes.sumOf { it.scale.tiers.size }
            FicheFact(GameText(familyKey(group.family)), ratio(reached, total), identity = null)
        }
        val left = fact(GameTextKey.FactRemaining, count((progress.badgesTotal - progress.badgesEarned).coerceAtLeast(0)), ConceptFact.Left)
        return listOf(left) + families
    }

    private fun familyKey(family: EngagementAxisFamily): GameTextKey = when (family) {
        EngagementAxisFamily.CONTENT -> GameTextKey.FamilyContent
        EngagementAxisFamily.COMMENT -> GameTextKey.FamilyComment
        EngagementAxisFamily.CONVERSATION -> GameTextKey.FamilyConversation
        EngagementAxisFamily.TOOL -> GameTextKey.FamilyTool
        EngagementAxisFamily.SOCIAL -> GameTextKey.FamilySocial
    }

    private fun atlasRows(game: GameBlock?): List<FicheFact> {
        val atlas = game?.atlas ?: return emptyList()
        return listOfNotNull(
            fact(GameTextKey.FactRemaining, count((atlas.total - atlas.stamped).coerceAtLeast(0)), ConceptFact.AtlasLeft),
            if (atlas.pending.isEmpty()) null else fact(GameTextKey.FactPending, count(atlas.pending.size), ConceptFact.AtlasPending),
            game.visibility?.let { fact(GameTextKey.FactVisible, ProgressionConceptModel.visibilityLabel(it.atlas), ConceptFact.AtlasVisibility) },
        )
    }
}
