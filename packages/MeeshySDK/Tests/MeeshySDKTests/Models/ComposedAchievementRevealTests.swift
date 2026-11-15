import XCTest
@testable import MeeshySDK

/// **Un succès de la GRAMMAIRE se célèbre comme les cinq autres (#5847).**
///
/// `EngagementReveal.from` ne connaissait que `EngagementAchievementKey` — les
/// CINQ clés legacy. Les cent quatorze succès composés
/// (`achievement.<section>.<sujet>.<geste>.<échelle>:<palier>`) rendaient donc
/// `nil` : même annoncés, ils n'auraient rien pu montrer. Le tap retombait sur
/// la grille où il faut retrouver soi-même ce qu'on vient d'obtenir.
///
/// Et la seconde règle du porteur vit ici : **un succès se célèbre tout seul,
/// un badge / une série / un niveau se contentent d'une notification.**
final class ComposedAchievementRevealTests: XCTestCase {

    private func metadata(_ json: String) throws -> NotificationMetadata {
        try JSONDecoder().decode(NotificationMetadata.self, from: Data(json.utf8))
    }

    private var conversationJoinSize: AchievementFamily {
        AchievementCatalog.families.first { $0.id == "conversation.join.size" }!
    }

    // MARK: - Lire une clé composée

    func test_parse_rendLaFamilleEtSonPalier() {
        let clé = conversationJoinSize.key(tier: 1_000)
        let lu = AchievementCatalog.parse(key: clé)
        XCTAssertEqual(lu?.family, conversationJoinSize)
        XCTAssertEqual(lu?.tier, 1_000)
    }

    /// L'aller-retour sur TOUTES les familles : une clé produite par le
    /// catalogue doit se relire par le catalogue. C'est ce qui interdit à
    /// `parse` de dériver de `key(tier:)` sans que rien ne rougisse.
    func test_parse_estLInverseDeKey_surToutLeCatalogue() {
        for famille in AchievementCatalog.families {
            for palier in famille.tiers {
                let lu = AchievementCatalog.parse(key: famille.key(tier: palier))
                XCTAssertEqual(lu?.family, famille, "aller-retour cassé sur \(famille.id):\(palier)")
                XCTAssertEqual(lu?.tier, palier)
            }
        }
    }

    /// Un palier hors de l'échelle de sa famille n'est PAS un succès : le
    /// catalogue ne l'a jamais produit. L'accepter ferait célébrer une
    /// « conversation de 42 membres » que rien ne peut débloquer — le repli
    /// menteur, avec un badge bien dessiné et un fait inventé.
    func test_parse_refuseUnPalierHorsEchelle() {
        XCTAssertNil(AchievementCatalog.parse(key: "achievement.cercles.conversation.join.size:42"))
    }

    func test_parse_refuseCeQuiNEstPasUneCleDeSucces() {
        XCTAssertNil(AchievementCatalog.parse(key: "achievement.first_voice"))
        XCTAssertNil(AchievementCatalog.parse(key: "conversation.join.size:10"))
        XCTAssertNil(AchievementCatalog.parse(key: "achievement.cercles.conversation.join.size"))
        XCTAssertNil(AchievementCatalog.parse(key: "achievement.cercles.licorne.join.size:10"))
        XCTAssertNil(AchievementCatalog.parse(key: ""))
    }

    // MARK: - La dérivation depuis la notification

    func test_reveal_derivéDUneCleComposee() throws {
        let clé = conversationJoinSize.key(tier: 1_000)
        let m = try metadata(#"{"achievementKey":"\#(clé)"}"#)
        XCTAssertEqual(
            EngagementReveal.from(type: .achievementUnlocked, metadata: m),
            .composedAchievement(family: conversationJoinSize, tier: 1_000)
        )
    }

    /// Les cinq legacy continuent de passer par leur enum — l'ordre des deux
    /// lectures ne doit pas les faire tomber dans la grammaire.
    func test_reveal_lesCinqLegacyRestentIntactes() throws {
        let m = try metadata(#"{"achievementKey":"achievement.first_voice"}"#)
        XCTAssertEqual(EngagementReveal.from(type: .achievementUnlocked, metadata: m), .achievement(.firstVoice))
    }

    func test_reveal_uneCleInconnueNeCelebreRien() throws {
        let m = try metadata(#"{"achievementKey":"achievement.licorne.arc_en_ciel.count:3"}"#)
        XCTAssertNil(EngagementReveal.from(type: .achievementUnlocked, metadata: m))
    }

    // MARK: - Ce qui se célèbre TOUT SEUL

    /// Directive porteur (2026-09-09) : « la vue d'achievement s'affiche
    /// lorsqu'on a réalisé une opération qui déclenche un succès, le reste ce
    /// sont des notifications rien de plus ».
    func test_seulUnSuccesSeCelebreSansQuOnTouche() {
        XCTAssertTrue(EngagementReveal.achievement(.firstVoice).celebratesUnprompted)
        XCTAssertTrue(
            EngagementReveal.composedAchievement(family: conversationJoinSize, tier: 10).celebratesUnprompted
        )
        XCTAssertFalse(EngagementReveal.streak(days: 7).celebratesUnprompted)
        XCTAssertFalse(EngagementReveal.level(3).celebratesUnprompted)
    }

    /// Le symbole d'un succès composé est celui de la grille — la célébration
    /// et le tableau de bord doivent se reconnaître.
    func test_symbole_dUnSuccesCompose_estCeluiDunSucces() {
        XCTAssertEqual(
            EngagementReveal.composedAchievement(family: conversationJoinSize, tier: 10).symbolName,
            EngagementReveal.achievement(.firstVoice).symbolName
        )
    }
}
