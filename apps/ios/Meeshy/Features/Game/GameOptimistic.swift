import Foundation
import MeeshySDK

/// L'ÉTAT QUE LES MISES À JOUR OPTIMISTES TRANSFORMENT (#9383) — le bloc `game`
/// et le solde, qui se lisent à DEUX endroits de la charge (`game.treasury.held`
/// et `meesh.balance`) et doivent bouger ensemble.
struct GameState: Equatable, Sendable {
    let game: GameBlock
    let meesh: APIEngagementProgress.Meesh?
}

/// LES MISES À JOUR OPTIMISTES DU JEU (#9383) — « capturer l'instantané,
/// appliquer en local, envoyer, restaurer en cas d'échec » (Instant App
/// Principles). Chaque geste change l'écran tout de suite ; la relecture qui
/// suit rend la vérité. Miroir de `apps/web/src/lib/view/game-optimistic.ts`.
///
/// Elles recalculent par la MÊME loi que la passerelle (`MeeshySDK/Game`) :
/// niveau, rang, trésor, prix suivant. Aucun nombre n'est inventé ici, et ce que
/// le serveur seul connaît (la mission tirée, le contenu du coffre, la série
/// rallumée) reste ABSENT jusqu'à sa réponse — jamais deviné.
///
/// Pures : elles rendent une NOUVELLE valeur, ou la MÊME quand le geste est
/// impossible (le témoin d'égalité prouve que rien n'a bougé, donc rien à
/// restaurer ni à repeindre).
enum GameOptimistic {

    private static let rerollPrice = 1

    // MARK: - Solde

    /// Le trésor à `held` : ses réserves se relisent sur la Gloire du bloc (#10848) — jamais perdues par un geste.
    private static func withHeld(_ state: GameState, _ held: Int) -> GameState {
        GameState(game: state.game.replacing(treasury: state.game.treasuryAt(held: held)), meesh: state.meesh)
    }

    /// Le compteur de Meeshes lit le MÊME prix suivant que le héro de frappe (#10898) : posé sur l'aperçu du bloc.
    static func withMintCounters(_ state: GameState, debitable: Int, minted: Int = 0) -> GameState {
        GameState(
            game: state.game,
            meesh: state.meesh.map {
                $0.replacing(
                    mintedLifetime: $0.mintedLifetime + minted,
                    debitablePoints: debitable,
                    missingPoints: state.game.mint.missingPoints,
                    mintCost: state.game.mint.price
                )
            }
        )
    }

    /// Un mouvement de solde, appliqué à chacune des deux lectures sur SA valeur.
    private static func shiftBalance(_ state: GameState, by delta: Int) -> GameState {
        let moved = withHeld(state, state.game.treasury.held + delta)
        return GameState(
            game: moved.game,
            meesh: state.meesh.map { $0.replacing(balance: max(0, $0.balance + delta)) }
        )
    }

    /// Le solde SERVI fait foi, posé aux DEUX endroits où l'écran le lit.
    private static func withBalance(_ state: GameState, _ balance: Int) -> GameState {
        let moved = withHeld(state, balance)
        return GameState(
            game: moved.game,
            meesh: state.meesh.map { $0.replacing(balance: max(0, balance)) }
        )
    }

    // MARK: - Frappe

    static func afterMint(_ state: GameState) -> GameState {
        let game = state.game
        guard game.mint.canMint else { return state }
        let price = game.mint.price
        // La poche fait le niveau (#10892) : la frappe retire son prix de la POCHE, et le niveau d'après se lit sur elle.
        let pocket = game.level.sparkFacts.pocket
        let score = max(0, pocket - price)
        let debitable = max(0, (state.meesh?.debitablePoints ?? pocket) - price)
        let glory = game.glory.atGlory(game.glory.glory + game.mint.gloryGained)
        // Les niveaux s'ouvrent selon le rang (#9688) : le plafond se relit sur le rang d'APRÈS la frappe.
        let levelCap = GameGlory.levelCap(forRank: glory.rank)
        // La frappe compte pour les étapes (#9706) : une Meesh de plus, la Gloire d'après.
        let steps = game.levelStepFacts.map {
            GameLevelStepFacts(minted: game.mint.number, missionsDone: $0.missionsDone, flameRecord: $0.flameRecord,
                               glory: glory.glory, rank: glory.rank)
        }
        // La frappe ne débite que la poche : le cycle, le total à vie et la dette restent ceux servis.
        let sparks = game.level.sparkLedger.map {
            GameSparks.Ledger(pocket: score, cycle: $0.cycle, lifetime: $0.lifetime, debt: $0.debt)
        }
        let level = GameLevelWire.level(score: score, levelCap: levelCap, levelRecord: game.level.shown.record,
                                         prestige: game.level.prestige, steps: steps, sparks: sparks,
                                         levelMaxLifetime: game.level.levelMaxLifetime,
                                         pastCycleRecords: game.level.ladder?.pastCycleRecords)
        let preview = GameLevelWire.mint(nextPreview(after: game, pocket: score, debitable: debitable, glory: glory,
                                                     levelCap: levelCap, steps: steps))
        let minted = game.replacing(
            level: level,
            glory: glory,
            mint: preview,
            // Avec les étincelles, le Vent arrière souffle à 7 niveaux ou plus sous le record (#10896) ; sans, la loi d'hier.
            boosts: game.boosts.replacing(
                tailwind: game.level.sparks == nil
                    ? GameBoosts.tailwind(level: level.shown.level, levelRecord: level.shown.record)
                    : GameBoosts.sparksTailwind(level: level.shown.level, levelRecord: level.shown.record)
            )
        )
        // Le compteur de Meeshes lit le MÊME prix suivant que le héro de frappe (#10898).
        return withMintCounters(shiftBalance(GameState(game: minted, meesh: state.meesh), by: 1), debitable: debitable, minted: 1)
    }

    /// L'aperçu de la frappe SUIVANTE, par la loi que la passerelle servira (#10898) : devant un serveur des étincelles,
    /// `previewSparksMint` — prix de rang × facteur du niveau d'APRÈS, dette et réserve comprises ; devant un serveur
    /// antérieur, la loi d'avant. Rejouer la seconde devant le premier annonçait 1 221 pendant le vol, puis la relecture
    /// remettait le vrai prix, à quelques étincelles de l'ancien.
    private static func nextPreview(after game: GameBlock, pocket: Int, debitable: Int, glory: GameBlock.Glory,
                                    levelCap: Int?, steps: GameLevelStepFacts?) -> GameMintPreview {
        guard game.level.sparks != nil else {
            return GameMint.preview(score: pocket, mintedLifetime: game.mint.number, debitablePoints: debitable,
                                    levelCap: levelCap, steps: steps)
        }
        return GameMint.sparksPreview(
            sparks: pocket, mintedLifetime: game.mint.number, held: game.treasury.held + 1, glory: glory.glory,
            mythic: glory.rank == .mythe, levelCap: levelCap, steps: steps, debt: game.level.sparksDebt ?? 0
        )
    }

    // MARK: - Gel

    static func afterFreeze(_ state: GameState) -> GameState {
        let flame = state.game.flame
        guard flame.freezes < flame.maxFreezes, state.game.treasury.held >= flame.freezePrice else { return state }
        let bought = GameState(
            game: state.game.replacing(flame: flame.replacing(freezes: flame.freezes + 1)),
            meesh: state.meesh
        )
        return shiftBalance(bought, by: -flame.freezePrice)
    }

    // MARK: - Changement de mission

    static func afterReroll(_ state: GameState) -> GameState {
        guard state.game.missions.rerollAvailable else { return state }
        let spent = GameState(
            game: state.game.replacing(missions: state.game.missions.replacing(rerollAvailable: false)),
            meesh: state.meesh
        )
        return shiftBalance(spent, by: -rerollPrice)
    }

    /// La mission servie prend la place de l'ancienne, au même rang ; le solde servi fait foi.
    static func withRerolled(_ state: GameState, missionId: String, mission: GameBlock.Mission, balance: Int) -> GameState {
        let items = state.game.missions.items.map { $0.id == missionId ? mission : $0 }
        let swapped = GameState(
            game: state.game.replacing(missions: state.game.missions.replacing(items: items)),
            meesh: state.meesh
        )
        return withBalance(swapped, balance)
    }

    // MARK: - Coffre

    static func afterChestOpening(_ state: GameState) -> GameState {
        guard state.game.chest.status == .ready else { return state }
        return GameState(
            game: state.game.replacing(chest: state.game.chest.replacing(status: .claimed, reward: .some(nil))),
            meesh: state.meesh
        )
    }

    /// Le contenu servi s'y pose, et le score en poche après le crédit (`score`, la poche SERVIE, qui fait foi).
    /// Les étincelles du coffre suivent la loi du gain (`GameSparks.afterCredit`, #10902) : la dette se rembourse d'abord,
    /// le cycle et le total à vie montent du gain entier. Le niveau, le Vent arrière et le prix suivant se relisent sur la
    /// poche d'après. La Gloire du coffre et le gel offert restent ceux du bloc jusqu'à la relecture : rejouée, une
    /// réclamation déjà servie les compterait deux fois.
    /// `starFragments` : le total collecté tel que la passerelle le sert après l'ouverture (#10011) — `nil`, il reste
    /// celui du bloc.
    static func withChestReward(_ state: GameState, reward: DailyChest, score: Int,
                                starFragments: StarFragmentsTotal? = nil) -> GameState {
        let game = state.game
        let sparks = game.level.sparkLedger.map { served -> GameSparks.Ledger in
            let credited = GameSparks.afterCredit(served, points: reward.points)
            let facts = GameSparks.facts(pocket: score, cycle: credited.cycle, lifetime: credited.lifetime)
            return GameSparks.Ledger(pocket: facts.pocket, cycle: facts.cycle, lifetime: facts.lifetime, debt: credited.debt)
        }
        let levelCap = GameGlory.levelCap(forRank: game.glory.rank)
        let steps = game.levelStepFacts
        let level = GameLevelWire.level(score: sparks?.pocket ?? score, levelCap: levelCap,
                                         levelRecord: game.level.shown.record, prestige: game.level.prestige, steps: steps,
                                         sparks: sparks, levelMaxLifetime: game.level.levelMaxLifetime,
                                         pastCycleRecords: game.level.ladder?.pastCycleRecords)
        // Le coffre fait MONTER le niveau : l'écart au record se relit exactement, par la loi du bloc (#10896).
        let tailwind = sparks == nil
            ? GameBoosts.tailwind(level: level.shown.level, levelRecord: level.shown.record)
            : GameBoosts.sparksTailwind(level: level.shown.level, levelRecord: level.shown.record)
        let claimed = game.replacing(
            level: level,
            mint: sparks.map {
                GameLevelWire.mint(GameMint.sparksPreview(
                    sparks: $0.pocket, mintedLifetime: max(0, game.mint.number - 1), held: game.treasury.held,
                    glory: game.glory.glory, mythic: game.glory.rank == .mythe, levelCap: levelCap, steps: steps, debt: $0.debt
                ))
            },
            chest: game.chest.replacing(status: .claimed, reward: .some(reward)),
            boosts: game.boosts.replacing(tailwind: tailwind),
            starFragments: starFragments.map { .some($0) }
        )
        let next = GameState(game: claimed, meesh: state.meesh)
        return sparks.map { withMintCounters(next, debitable: $0.pocket) } ?? next
    }

    // MARK: - Rallumage

    static func afterRelight(_ state: GameState) -> GameState {
        let flame = state.game.flame
        guard flame.canRelight else { return state }
        let lit = GameState(
            game: state.game.replacing(flame: flame.replacing(status: .lit, canRelight: false)),
            meesh: state.meesh
        )
        return shiftBalance(lit, by: -flame.relightPrice)
    }

    /// La série servie fixe les jours, la forme et le bonus ; le solde servi fait foi.
    static func withRelit(_ state: GameState, streak: Int, balance: Int) -> GameState {
        let flame = state.game.flame.replacing(
            days: streak,
            form: .some(GameFlame.form(forDays: streak)),
            bonusPercent: GameFlame.bonusPercent(forDays: streak),
            status: .lit,
            canRelight: false
        )
        return withBalance(GameState(game: state.game.replacing(flame: flame), meesh: state.meesh), balance)
    }

    // MARK: - Guide

    /// Les clés vues entrent aussitôt dans l'état : la prochaine ouverture dira la version COURTE.
    static func withGuideSeen(_ state: GameState, keys: [String]) -> GameState {
        let merged = state.game.guideSeen + keys.filter { !state.game.guideSeen.contains($0) }
        guard merged != state.game.guideSeen else { return state }
        return GameState(game: state.game.replacing(guideSeen: merged), meesh: state.meesh)
    }
}

/// L'ORDRE DES LECTURES SERVIES (#10898) — la machine d'état du jeu reste MONOTONE : une lecture qui a quitté le client
/// AVANT une autre, ou avant le dernier geste, a lu un état plus ancien que celui que l'écran montre déjà ; elle ne le
/// repeint jamais. La relecture que le geste lance lui-même, partie après lui, rend la vérité.
///
/// Le web tient la même loi par son cache de requêtes : la frappe annule les lectures en vol, sa relecture remplace
/// toute lecture partie avant elle, et `afterMintUnlessServed` ne débite jamais deux fois une frappe déjà servie.
struct GameReadOrder: Equatable, Sendable {
    struct Ticket: Equatable, Sendable {
        fileprivate let number: Int
        fileprivate let era: Int
    }

    private var issued = 0
    private var era = 0
    private var latestPosed = 0

    /// Le ticket d'une lecture, pris à son DÉPART.
    mutating func issue() -> Ticket {
        issued += 1
        return Ticket(number: issued, era: era)
    }

    /// Un geste commence : toute lecture partie avant lui a lu l'état d'avant.
    mutating func beginGesture() {
        era += 1
    }

    /// Vrai si la lecture peut se poser — et la retient alors comme la plus récente posée. Une même lecture peut se
    /// poser deux fois (le cache, puis le réseau, sous le même ticket).
    mutating func admits(_ ticket: Ticket) -> Bool {
        guard ticket.era == era, ticket.number >= latestPosed else { return false }
        latestPosed = ticket.number
        return true
    }

    /// Ce que la passerelle a CONFIRMÉ — par une frappe ou une lecture posée : la plus haute révision de l'état du jeu
    /// (#10900) et le plus grand nombre de Meeshes frappées. Ni l'un ni l'autre ne redescend.
    struct Confirmed: Equatable, Sendable {
        var revision: Int?
        var minted = 0

        func raised(revision served: Int?, minted servedMinted: Int?) -> Confirmed {
            Confirmed(
                revision: [revision, served].compactMap { $0 }.max(),
                minted: max(minted, servedMinted ?? 0)
            )
        }
    }

    /// Une charge servie est à jour si elle n'est pas EN RETARD sur ce qui a été confirmé : sa révision, quand la
    /// passerelle la sert (`shouldApplyGameState`, `packages/shared/types/game-sync.ts`) ; sinon ses Meeshes frappées. Un
    /// serveur qui ne sert ni l'une ni les autres n'est jamais déclaré en retard.
    static func isCurrent(servedRevision: Int?, servedMinted: Int?, confirmed: Confirmed) -> Bool {
        if let servedRevision, let known = confirmed.revision, servedRevision < known { return false }
        guard let servedMinted else { return true }
        return servedMinted >= confirmed.minted
    }
}
