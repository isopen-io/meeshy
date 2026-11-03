package me.meeshy.sdk.model.game

import me.meeshy.sdk.model.game.engagement.ApiEngagementProgress
import me.meeshy.sdk.model.game.progression.levelStepFacts
import kotlin.math.max

/**
 * L'ÉTAT QUE LES MISES À JOUR OPTIMISTES TRANSFORMENT (#9383) : le bloc `game` et le solde, qui se lisent à DEUX
 * endroits de la charge (`game.treasury.held` et `meesh.balance`) et doivent bouger ensemble.
 */
public data class GameState(val game: GameBlock, val meesh: ApiEngagementProgress.Meesh?)

/**
 * LES MISES À JOUR OPTIMISTES DU JEU (#9383) : « capturer l'instantané, appliquer en local, envoyer, restaurer en cas
 * d'échec ». Chaque geste change l'écran tout de suite ; la relecture qui suit rend la vérité. Miroir de
 * `GameOptimistic` (iOS) et de `apps/web/src/lib/view/game-optimistic.ts`.
 *
 * Elles recalculent par la MÊME loi que la passerelle : niveau, rang, trésor, prix suivant. Aucun nombre n'est inventé
 * ici, et ce que le serveur seul connaît (la mission tirée, le contenu du coffre, la série rallumée) reste ABSENT
 * jusqu'à sa réponse — jamais deviné.
 *
 * Pures : elles rendent une NOUVELLE valeur, ou la MÊME instance quand le geste est impossible (le témoin d'égalité
 * prouve que rien n'a bougé, donc rien à restaurer ni à repeindre).
 */
public object GameOptimistic {

    private const val REROLL_PRICE = 1

    private fun Long.toIntClamped(): Int = coerceIn(0L, Int.MAX_VALUE.toLong()).toInt()

    // Solde

    /** Le trésor à [held] : ses réserves se relisent sur la Gloire du bloc — jamais perdues par un geste. */
    private fun withHeld(state: GameState, held: Int): GameState =
        GameState(state.game.replacing(treasury = state.game.treasuryAt(held)), state.meesh)

    /** Le compteur de Meeshes lit le MÊME prix suivant que le héros de frappe : posé sur l'aperçu du bloc. */
    public fun withMintCounters(state: GameState, debitable: Long, minted: Int = 0): GameState = GameState(
        game = state.game,
        meesh = state.meesh?.let { meesh ->
            meesh.replacing(
                mintedLifetime = meesh.mintedLifetime + minted,
                debitablePoints = debitable.toIntClamped(),
                missingPoints = state.game.mint.missingPoints.toIntClamped(),
                mintCost = state.game.mint.price,
            )
        },
    )

    /** Un mouvement de solde, appliqué à chacune des deux lectures sur SA valeur. */
    private fun shiftBalance(state: GameState, delta: Int): GameState {
        val moved = withHeld(state, state.game.treasury.held + delta)
        return GameState(moved.game, state.meesh?.let { it.replacing(balance = max(0, it.balance + delta)) })
    }

    /** Le solde SERVI fait foi, posé aux DEUX endroits où l'écran le lit. */
    private fun withBalance(state: GameState, balance: Int): GameState {
        val moved = withHeld(state, balance)
        return GameState(moved.game, state.meesh?.replacing(balance = max(0, balance)))
    }

    // Frappe

    public fun afterMint(state: GameState): GameState {
        val game = state.game
        if (!game.mint.canMint) return state
        val price = game.mint.price
        val pocket = game.level.sparks ?: game.level.score
        val score = max(0L, pocket - price)
        val debitable = max(0L, (state.meesh?.debitablePoints?.toLong() ?: pocket) - price)
        val glory = game.glory.atGlory(game.glory.glory + game.mint.gloryGained)
        val levelCap = GloryLaws.levelCap(glory.rank)
        val steps = game.levelStepFacts?.let {
            LevelStepFacts(game.mint.number, it.missionsDone, it.flameRecord, glory.glory, glory.rank)
        }
        val sparks = game.level.sparkLedger?.let { GameSparks.Ledger(score, it.cycle, it.lifetime, it.debt) }
        val level = GameLevelWire.level(
            score = score,
            levelCap = levelCap,
            levelRecord = game.level.shown.record,
            prestige = game.level.prestige,
            steps = steps,
            sparks = sparks,
            levelMaxLifetime = game.level.levelMaxLifetime,
            pastCycleRecords = game.level.ladder?.pastCycleRecords,
        )
        val preview = GameLevelWire.mint(nextPreview(game, score, debitable, glory, levelCap, steps))
        val minted = game.replacing(
            level = level,
            glory = glory,
            mint = preview,
            boosts = game.boosts.replacing(tailwind = tailwindFor(game, level)),
        )
        return withMintCounters(shiftBalance(GameState(minted, state.meesh), 1), debitable, minted = 1)
    }

    private fun tailwindFor(game: GameBlock, level: GameLevel): Double =
        if (game.level.sparks == null) {
            GameBoostLaws.tailwindFactor(level.shown.level, level.shown.record)
        } else {
            GameBoostLaws.sparksTailwindFactor(level.shown.level, level.shown.record)
        }

    /**
     * L'aperçu de la frappe SUIVANTE, par la loi que la passerelle servira : devant un serveur des étincelles,
     * `sparksPreview` (prix de rang x facteur du niveau d'APRÈS, dette et réserve comprises) ; devant un serveur
     * antérieur, la loi d'avant.
     */
    private fun nextPreview(
        game: GameBlock,
        pocket: Long,
        debitable: Long,
        glory: GameGlory,
        levelCap: Int?,
        steps: LevelStepFacts?,
    ): GameMintPreview {
        if (game.level.sparks == null) {
            return GameMint.preview(pocket, game.mint.number, debitable, levelCap, steps)
        }
        return GameMint.sparksPreview(
            sparks = pocket,
            mintedLifetime = game.mint.number,
            held = game.treasury.held + 1,
            glory = glory.glory,
            levelCap = levelCap,
            steps = steps,
            mythic = glory.rank == GloryRank.Mythe,
            debt = game.level.sparksDebt ?: 0L,
        )
    }

    // Gel

    public fun afterFreeze(state: GameState): GameState {
        val flame = state.game.flame
        if (flame.freezes >= flame.maxFreezes || state.game.treasury.held < flame.freezePrice) return state
        val bought = GameState(state.game.replacing(flame = flame.replacing(freezes = flame.freezes + 1)), state.meesh)
        return shiftBalance(bought, -flame.freezePrice)
    }

    // Changement de mission

    public fun afterReroll(state: GameState): GameState {
        if (!state.game.missions.rerollAvailable) return state
        val spent = GameState(
            state.game.replacing(missions = state.game.missions.replacing(rerollAvailable = false)),
            state.meesh,
        )
        return shiftBalance(spent, -REROLL_PRICE)
    }

    /** La mission servie prend la place de l'ancienne, au même rang ; le solde servi fait foi. */
    public fun withRerolled(state: GameState, missionId: String, mission: GameMission, balance: Int): GameState {
        val items = state.game.missions.items.map { if (it.id == missionId) mission else it }
        val swapped = GameState(state.game.replacing(missions = state.game.missions.replacing(items = items)), state.meesh)
        return withBalance(swapped, balance)
    }

    // Coffre

    public fun afterChestOpening(state: GameState): GameState {
        if (state.game.chest.status != ChestStatus.Ready) return state
        val opened = state.game.chest.replacing(status = ChestStatus.Claimed, reward = Put(null))
        return GameState(state.game.replacing(chest = opened), state.meesh)
    }

    /**
     * Le contenu servi s'y pose, et le score en poche après le crédit ([score], la poche SERVIE, qui fait foi). Les
     * étincelles du coffre suivent la loi du gain (`GameSparks.afterCredit`) : la dette se rembourse d'abord, le cycle
     * et le total à vie montent du gain entier. Le niveau, le Vent arrière et le prix suivant se relisent sur la poche
     * d'après. La Gloire du coffre et le gel offert restent ceux du bloc jusqu'à la relecture : rejouée, une
     * réclamation déjà servie les compterait deux fois.
     * [starFragments] : le total collecté tel que la passerelle le sert après l'ouverture — `null`, il reste celui du bloc.
     */
    public fun withChestReward(
        state: GameState,
        reward: DailyChest,
        score: Long,
        starFragments: StarFragmentsTotal? = null,
    ): GameState {
        val game = state.game
        val sparks = game.level.sparkLedger?.let { served ->
            val credited = GameSparks.afterCredit(served, reward.points.toLong())
            GameSparks.ledgerOf(score, credited.cycle, credited.lifetime, credited.debt)
        }
        val levelCap = GloryLaws.levelCap(game.glory.rank)
        val steps = game.levelStepFacts
        val level = GameLevelWire.level(
            score = sparks?.pocket ?: score,
            levelCap = levelCap,
            levelRecord = game.level.shown.record,
            prestige = game.level.prestige,
            steps = steps,
            sparks = sparks,
            levelMaxLifetime = game.level.levelMaxLifetime,
            pastCycleRecords = game.level.ladder?.pastCycleRecords,
        )
        val claimed = game.replacing(
            level = level,
            mint = sparks?.let {
                GameLevelWire.mint(
                    GameMint.sparksPreview(
                        sparks = it.pocket,
                        mintedLifetime = max(0, game.mint.number - 1),
                        held = game.treasury.held,
                        glory = game.glory.glory,
                        levelCap = levelCap,
                        steps = steps,
                        mythic = game.glory.rank == GloryRank.Mythe,
                        debt = it.debt,
                    ),
                )
            },
            chest = game.chest.replacing(status = ChestStatus.Claimed, reward = Put(reward)),
            boosts = game.boosts.replacing(tailwind = tailwindFor(game, level)),
            starFragments = starFragments?.let { Put(it) },
        )
        val next = GameState(claimed, state.meesh)
        return sparks?.let { withMintCounters(next, it.pocket) } ?: next
    }

    // Rallumage

    public fun afterRelight(state: GameState): GameState {
        val flame = state.game.flame
        if (!flame.canRelight) return state
        val lit = GameState(
            state.game.replacing(flame = flame.replacing(status = FlameStatus.Lit, canRelight = false)),
            state.meesh,
        )
        return shiftBalance(lit, -flame.relightPrice)
    }

    /** La série servie fixe les jours, la forme et le bonus ; le solde servi fait foi. */
    public fun withRelit(state: GameState, streak: Int, balance: Int): GameState {
        val flame = state.game.flame.replacing(
            days = streak,
            form = Put(GameFlameLaw.form(streak)),
            bonusPercent = GameFlameLaw.bonusPercent(streak),
            status = FlameStatus.Lit,
            canRelight = false,
        )
        return withBalance(GameState(state.game.replacing(flame = flame), state.meesh), balance)
    }

    // Guide

    /** Les clés vues entrent aussitôt dans l'état : la prochaine ouverture dira la version COURTE. */
    public fun withGuideSeen(state: GameState, keys: List<String>): GameState {
        val seen = state.game.guideSeen
        val merged = seen + keys.filter { it !in seen }
        if (merged == seen) return state
        return GameState(state.game.replacing(guideSeen = merged), state.meesh)
    }
}
