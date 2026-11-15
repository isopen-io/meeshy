package me.meeshy.sdk.model.game.element

import me.meeshy.sdk.model.game.GameBlock
import me.meeshy.sdk.model.game.GameChest
import me.meeshy.sdk.model.game.GameCopyLaws
import me.meeshy.sdk.model.game.GameFlame
import me.meeshy.sdk.model.game.GameGlory
import me.meeshy.sdk.model.game.GameLevel
import me.meeshy.sdk.model.game.GameLevelStep
import me.meeshy.sdk.model.game.GameMintPreview
import me.meeshy.sdk.model.game.GameMission
import me.meeshy.sdk.model.game.GameMissionTitles
import me.meeshy.sdk.model.game.GameMissions
import me.meeshy.sdk.model.game.ChestStatus
import me.meeshy.sdk.model.game.GameText
import me.meeshy.sdk.model.game.GameTextArg
import me.meeshy.sdk.model.game.GameTextKey
import me.meeshy.sdk.model.game.LevelStepFacts
import me.meeshy.sdk.model.game.MeeshEdition
import me.meeshy.sdk.model.game.TreasuryStanding
import me.meeshy.sdk.model.game.engagement.EngagementAxisFamily
import me.meeshy.sdk.model.game.engagement.EngagementCatalog
import me.meeshy.sdk.model.game.engagement.EngagementElanProgress
import me.meeshy.sdk.model.game.progression.FicheFact
import me.meeshy.sdk.model.game.progression.LevelStepDetail
import me.meeshy.sdk.model.game.progression.PieceDetail
import me.meeshy.sdk.model.game.progression.PieceDetailFact
import me.meeshy.sdk.model.game.progression.ProgressionConcept
import me.meeshy.sdk.model.game.progression.ProgressionConceptStates
import me.meeshy.sdk.model.game.progression.ProgressionPieceDetails

/**
 * UNE FONCTION PURE PAR FAMILLE DU CŒUR (miroir de `GameElementDetails`, iOS) : le détail se bâtit depuis le bloc `game`
 * et la progression servie, sans calcul ni donnée inventée — ce que la passerelle ne sert pas ne se dit pas. Les
 * familles qui ont déjà leur construction partagée (anneau, rang, trésor, épreuve) la PROJETTENT, jamais la réécrivent.
 */
public object GameElementDetailsCore {

    private fun count(value: Int): GameTextArg = GameTextArg.Count(value)

    private fun fact(label: GameTextKey, value: GameText): PieceDetailFact = PieceDetailFact(GameText(label), value)

    private fun share(done: Int, total: Int): Double? = if (total > 0) (done.toDouble() / total).coerceIn(0.0, 1.0) else null

    private fun ratio(done: Int, total: Int): GameText = GameText.of(GameTextKey.Ratio, count(done), count(total))

    private fun plus(value: GameText): GameText = GameText.of(GameTextKey.PlusAmount, GameTextArg.Nested(value))

    private fun project(piece: PieceDetail, kind: GameElementKind, emblem: GameElementEmblem, concept: ProgressionConcept): GameElementDetail =
        GameElementDetail(
            kind = kind,
            key = piece.key,
            emblem = emblem,
            name = piece.name,
            status = GameElementStatus.Value(piece.value, piece.progress),
            facts = piece.facts,
            concept = concept,
        )

    /** L'anneau du niveau (lu sur la VÉRITÉ `shown`) : l'état de la lumière en emblème, la valeur et la jauge au centre. */
    public fun levelRing(block: GameLevel): GameElementDetail {
        val level = block.shown
        return project(
            ProgressionPieceDetails.levelRing(block),
            GameElementKind.LevelRing,
            GameElementEmblem.Tier(level.tier, level.level, level.progress),
            ProgressionConcept.Level,
        )
    }

    /** Le blason du rang : la gloire en grand, la jauge vers le rang suivant, ce qu'il manque pour lui. */
    public fun rank(glory: GameGlory): GameElementDetail = project(
        ProgressionPieceDetails.rank(glory),
        GameElementKind.Rank,
        GameElementEmblem.Rank(glory.rank, glory.shownDivision, glory.mythicSeat),
        ProgressionConcept.Glory,
    )

    /** Le contenant de l'Héritage, dessiné en pièce d'argent. */
    public fun treasuryTier(treasury: TreasuryStanding): GameElementDetail = project(
        ProgressionPieceDetails.treasuryTier(treasury),
        GameElementKind.TreasuryTier,
        GameElementEmblem.Coin(MeeshEdition.Silver),
        ProgressionConcept.Meesh,
    )

    /**
     * Une épreuve des niveaux : faite, ou à faire avec où elle en est et sa jauge ; quand les faits sont servis, les dix
     * épreuves en lignes. « Voir la fiche » mène au GESTE qui la fait.
     */
    public fun levelStep(step: GameLevelStep, facts: LevelStepFacts?): GameElementDetail {
        val detail = LevelStepDetail.of(step, facts)
        return GameElementDetail(
            kind = GameElementKind.LevelStep,
            key = "${detail.level}",
            emblem = GameElementEmblem.Concept(detail.concept),
            name = detail.name,
            status = if (detail.met) GameElementStatus.Obtained(null) else GameElementStatus.Locked(detail.missing, detail.progress),
            facts = detail.facts,
            concept = detail.concept,
        )
    }

    /** La forme de la Flamme : les jours d'affilée en valeur, le bonus et l'état en lignes. Sans forme, la Flamme est éteinte. */
    public fun flameForm(flame: GameFlame): GameElementDetail {
        val state = ProgressionConceptStates.flameStatus(flame.status)?.let { fact(GameTextKey.FactState, it) }
        return GameElementDetail(
            kind = GameElementKind.FlameForm,
            key = flame.form?.name ?: "out",
            emblem = GameElementEmblem.Flame(flame.form),
            name = flame.form?.let(GameCopyLaws::flameFormName) ?: GameText(GameTextKey.ConceptNameFlame),
            status = GameElementStatus.Value(GameCopyLaws.days(flame.days), null),
            facts = listOfNotNull(
                fact(GameTextKey.FactBonus, GameText.of(GameTextKey.FactPercent, count(flame.bonusPercent))),
                state,
            ),
            concept = ProgressionConcept.Flame,
        )
    }

    /** Les Veilleuses gardées sur le maximum, et ce que coûte la suivante. */
    public fun freeze(flame: GameFlame): GameElementDetail = GameElementDetail(
        kind = GameElementKind.Freeze,
        key = "freeze",
        emblem = GameElementEmblem.Symbol(GameElementSymbol.Snowflake),
        name = GameText(GameTextKey.FactFreezes),
        status = GameElementStatus.Value(ratio(flame.freezes, flame.maxFreezes), share(flame.freezes, flame.maxFreezes)),
        facts = listOf(fact(GameTextKey.FactFreezePrice, GameCopyLaws.meeshes(flame.freezePrice))),
        concept = ProgressionConcept.Flame,
    )

    /** Un acte du rêve : fait, ou à faire avec où il en est ; sa difficulté, ses étincelles et sa gloire en lignes. */
    public fun mission(mission: GameMission): GameElementDetail = GameElementDetail(
        kind = GameElementKind.Mission,
        key = mission.id,
        emblem = GameElementEmblem.Symbol(GameElementSymbol.Target),
        name = GameMissionTitles.title(mission.templateKey, mission.target),
        status = if (mission.isCompleted) {
            GameElementStatus.Obtained(null)
        } else {
            GameElementStatus.Locked(ratio(mission.progress, mission.target), share(mission.progress, mission.target))
        },
        facts = listOfNotNull(
            fact(GameTextKey.FactTier, GameCopyLaws.difficultyName(mission.difficulty)),
            fact(GameTextKey.ConceptNamePoints, plus(GameCopyLaws.points(mission.reward))),
            if (mission.glory > 0) fact(GameTextKey.ConceptNameGlory, GameText.of(GameTextKey.PlusAmount, count(mission.glory))) else null,
        ),
        concept = ProgressionConcept.Missions,
    )

    /** L'Offrande du jour : ouverte, prête, ou voilée avec les actes faits sur ceux du rêve. */
    public fun chest(chest: GameChest, missions: GameMissions): GameElementDetail {
        val done = missions.items.count { it.isCompleted }
        val total = missions.items.size
        val status = when (chest.status) {
            ChestStatus.Claimed -> GameElementStatus.Obtained(null)
            ChestStatus.Ready -> GameElementStatus.Value(GameText(GameTextKey.ChipChestReady), 1.0)
            ChestStatus.Locked -> GameElementStatus.Locked(ratio(done, total), share(done, total))
        }
        return GameElementDetail(
            kind = GameElementKind.Chest,
            key = missions.dayKey,
            emblem = GameElementEmblem.Chest(open = chest.status == ChestStatus.Claimed),
            name = GameText(GameTextKey.FactChest),
            status = status,
            concept = ProgressionConcept.Missions,
        )
    }

    /** La prochaine pièce : son numéro, son édition, son prix — tels que la passerelle les sert. */
    public fun coin(mint: GameMintPreview): GameElementDetail {
        val edition = mint.edition ?: MeeshEdition.Silver
        val number = GameTextArg.Count(mint.number)
        return GameElementDetail(
            kind = GameElementKind.Coin,
            key = "${mint.number}",
            emblem = GameElementEmblem.Coin(edition),
            name = GameText.of(GameTextKey.FactCoin, number, GameTextArg.Nested(GameCopyLaws.editionName(edition))),
            status = if (mint.canMint) {
                GameElementStatus.Value(GameText(GameTextKey.ChipMintReady), 1.0)
            } else {
                GameElementStatus.Locked(
                    GameText.of(
                        GameTextKey.SpendMissingMint,
                        GameTextArg.Nested(GameCopyLaws.convertiblePoints(mint.missingPoints.coerceIn(0L, Int.MAX_VALUE.toLong()).toInt())),
                        number,
                    ),
                    share((mint.price - mint.missingPoints.coerceIn(0L, Int.MAX_VALUE.toLong()).toInt()).coerceAtLeast(0), mint.price),
                )
            },
            facts = listOf(
                fact(GameTextKey.FactNextPrice, GameCopyLaws.points(mint.price)),
                fact(GameTextKey.ConceptNameGlory, GameText.of(GameTextKey.PlusAmount, count(mint.gloryGained))),
            ),
            concept = ProgressionConcept.Meesh,
        )
    }

    /** Une famille d'élan : active dans la fenêtre servie ou au repos, ce qu'un de ses gestes rapporte au plus, la fenêtre. */
    public fun elanFamily(family: EngagementAxisFamily, elan: EngagementElanProgress?): GameElementDetail {
        val active = elan?.activeFamilies?.contains(family) ?: false
        return GameElementDetail(
            kind = GameElementKind.ElanFamily,
            key = family.wire,
            emblem = GameElementEmblem.Concept(ProgressionConcept.Elans),
            name = GameText(familyName(family)),
            status = GameElementStatus.Value(GameText(if (active) GameTextKey.DetailElanActive else GameTextKey.DetailElanIdle), null),
            facts = listOfNotNull(
                EngagementCatalog.familyTopPoints[family]?.let { fact(GameTextKey.ConceptNamePoints, GameText.of(GameTextKey.ElanPointsUpTo, count(it))) },
                elan?.let { fact(GameTextKey.FactWindow, GameCopyLaws.days(it.windowDays)) },
            ),
            concept = ProgressionConcept.Elans,
        )
    }

    /** Une ligne « libellé → valeur » d'une fiche ou du tableau de bord : ce que la donnée dit, dans SON concept. */
    public fun fact(fact: FicheFact, concept: ProgressionConcept, gauge: Double? = null): GameElementDetail = GameElementDetail(
        kind = GameElementKind.Fact,
        key = "${concept.wire}.${fact.label.key.name}.${fact.label.args.hashCode()}",
        emblem = GameElementEmblem.Concept(concept),
        name = fact.label,
        status = GameElementStatus.Value(fact.value, gauge),
        concept = concept,
        factKey = fact.detail,
    )

    /**
     * L'élément que l'emblème du héros d'une fiche ouvre : l'élément PRINCIPAL du concept quand le bloc `game` le sert ;
     * sinon (et pour les concepts sans élément principal) la ligne [fallback] de la fiche.
     */
    public fun hero(concept: ProgressionConcept, game: GameBlock?, fallback: GameElementDetail): GameElementDetail {
        game ?: return fallback
        return when (concept) {
            ProgressionConcept.Level -> levelRing(game.level)
            ProgressionConcept.Meesh -> coin(game.mint)
            ProgressionConcept.Glory -> rank(game.glory)
            ProgressionConcept.Flame -> flameForm(game.flame)
            ProgressionConcept.Missions -> chest(game.chest, game.missions)
            else -> fallback
        }
    }

    private fun familyName(family: EngagementAxisFamily): GameTextKey = when (family) {
        EngagementAxisFamily.CONTENT -> GameTextKey.FamilyContent
        EngagementAxisFamily.COMMENT -> GameTextKey.FamilyComment
        EngagementAxisFamily.CONVERSATION -> GameTextKey.FamilyConversation
        EngagementAxisFamily.TOOL -> GameTextKey.FamilyTool
        EngagementAxisFamily.SOCIAL -> GameTextKey.FamilySocial
    }
}
