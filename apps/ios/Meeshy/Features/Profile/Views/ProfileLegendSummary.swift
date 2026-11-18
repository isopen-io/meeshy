import Foundation
import Combine
import UIKit
import MeeshySDK

/// Ce que « Ma Légende » dit sur ma fiche (#19630, planches `Main` et `Moi-Actions`) : « Niveau 24 · rang Voix III »,
/// la part parcourue vers le niveau suivant et ce qu'il manque pour l'atteindre. Le résumé ne calcule rien : il LIT la
/// bannière du joueur (`GamePlayerBanner`), donc il montre ce que le bandeau du haut montre. Sans rien à dire, il est
/// absent et la rangée garde sa phrase d'avant.
struct ProfileLegendSummary: Equatable {
    let subtitle: String
    /// La part parcourue vers le niveau suivant, de 0 à 1 ; `nil` tant que le niveau n'a rien à dire (niveau 1).
    let progress: Double?
    let progressLine: String?

    static func of(_ banner: GamePlayerBanner?) -> ProfileLegendSummary? {
        guard let banner else { return nil }
        let level = banner.showsLevel ? GameCopy.formatCount(banner.level) : nil
        let rank = banner.rank.map { GameCopy.rankLabel($0.rank, division5: $0.division, mythic: $0.mythic) }
        guard let subtitle = ProfileLegendCopy.subtitle(level: level, rank: rank) else { return nil }
        guard banner.showsLevel else { return ProfileLegendSummary(subtitle: subtitle, progress: nil, progressLine: nil) }
        guard let next = banner.nextLevel, let remaining = banner.pointsToNext else {
            return ProfileLegendSummary(subtitle: subtitle, progress: 1, progressLine: GameCopy.levelTop(cap: banner.levelCap))
        }
        return ProfileLegendSummary(subtitle: subtitle, progress: banner.progress,
                                    progressLine: GameCopy.levelToNext(remaining: remaining, nextLevel: next))
    }

    /// Le sous-titre de la rangée : le niveau et le rang, ou la phrase d'avant sans donnée de jeu.
    static func subtitle(for summary: ProfileLegendSummary?) -> String {
        summary?.subtitle ?? ProfileLegendCopy.fallbackSubtitle
    }

    /// Ce que VoiceOver lit de la rangée après son titre : le sous-titre, puis ce qu'il manque.
    static func spokenValue(for summary: ProfileLegendSummary?) -> String {
        let shown = Self.subtitle(for: summary)
        guard let line = summary?.progressLine else { return shown }
        return shown + ", " + line
    }
}

/// D'où « Ma Légende » lit le jeu : le CACHE du bloc `game`, sous la clé que le bandeau du joueur et Progression
/// tiennent à jour. Aucune requête ne part pour elle ; elle relit le cache quand quelqu'un vient de l'écrire
/// (`engagementSnapshotPersisted`) et au retour de l'app au premier plan. « Jeu masqué » : rien n'est lu ni montré.
@MainActor
final class ProfileLegendStore: ObservableObject {
    nonisolated deinit {}

    @Published private(set) var summary: ProfileLegendSummary?

    private let source: PlayerBannerSourcing
    private var subscriptions = Set<AnyCancellable>()
    private var subscribed = false
    private var hidden = false
    private var pendingRead: Task<Void, Never>?

    init(source: PlayerBannerSourcing = EngagementPlayerBannerSource()) {
        self.source = source
    }

    func activate(hidden: Bool) async {
        self.hidden = hidden
        guard !hidden else {
            pendingRead?.cancel()
            summary = nil
            return
        }
        subscribeOnce()
        await readCache()
    }

    /// Le dernier bloc connu, MÊME périmé ; un cache vide ne retire rien de ce qui est montré.
    func readCache() async {
        guard !hidden, let game = await source.cached(), !hidden else { return }
        let next = ProfileLegendSummary.of(GamePlayerBanner.make(game: game))
        if next != summary { summary = next }
    }

    private func scheduleRead() {
        pendingRead?.cancel()
        pendingRead = Task { [weak self] in await self?.readCache() }
    }

    private func subscribeOnce() {
        guard !subscribed else { return }
        subscribed = true
        NotificationCenter.default.publisher(for: .engagementSnapshotPersisted)
            .merge(with: NotificationCenter.default.publisher(for: UIApplication.didBecomeActiveNotification))
            .receive(on: DispatchQueue.main)
            .sink { [weak self] _ in self?.scheduleRead() }
            .store(in: &subscriptions)
    }
}
