import XCTest
@testable import MeeshySDK

/// **Le catalogue des défis est LOCAL — il survit à l'absence de sa mesure** (#5916).
///
/// `achievementSections` était construit par `payload.achievementReach.map { … } ?? []` :
/// un champ ABSENT rendait zéro section, et `ProgressionLayout` retirait alors la
/// porte « Défis » de l'écran entier. Le porteur l'a constaté — la section
/// visible sur web-v31 et sur l'app précédente, absente de la native.
///
/// Or `isAttainable` sait déjà répondre sans mesure : `guard let mesure =
/// reach[family.id] else { return family.scale == "count" }`. Un `reach` VIDE
/// produit donc des entrées ; seul le `?? []` d'AVANT le catalogue n'en
/// produisait aucune. **Vide et absent doivent dégrader pareil.**
final class AchievementSectionsWithoutReachTests: XCTestCase {

    private func payload(reach: [String: Int]?) -> APIEngagementProgress {
        APIEngagementProgress(
            counters: [], milestones: [],
            streak: .init(currentStreakDays: 3, longestStreakDays: 5),
            level: .init(engagementScore: 120),
            meesh: nil, elan: nil, achievementReach: reach
        )
    }

    func test_sansLeChampLeCatalogueProduitQuandMeme() {
        let sansMesure = EngagementProgressResolver.resolve(payload(reach: nil))
        XCTAssertFalse(sansMesure.achievementSections.isEmpty,
                       "Sans ce champ, l'écran perd la porte Défis entière — un tiers du hub.")
    }

    /// Le témoin de RÉFÉRENCE : un `reach` vide passe déjà par le catalogue.
    /// C'est lui qui prouve que « absent » et « vide » divergeaient.
    func test_unReachVideProduitDejaDesSections() {
        XCTAssertFalse(EngagementProgressResolver.resolve(payload(reach: [:])).achievementSections.isEmpty)
    }

    func test_absentEtVideDonnentLeMemeResultat() {
        let absent = EngagementProgressResolver.resolve(payload(reach: nil)).achievementSections
        let vide = EngagementProgressResolver.resolve(payload(reach: [:])).achievementSections
        XCTAssertEqual(absent.map(\.section), vide.map(\.section),
                       "Deux façons de ne pas savoir doivent dégrader pareil.")
    }
}
