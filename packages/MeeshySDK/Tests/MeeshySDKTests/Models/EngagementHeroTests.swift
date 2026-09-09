import XCTest
@testable import MeeshySDK

/// **Le tableau de bord met QUELQUE CHOSE en avant — toujours** (#5831).
///
/// La règle est de MODÈLE, pas de vue : « lequel mettre en héros » se répond
/// sans écran, et le jour où la v3.1 web dessine le même tableau de bord elle
/// lira cette loi-ci plutôt que d'en écrire une seconde. Les jumelles
/// divergent — mesuré trois fois sur le Prisme.
final class EngagementHeroTests: XCTestCase {

    private let echelleVide = EngagementScaleProgress(
        value: 0, tiers: [], reachedCount: 0, previousThreshold: 0, nextThreshold: nil, progress: 0
    )

    private func progression(_ succes: [EngagementAchievementProgress]) -> EngagementProgress {
        EngagementProgress(
            level: EngagementLevelProgress(scale: echelleVide),
            streak: EngagementStreakProgress(scale: echelleVide, currentDays: 0, longestDays: 0),
            axes: [],
            achievements: succes,
            badgesEarned: 0,
            badgesTotal: 0,
            isEmpty: false
        )
    }

    private func succes(_ key: EngagementAchievementKey, _ unlocked: Bool, _ reachedAt: String? = nil)
        -> EngagementAchievementProgress {
        EngagementAchievementProgress(key: key, unlocked: unlocked, reachedAt: reachedAt)
    }

    // MARK: - Le DERNIER obtenu gagne

    func test_hero_estLeSuccesObtenuLePlusRecent() {
        let p = progression([
            succes(.firstContent, true, "2026-09-01T10:00:00.000Z"),
            succes(.firstVoice, true, "2026-09-08T18:30:00.000Z"),
            succes(.editor, true, "2026-09-04T08:00:00.000Z"),
            succes(.allContentTypes, false)
        ])
        XCTAssertEqual(p.heroAchievement?.key, .firstVoice,
                       "Le héros doit être la nouvelle la plus FRAÎCHE — celle qu'on vient éventuellement de célébrer.")
    }

    /// Un ordre de tableau ne fait pas un ordre chronologique : sans
    /// comparaison sur `reachedAt`, `first` ou `last` rendraient un succès
    /// arbitraire et le héros mentirait sans jamais rougir.
    func test_hero_ignoreLOrdreDuTableau() {
        let recentDAbord = progression([
            succes(.firstVoice, true, "2026-09-08T18:30:00.000Z"),
            succes(.firstContent, true, "2026-09-01T10:00:00.000Z")
        ])
        XCTAssertEqual(recentDAbord.heroAchievement?.key, .firstVoice)
    }

    // MARK: - Un obtenu SANS date ne prétend pas au titre de « dernier »

    func test_hero_unObtenuSansDatePerdContreUneDate() {
        let p = progression([
            succes(.firstContent, true, nil),
            succes(.editor, true, "2026-09-02T09:00:00.000Z")
        ])
        XCTAssertEqual(p.heroAchievement?.key, .editor)
    }

    func test_hero_unObtenuSansDateGagneSilEstSeul() {
        let p = progression([succes(.firstContent, true, nil), succes(.editor, false)])
        XCTAssertEqual(p.heroAchievement?.key, .firstContent,
                       "Un palier tenu par le seul compteur reste un succès obtenu — il ne disparaît pas de l'écran.")
    }

    // MARK: - Rien d'obtenu ⇒ le PROCHAIN, jamais un trou

    func test_hero_sansAucunSuccesMontreLePremierVerrouille() {
        let p = progression([
            succes(.firstContent, false),
            succes(.allContentTypes, false)
        ])
        XCTAssertEqual(p.heroAchievement?.key, .firstContent,
                       "Quelqu'un qui n'a rien débloqué est exactement la personne à qui il faut dire quoi faire.")
    }

    func test_hero_catalogueVideRendNil() {
        XCTAssertNil(progression([]).heroAchievement)
    }
}
