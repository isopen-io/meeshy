import Foundation
import MeeshySDK

/// Les gestes du jeu EN VOL, un par intention (#9383).
struct GamePending: Equatable {
    /// La mission dont la remplaçante est attendue.
    var rerollMissionId: String?
    var chest = false
    var freeze = false
    var relight = false
}

/// Le refus du DERNIER geste, en une phrase — jamais un code (#9383).
struct GameErrors: Equatable {
    var reroll: String?
    var chest: String?
    var freeze: String?
    var relight: String?
}

/// La pièce qui vient d'être frappée : c'est ce qui rejoue la scène de la frappe.
struct MintCelebration: Equatable {
    let number: Int
    let edition: MeeshEdition
    /// Incrémenté à chaque frappe confirmée : c'est ce qui rejoue la scène.
    let key: Int
}

/// LES GESTES DU JEU (#9383) — changement de mission, coffre, gel, rallumage (la
/// frappe est `ProgressionViewModel.mint`). Chacun suit la même règle (Instant
/// App Principles) :
///
///   capturer l'instantané → appliquer en local → envoyer → restaurer si échec
///
/// L'identifiant d'idempotence est généré UNE fois par intention et ne se
/// renouvelle qu'après un SUCCÈS : un réessai après échec réseau rejoue la même
/// requête (la passerelle la reconnaît), il ne devient jamais un second geste —
/// c'est la raison d'être de l'identifiant (#5743).
///
/// Ce que le serveur seul connaît (la mission tirée, le contenu du coffre, la
/// série rallumée) n'est jamais deviné : il se pose à la réponse. Un REFUS d'état
/// du serveur (409) dit que l'écran était périmé : il se relit, au lieu de
/// laisser mentir ce qu'on vient de restaurer. Miroir de
/// `apps/web/src/routes/progression-game-actions.ts`.
extension ProgressionViewModel {

    // MARK: - Changer une mission

    func reroll(missionId: String) async {
        guard pending.rerollMissionId == nil else { return }
        pending.rerollMissionId = missionId
        gameErrors.reroll = nil
        let intention = "reroll:\(missionId)"
        let before = beginGesture(GameOptimistic.afterReroll)
        do {
            let response = try await gameService.rerollMission(missionId: missionId, requestId: requestId(for: intention))
            spent(intention)
            if let snapshot, let game = snapshot.game {
                let state = GameOptimistic.withRerolled(
                    GameState(game: game, meesh: snapshot.meesh),
                    missionId: missionId, mission: response.mission, balance: response.balance
                )
                commit(state, over: snapshot)
            }
            await load(forceNetwork: true)
        } catch {
            restore(before)
            releaseRequestIdIfConflict(error, intention: intention)
            gameErrors.reroll = GameCopy.errorMessage(for: error)
            await refreshAfterRefusal(error)
        }
        pending.rerollMissionId = nil
        endGesture()
    }

    // MARK: - Le coffre

    func claimChest() async {
        guard !pending.chest else { return }
        pending.chest = true
        gameErrors.chest = nil
        let before = beginGesture(GameOptimistic.afterChestOpening)
        do {
            let response = try await gameService.claimChest(requestId: requestId(for: "chest"))
            spent("chest")
            if let snapshot, let game = snapshot.game {
                let state = GameOptimistic.withChestReward(
                    GameState(game: game, meesh: snapshot.meesh), reward: response.reward, score: response.score
                )
                commit(state, over: snapshot)
            }
            await load(forceNetwork: true)
        } catch {
            restore(before)
            releaseRequestIdIfConflict(error, intention: "chest")
            gameErrors.chest = GameCopy.errorMessage(for: error)
            await refreshAfterRefusal(error)
        }
        pending.chest = false
        endGesture()
    }

    // MARK: - Un gel

    func buyFreeze() async {
        guard !pending.freeze else { return }
        pending.freeze = true
        gameErrors.freeze = nil
        let before = beginGesture(GameOptimistic.afterFreeze)
        do {
            _ = try await gameService.buyFlameFreeze(requestId: requestId(for: "freeze"))
            spent("freeze")
            await load(forceNetwork: true)
        } catch {
            restore(before)
            releaseRequestIdIfConflict(error, intention: "freeze")
            gameErrors.freeze = GameCopy.errorMessage(for: error)
            await refreshAfterRefusal(error)
        }
        pending.freeze = false
        endGesture()
    }

    // MARK: - Rallumer la Flamme

    func relight() async {
        guard !pending.relight else { return }
        pending.relight = true
        gameErrors.relight = nil
        let before = beginGesture(GameOptimistic.afterRelight)
        do {
            let response = try await gameService.relightFlame(requestId: requestId(for: "relight"))
            spent("relight")
            if let snapshot, let game = snapshot.game {
                let state = GameOptimistic.withRelit(
                    GameState(game: game, meesh: snapshot.meesh), streak: response.streak, balance: response.balance
                )
                commit(state, over: snapshot)
            }
            await load(forceNetwork: true)
        } catch {
            restore(before)
            releaseRequestIdIfConflict(error, intention: "relight")
            gameErrors.relight = GameCopy.errorMessage(for: error)
            await refreshAfterRefusal(error)
        }
        pending.relight = false
        endGesture()
    }

    /// « Identifiant déjà servi à une AUTRE écriture » : le rejouer ne ferait que se heurter au même
    /// refus. L'intention en reçoit un neuf au prochain geste — c'est le seul refus qui le demande.
    func releaseRequestIdIfConflict(_ error: Error, intention: String) {
        guard GameService.refusal(of: error) == .requestIdConflict else { return }
        spent(intention)
    }

    private func refreshAfterRefusal(_ error: Error) async {
        guard GameService.refusal(of: error) != nil else { return }
        await load(forceNetwork: true)
    }
}
