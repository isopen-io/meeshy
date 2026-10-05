import Foundation
import Combine
import MeeshySDK

/// Le jour civil de l'APPAREIL (`AAAA-MM-JJ`, fuseau du joueur). La première
/// lecture de l'écran peut venir du cache (cache-first) : son `dayKey` est alors
/// celui de la dernière visite, jamais celui d'aujourd'hui.
enum GameClock {
    static func dayKey(_ date: Date = Date(), calendar: Calendar = .current) -> String {
        let parts = calendar.dateComponents([.year, .month, .day], from: date)
        return String(format: "%04d-%02d-%02d", parts.year ?? 1970, parts.month ?? 1, parts.day ?? 1)
    }
}

/// Le dernier passage sur Progression — il ne sert qu'à dire « content de te
/// revoir » après sept jours, jamais à quoi que ce soit d'autre.
protocol GameVisitStoring: AnyObject {
    func lastVisitDay() -> String?
    func rememberVisit(day: String)
}

final class UserDefaultsGameVisitStore: GameVisitStoring {
    nonisolated deinit {}
    private let defaults: UserDefaults
    private let key: String

    init(userId: String, defaults: UserDefaults = .standard) {
        self.defaults = defaults
        self.key = "meeshy.game.last-visit.\(userId)"
    }

    func lastVisitDay() -> String? {
        guard let stored = defaults.string(forKey: key), GameDay.isDayKey(stored) else { return nil }
        return stored
    }

    func rememberVisit(day: String) {
        defaults.set(day, forKey: key)
    }
}

/// LE GUIDE D'UNE OUVERTURE D'ÉCRAN (#9379) — quelle carte Mee et Meo montrent,
/// et quand elles la considèrent comme vue. Miroir de
/// `apps/web/src/routes/progression-guide.ts`.
///
///  1. À l'OUVERTURE (première lecture portant le bloc `game`) : l'intégration
///     d'abord — la première étape que le serveur n'a pas vue —, sinon UN moment
///     (`GameGuide.chooseMoment` : le plus important, un inédit passant devant
///     un déjà vu). Une seule carte, jamais plusieurs.
///  2. PENDANT que l'écran est ouvert : une transition (un palier franchi, une
///     frappe) remplace la carte, sauf pendant l'intégration, qu'elle ne coupe pas.
///  3. Une carte est VUE dès qu'elle s'affiche : sa clé part à
///     `POST /me/game/guide/seen` et entre aussitôt dans l'état, pour que la
///     prochaine ouverture la dise en version COURTE. Un envoi refusé ne retire
///     pas la carte : c'est le prix d'un hors-ligne, la carte se redira.
///  4. Chaque étape peut se passer ; passer une étape montre la suivante, passer
///     l'intégration marque les restantes en UN envoi.
///
/// `settled` est faux tant qu'un geste du jeu est EN VOL : la lecture montrée est
/// alors l'optimiste, et une transition ne se célèbre qu'une fois le geste réglé
/// — un geste refusé (restauré) ne laisse ni carte ni clé vue.
///
/// Jamais dans une conversation : seul l'écran Progression monte ce guide.
@MainActor
final class GameGuideSession: ObservableObject {
    // iOS 26.1 : la deinit synthétisée serait ISOLÉE (SE-0466) et double-libère au démontage.
    nonisolated deinit {}

    @Published private(set) var card: GuideCard?

    private let service: GameServiceProviding
    private let visits: GameVisitStoring
    private let today: () -> String
    private let onSeen: ([String]) -> Void
    private var seen = Set<String>()
    private var opened = false
    private var previous: GameBlock?
    private var previousImpact: MintBadgeImpact?

    init(
        service: GameServiceProviding = GameService.shared,
        visits: GameVisitStoring,
        today: @escaping () -> String = { GameClock.dayKey() },
        onSeen: @escaping ([String]) -> Void = { _ in }
    ) {
        self.service = service
        self.visits = visits
        self.today = today
        self.onSeen = onSeen
    }

    /// Appelée à chaque lecture du bloc `game` (réseau, cache, geste réglé).
    func observe(game: GameBlock, settled: Bool, badgeImpact: MintBadgeImpact? = nil) {
        guard settled else { return }
        seen.formUnion(game.guideSeen)
        let before = previous
        let impactBefore = previousImpact
        previous = game
        previousImpact = badgeImpact

        guard opened else {
            opened = true
            let day = today()
            let last = visits.lastVisitDay()
            visits.rememberVisit(day: day)
            show(openingCard(game: game, daysAway: last.flatMap { GameDay.diff(from: $0, to: day) }))
            return
        }
        guard let before else { return }
        let events = GameGuideEvents.transitions(from: before, to: game, badgeImpactBefore: impactBefore)
        guard !events.isEmpty, let moment = GameGuide.chooseMoment(events: events, seen: seen) else { return }
        if card?.step != nil { return }
        show(GameGuideCard.ofMoment(moment))
    }

    /// « Plus tard » / « Passer » : écarte la carte (pendant l'intégration, montre l'étape suivante).
    func dismiss() {
        guard card?.step != nil else {
            card = nil
            return
        }
        show(GameGuide.nextOnboardingStep(seen: seen).map(GameGuideCard.ofStep))
    }

    /// « Passer l'intégration » : les étapes restantes partent vues en UN envoi.
    func skipAll() {
        let remaining = GameGuide.onboardingSteps
            .map { GameGuide.onboardingSeenKey($0.key) }
            .filter { !seen.contains($0) }
        markSeen(remaining)
        card = nil
    }

    // MARK: - Détail

    private func openingCard(game: GameBlock, daysAway: Int?) -> GuideCard? {
        if let step = GameGuide.nextOnboardingStep(seen: seen) {
            return GameGuideCard.ofStep(step)
        }
        let events = GameGuideEvents.standing(game: game, seen: seen, daysAway: daysAway)
        return GameGuide.chooseMoment(events: events, seen: seen).map(GameGuideCard.ofMoment)
    }

    private func show(_ next: GuideCard?) {
        card = next
        if let next, !seen.contains(next.key) {
            markSeen([next.key])
        }
    }

    private func markSeen(_ keys: [String]) {
        guard !keys.isEmpty else { return }
        seen.formUnion(keys)
        onSeen(keys)
        let service = self.service
        let requestId = UUID().uuidString
        Task { _ = try? await service.markGuideSeen(keys: keys, requestId: requestId) }
    }
}
