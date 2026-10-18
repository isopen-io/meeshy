import Foundation
import MeeshySDK

// MARK: - Les copies des blocs de la vague 2
//
// Les blocs sont des valeurs IMMUABLES (`let`) : une mise à jour optimiste en reconstruit une
// copie. Ces extensions nomment ce qui change et recopient le reste — un champ ajouté au bloc
// fait ROUGIR la compilation ici (l'initialiseur est exhaustif) au lieu d'être perdu en silence.

extension GameWave2 {
    func replacing(
        league: GameLeagueBlock?? = nil,
        duo: GameDuoBlock?? = nil,
        season: GameSeasonBlock?? = nil,
        trophies: GameTrophiesBlock?? = nil,
        prestige: GamePrestigeBlock?? = nil,
        visibility: GameVisibility?? = nil
    ) -> GameWave2 {
        GameWave2(
            league: league ?? self.league,
            duo: duo ?? self.duo,
            season: season ?? self.season,
            trophies: trophies ?? self.trophies,
            atlas: atlas,
            prestige: prestige ?? self.prestige,
            visibility: visibility ?? self.visibility,
            achievementRarities: achievementRarities
        )
    }
}

extension GameLeagueBlock {
    func replacing(
        unlocked: Bool? = nil,
        access: LeagueAccess? = nil,
        pseudonym: String?? = nil,
        current: GameLeagueBlock.Current?? = nil
    ) -> GameLeagueBlock {
        GameLeagueBlock(
            unlocked: unlocked ?? self.unlocked,
            access: access ?? self.access,
            pseudonym: pseudonym ?? self.pseudonym,
            weekKey: weekKey,
            closes: closes,
            current: current ?? self.current,
            friends: friends
        )
    }
}

extension GameDuoBlock {
    func replacing(
        unlocked: Bool? = nil,
        status: DuoBlockStatus? = nil,
        duoId: String?? = nil,
        role: DuoActor?? = nil,
        partner: GameDuoBlock.Partner?? = nil,
        mission: GameDuoBlock.Mission?? = nil,
        progress: GameDuoBlock.Progress?? = nil,
        reward: GameDuoBlock.Reward?? = nil
    ) -> GameDuoBlock {
        GameDuoBlock(
            unlocked: unlocked ?? self.unlocked,
            status: status ?? self.status,
            duoId: duoId ?? self.duoId,
            weekKey: weekKey,
            role: role ?? self.role,
            partner: partner ?? self.partner,
            mission: mission ?? self.mission,
            progress: progress ?? self.progress,
            reward: reward ?? self.reward
        )
    }
}

extension GameSeasonBlock {
    func replacing(
        claimedSteps: [Int]? = nil,
        nextReward: GameSeasonBlock.NextReward?? = nil,
        sealOwned: Bool? = nil
    ) -> GameSeasonBlock {
        GameSeasonBlock(
            number: number, themeKey: themeKey, startDay: startDay, endDay: endDay, week: week, stars: stars,
            steps: steps, stepsTotal: stepsTotal, starsToNext: starsToNext, progress: progress, completed: completed,
            claimedSteps: claimedSteps ?? self.claimedSteps,
            nextReward: nextReward ?? self.nextReward,
            sealOwned: sealOwned ?? self.sealOwned,
            sealPrice: sealPrice,
            stepPoints: stepPoints
        )
    }

    /// La récompense gratuite d'une étape de CETTE saison : ses points à elle (calendrier servi, #10232), sinon la loi.
    func stepReward(_ step: Int) -> SeasonReward? {
        GameSeason.stepReward(step, stepPoints: servedStepPoints)
    }
}

extension GamePrestigeBlock {
    func replacing(stars: Int? = nil, canPrestige: Bool? = nil) -> GamePrestigeBlock {
        GamePrestigeBlock(stars: stars ?? self.stars, max: max, canPrestige: canPrestige ?? self.canPrestige,
                          gloryOnPass: gloryOnPass)
    }
}

/// LES MISES À JOUR OPTIMISTES DE LA VAGUE 2 (#9481, #9384 à #9389) — la même discipline que
/// `GameOptimistic` : capturer, appliquer en local, envoyer, restaurer en cas d'échec. Miroir de
/// `apps/web/src/lib/view/game-optimistic-v2.ts`.
///
/// Pures : elles rendent une NOUVELLE valeur, ou la MÊME quand le geste n'a pas de sens (le témoin
/// d'égalité prouve que rien n'a bougé, donc rien à restaurer). Ce que le serveur seul connaît
/// n'est jamais deviné : le pseudonyme tiré au sort, l'identifiant du duo, la mission du duo, le
/// score après une étape. Il se pose à la RÉPONSE (`withConsentResult`, `withDuoId`) ou à la
/// relecture qui suit.
enum GameWave2Optimistic {

    private static func on(_ state: GameState, _ wave2: GameWave2) -> GameState {
        GameState(game: state.game.replacing(wave2: wave2), meesh: state.meesh)
    }

    // MARK: - La ligue

    /// Consentir ouvre la ligue (le pseudonyme tiré par le serveur reste `nil` jusqu'à sa réponse) ;
    /// retirer son consentement la ferme et efface le groupe et le pseudonyme — la passerelle
    /// supprime ces données (conformité A-9). Une ligue verrouillée ou fermée aux mineurs ne
    /// s'ouvre pas en local.
    static func afterConsent(_ state: GameState, consent: Bool, pseudonym: String?) -> GameState {
        guard let league = state.game.league else { return state }
        if consent {
            guard league.access == .consentRequired else { return state }
            return on(state, state.game.wave2.replacing(league: .some(league.replacing(access: .open, pseudonym: .some(pseudonym)))))
        }
        guard league.access == .open else { return state }
        let closed = league.replacing(access: .consentRequired, pseudonym: .some(nil), current: .some(nil))
        return on(state, state.game.wave2.replacing(league: .some(closed)))
    }

    static func withConsentResult(_ state: GameState, consent: Bool, pseudonym: String?) -> GameState {
        guard consent, let league = state.game.league else { return state }
        return on(state, state.game.wave2.replacing(league: .some(league.replacing(pseudonym: .some(pseudonym)))))
    }

    static func withPseudonym(_ state: GameState, pseudonym: String) -> GameState {
        guard let league = state.game.league, league.access == .open else { return state }
        return on(state, state.game.wave2.replacing(league: .some(league.replacing(pseudonym: .some(pseudonym)))))
    }

    // MARK: - Le duo

    static func afterInvite(_ state: GameState, friendId: String, friendName: String) -> GameState {
        guard let duo = state.game.duo, duo.unlocked, duo.status == .none else { return state }
        let invited = duo.replacing(
            status: .invited, duoId: .some(nil), role: .some(.inviter),
            partner: .some(GameDuoBlock.Partner(userId: friendId, displayName: friendName)),
            mission: .some(nil), progress: .some(nil), reward: .some(nil)
        )
        return on(state, state.game.wave2.replacing(duo: .some(invited)))
    }

    static func withDuoId(_ state: GameState, duoId: String) -> GameState {
        guard let duo = state.game.duo else { return state }
        return on(state, state.game.wave2.replacing(duo: .some(duo.replacing(duoId: .some(duoId)))))
    }

    static func afterAccept(_ state: GameState) -> GameState {
        guard let duo = state.game.duo, duo.status == .invited, duo.role == .invitee else { return state }
        return on(state, state.game.wave2.replacing(duo: .some(duo.replacing(status: .active))))
    }

    static func afterAbandon(_ state: GameState) -> GameState {
        guard let duo = state.game.duo, duo.status == .invited || duo.status == .active else { return state }
        return on(state, state.game.wave2.replacing(duo: .some(duo.replacing(status: .abandoned))))
    }

    // MARK: - La saison

    /// Réclamer une étape atteinte et pas encore réclamée ; la prochaine récompense avance.
    static func afterSeasonClaim(_ state: GameState, step: Int) -> GameState {
        guard let season = state.game.season, step >= 1, step <= season.steps,
              !season.claimedSteps.contains(step) else { return state }
        let claimed = (season.claimedSteps + [step]).sorted()
        let nextStep = (1...max(1, season.steps)).first { !claimed.contains($0) && $0 <= season.steps }
        let next: GameSeasonBlock.NextReward? = nextStep.flatMap { step in
            season.stepReward(step).map {
                GameSeasonBlock.NextReward(step: step, reward: .init(kind: $0.kind, amount: $0.amount))
            }
        }
        return on(state, state.game.wave2.replacing(season: .some(season.replacing(claimedSteps: claimed, nextReward: .some(next)))))
    }

    /// Le Sceau se paie en Meeshes : le solde baisse aux DEUX endroits où l'écran le lit.
    static func afterSealBought(_ state: GameState) -> GameState {
        guard let season = state.game.season, GameSeason.sealRefusal(balance: state.game.treasury.held, owned: season.sealOwned) == nil
        else { return state }
        let owned = on(state, state.game.wave2.replacing(season: .some(season.replacing(sealOwned: true))))
        let held = max(0, state.game.treasury.held - season.sealPrice)
        return GameState(
            game: owned.game.replacing(treasury: owned.game.treasuryAt(held: held)),
            meesh: state.meesh.map { $0.replacing(balance: max(0, $0.balance - season.sealPrice)) }
        )
    }

    // MARK: - La vitrine, la visibilité

    static func withShowcaseOrder(_ state: GameState, order: [String]) -> GameState {
        guard let trophies = state.game.trophies, trophies.order != order else { return state }
        return on(state, state.game.wave2.replacing(trophies: .some(GameTrophiesBlock(items: trophies.items, order: order))))
    }

    /// Le serveur reste maître : il plafonne (« caché de la recherche » ne dépasse pas « amis ») et répond
    /// avec la valeur EFFECTIVE, que la relecture pose.
    static func withVisibility(_ state: GameState, showcase: ShowcaseVisibility? = nil, rank: ShowcaseVisibility? = nil,
                               treasury: ShowcaseVisibility? = nil, atlas: ShowcaseVisibility? = nil) -> GameState {
        guard let visibility = state.game.visibility else { return state }
        let next = GameVisibility(
            showcase: showcase ?? visibility.showcase, rank: rank ?? visibility.rank,
            treasury: treasury ?? visibility.treasury, atlas: atlas ?? visibility.atlas
        )
        guard next != visibility else { return state }
        return on(state, state.game.wave2.replacing(visibility: .some(next)))
    }

    // MARK: - Le Prestige

    /// Le passage en Prestige, par la MÊME loi que la passerelle (`GamePrestige.transition`, `PrestigeService.pass`) : le
    /// niveau et la poche repartent à 1 et à 0, l'étoile se pose, la Gloire monte, le trophée numéroté entre dans la vitrine.
    ///
    /// Devant une passerelle des étincelles (#10846), le cycle repart à 0, le total à vie et la dette restent
    /// (`GameSparks.afterPrestige`), et le niveau MAX À VIE survit : la ligue (10) et le duo (20), qui le lisent, RESTENT
    /// ouverts — gardés tels que servis. Le record du cycle retombe à 1, le Vent arrière ne souffle pas, le prix suivant est
    /// celui de la pièce suivante au facteur du niveau 1, les réserves du trésor se relisent sur la Gloire d'après. Devant
    /// un serveur antérieur, la loi d'hier : le record retombé referme la ligue et le duo (conformité G-5).
    ///
    /// Refusé (même valeur) sans proposition ouverte, ou au maximum.
    static func afterPrestige(_ state: GameState, now: Date = Date()) -> GameState {
        let game = state.game
        let served = game.level.sparkLedger
        // Les étapes faites ne se défont pas : le plus haut des deux records les prouve, comme la passerelle les lit.
        let proof = max(game.level.shown.record, game.level.levelMaxLifetime ?? 0)
        guard let prestige = game.prestige, prestige.canPrestige,
              case .allowed(let passage) = GamePrestige.transition(score: served?.pocket ?? game.level.score,
                                                                   prestige: game.level.prestige, levelRecord: proof)
        else { return state }

        let sparks = served.map(GameSparks.afterPrestige)
        let glory = game.glory.atGlory(game.glory.glory + passage.gloryGained)
        // Le plafond se relit sur le rang d'APRÈS le passage : la Gloire du Prestige peut l'ouvrir (#9688).
        let levelCap = GameGlory.levelCap(forRank: glory.rank)
        let steps = game.levelStepFacts.map {
            GameLevelStepFacts(counts: $0.counts, glory: glory.glory, rank: glory.rank)
        }
        let level = GameLevelWire.level(score: passage.scoreAfter, levelCap: levelCap,
                                         levelRecord: passage.levelRecordAfter, prestige: passage.prestigeAfter, steps: steps,
                                         sparks: sparks, levelMaxLifetime: sparks.map { _ in max(proof, game.level.shown.level) },
                                         // Le cycle que le passage clôt rejoint la liste, comme l'écrit la passerelle (#10911).
                                         pastCycleRecords: GamePrestige.pastCycleRecordsAfterPrestige(
                                            game.level.ladder?.pastCycleRecords,
                                            levelRecord: game.level.shown.record, level: game.level.shown.level))
        let mintedLifetime = max(0, game.mint.number - 1)
        let preview = sparks.map {
            GameMint.sparksPreview(sparks: $0.pocket, mintedLifetime: mintedLifetime, held: game.treasury.held,
                                   glory: glory.glory, mythic: glory.rank == .mythe, levelCap: levelCap, steps: steps,
                                   debt: $0.debt)
        } ?? GameMint.preview(score: passage.scoreAfter, mintedLifetime: mintedLifetime, debitablePoints: 0,
                              levelCap: levelCap, steps: steps)
        let trophies = game.trophies.map { block -> GameTrophiesBlock in
            let stamp = ISO8601DateFormatter().string(from: now)
            return GameTrophiesBlock(
                items: block.items + [GameTrophyItem(key: passage.trophyKey, awardedAt: stamp)],
                order: [passage.trophyKey] + block.order
            )
        }
        let closesAccess = sparks == nil
        let wave2 = game.wave2.replacing(
            league: closesAccess ? .some(game.league?.replacing(unlocked: false, access: .locked, current: .some(nil))) : nil,
            duo: closesAccess ? .some(game.duo?.replacing(unlocked: false)) : nil,
            trophies: .some(trophies),
            prestige: .some(prestige.replacing(stars: passage.prestigeAfter, canPrestige: false))
        )
        let risen = game.replacing(glory: glory)
        let passed = risen.replacing(
            level: level,
            treasury: risen.treasuryAt(held: game.treasury.held),
            mint: GameLevelWire.mint(preview),
            boosts: game.boosts.replacing(tailwind: sparks == nil
                ? GameBoosts.tailwind(level: passage.levelAfter, levelRecord: passage.levelRecordAfter)
                : GameBoosts.sparksTailwind(level: passage.levelAfter, levelRecord: passage.levelRecordAfter)),
            wave2: wave2
        )
        return GameOptimistic.withMintCounters(GameState(game: passed, meesh: state.meesh), debitable: 0)
    }
}
