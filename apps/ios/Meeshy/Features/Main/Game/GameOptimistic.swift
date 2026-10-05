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

    private static func withHeld(_ state: GameState, _ held: Int) -> GameState {
        GameState(
            game: state.game.replacing(treasury: GameTreasury.standing(held: max(0, held))),
            meesh: state.meesh
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
        let score = max(0, game.level.score - price)
        let debitable = max(0, (state.meesh?.debitablePoints ?? game.level.score) - price)
        let level = game.level.atScore(score).replacing(canPrestige: false)
        let preview = GameMint.preview(score: score, mintedLifetime: game.mint.number, debitablePoints: debitable)
        let minted = game.replacing(
            level: level,
            glory: game.glory.atGlory(game.glory.glory + game.mint.gloryGained),
            mint: preview,
            boosts: game.boosts.replacing(
                tailwind: GameBoosts.tailwind(level: level.level, levelRecord: game.level.record)
            )
        )
        let shifted = shiftBalance(
            GameState(
                game: minted,
                meesh: state.meesh.map {
                    $0.replacing(
                        mintedLifetime: $0.mintedLifetime + 1,
                        debitablePoints: debitable,
                        missingPoints: preview.missingPoints,
                        mintCost: preview.price
                    )
                }
            ),
            by: 1
        )
        return shifted
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

    /// Le contenu servi s'y pose, et le score en poche après le crédit.
    static func withChestReward(_ state: GameState, reward: DailyChest, score: Int) -> GameState {
        let game = state.game
        let level = game.level.atScore(score).replacing(record: max(game.level.record, GameLevels.level(forScore: score)))
        return GameState(
            game: game.replacing(
                level: level,
                chest: game.chest.replacing(status: .claimed, reward: .some(reward))
            ),
            meesh: state.meesh
        )
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
