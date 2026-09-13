import XCTest
@testable import MeeshySDK

/// **Le palier voyage jusqu'à ce qui le CÉLÈBRE — ou rien ne se célèbre.**
///
/// La passerelle posait `achievementKey` / `threshold` / `level` dans la
/// métadonnée depuis toujours ; `NotificationMetadata` ne les DÉCLARAIT pas, et
/// le décodeur les jetait en silence (mesuré le 2026-09-09, #5809). Une vue de
/// célébration n'aurait rien eu à montrer — le défaut classique du champ qu'on
/// ENVOIE sans que personne ne le lise.
final class EngagementRevealTests: XCTestCase {

    private func metadata(_ json: String) throws -> NotificationMetadata {
        try JSONDecoder().decode(NotificationMetadata.self, from: Data(json.utf8))
    }

    // MARK: - Le QUATRIÈME champ, oublié par la passe qui a corrigé les trois

    /// **Un badge ne porte PAS `achievementKey` — il porte `axisKey`.**
    ///
    /// `tryAwardBadge` pose `metadata: { action, route, axisKey, threshold }`
    /// (`EngagementService.ts`) là où `tryAwardAchievement` pose
    /// `achievementKey`. La passe qui a fait entrer les trois champs ci-dessous
    /// dans `NotificationMetadata` n'a pas vu le quatrième : le décodeur jette
    /// `axisKey` en silence, exactement le défaut que ce fichier documente,
    /// resté ouvert pour la moitié badge de son sujet.
    func test_metadata_decodesTheBadgeAxis() throws {
        let m = try metadata(#"{"action":"view_details","axisKey":"content.message.text","threshold":100}"#)
        XCTAssertEqual(m.axisKey, "content.message.text",
                       "Sans l'axe, une notification de badge ne peut désigner AUCUN palier.")
        XCTAssertEqual(m.threshold, 100)
    }

    /// **`announcingTypes` DÉCLARE que `badgeEarned` annonce un palier.** Tant
    /// que `from` rend `nil` pour lui, la déclaration est fausse : toucher la
    /// notification d'un badge ouvre le tableau de bord sans jamais montrer ce
    /// qui vient d'être gagné — le défaut #5809 pour les badges seuls.
    func test_from_derivesABadgeFromItsAxisAndThreshold() throws {
        let m = try metadata(#"{"axisKey":"content.message.text","threshold":100}"#)
        let palier = EngagementReveal.from(type: .badgeEarned, metadata: m)
        XCTAssertEqual(palier, .badge(axis: "content.message.text", threshold: 100),
                       "Un badge annoncé doit se célébrer comme les trois autres formes.")
    }

    /// Le badge tombe au fil de l'usage : il se montre au TAP, jamais tout
    /// seul. Seuls les succès — composés ou du catalogue génératif —
    /// interrompent (directive porteur 2026-09-09, confirmée le même jour :
    /// « automatique pour succès et défis »).
    func test_aBadgeNeverCelebratesUnprompted() {
        XCTAssertFalse(EngagementReveal.badge(axis: "content.message.text", threshold: 100).celebratesUnprompted,
                       "Célébrer chaque badge ferait de la célébration un bruit.")
        XCTAssertTrue(EngagementReveal.composedAchievement(family: AchievementCatalog.families[0], tier: AchievementCatalog.families[0].tiers[0]).celebratesUnprompted,
                      "Un défi du catalogue génératif se célèbre seul.")
    }

    /// Un badge sans son seuil, ou sans son axe, ne se fabrique pas : c'est le
    /// repli MENTEUR que l'en-tête de `EngagementReveal` interdit.
    func test_from_refusesAnIncompleteBadge() throws {
        XCTAssertNil(EngagementReveal.from(type: .badgeEarned, metadata: try metadata(#"{"axisKey":"content.message.text"}"#)))
        XCTAssertNil(EngagementReveal.from(type: .badgeEarned, metadata: try metadata(#"{"threshold":100}"#)))
    }

    // MARK: - Le fil porte les trois champs

    func test_metadata_decodesTheThreeMilestoneFields() throws {
        let m = try metadata(#"{"action":"view_details","achievementKey":"achievement.first_voice","threshold":7,"level":3}"#)
        XCTAssertEqual(m.achievementKey, "achievement.first_voice")
        XCTAssertEqual(m.threshold, 7)
        XCTAssertEqual(m.level, 3)
    }

    /// Une charge SANS ces clés reste décodable — les notifications qui ne
    /// portent aucun palier sont l'écrasante majorité du fil.
    func test_metadata_withoutMilestoneFields_stillDecodes() throws {
        let m = try metadata(#"{"action":"open","messagePreview":"Salut"}"#)
        XCTAssertNil(m.achievementKey)
        XCTAssertNil(m.threshold)
        XCTAssertNil(m.level)
    }

    // MARK: - La dérivation

    func test_achievement_isDerivedFromItsStableKey() throws {
        let m = try metadata(#"{"achievementKey":"achievement.first_voice"}"#)
        XCTAssertEqual(EngagementReveal.from(type: .achievementUnlocked, metadata: m), .achievement(.firstVoice))
        XCTAssertEqual(EngagementReveal.from(type: .legacyAchievementUnlocked, metadata: m), .achievement(.firstVoice))
    }

    func test_streak_isDerivedFromItsThreshold() throws {
        let m = try metadata(#"{"threshold":7}"#)
        XCTAssertEqual(EngagementReveal.from(type: .streakMilestone, metadata: m), .streak(days: 7))
    }

    /// **Le témoin de SPÉCIFICITÉ.** Un `level_up` porte `threshold` ET
    /// `level` : le seuil est le SCORE (400), le rang est le NIVEAU (4). Lire
    /// `threshold` d'abord célébrerait « 400 jours de série » — une
    /// célébration parfaitement cohérente, et fausse. Sans ce témoin, l'ordre
    /// des branches n'est jamais mis à l'épreuve : sur une charge qui ne porte
    /// qu'un seul des deux champs, les deux ordres rendent le même verdict.
    func test_levelUp_celebratesTheRank_notTheScore() throws {
        let m = try metadata(#"{"threshold":400,"level":4}"#)
        XCTAssertEqual(EngagementReveal.from(type: .levelUp, metadata: m), .level(4))
    }

    // MARK: - Rien à célébrer ⇒ `nil`, jamais un repli

    func test_unknownAchievementKey_yieldsNil_ratherThanAPlausibleWrongBadge() throws {
        let m = try metadata(#"{"achievementKey":"achievement.venu_du_futur"}"#)
        XCTAssertNil(EngagementReveal.from(type: .achievementUnlocked, metadata: m),
                     "Une clé qu'on ne connaît pas ne se remplace pas par la première du "
                         + "catalogue : le badge serait bien dessiné et FAUX.")
    }

    /// Le `nil` est TYPÉ, et ce n'est pas une coquetterie : les deux portes
    /// n'ayant que le type de leur métadonnée pour se distinguer, un `nil` nu
    /// est ambigu. Écrire les deux absences dit aussi ce qu'on veut prouver —
    /// que ni l'une ni l'autre ne fabrique un palier.
    func test_missingMetadata_yieldsNil_onBothDoors() {
        let sansRest: NotificationMetadata? = nil
        let sansSocket: SocketNotificationMetadata? = nil
        for type in [MeeshyNotificationType.achievementUnlocked, .levelUp, .streakMilestone] {
            XCTAssertNil(EngagementReveal.from(type: type, metadata: sansRest))
            XCTAssertNil(EngagementReveal.from(type: type, metadata: sansSocket))
        }
    }

    func test_aNonMilestoneNotification_neverReveals() throws {
        let m = try metadata(#"{"achievementKey":"achievement.first_voice"}"#)
        XCTAssertNil(EngagementReveal.from(type: .newMessage, metadata: m),
                     "Le TYPE décide ; une clé qui traîne dans la métadonnée d'un message "
                         + "ne fabrique pas une célébration.")
    }

    // MARK: - Les DEUX portes rendent le MÊME verdict

    /// `SocketNotificationMetadata` est un type DISTINCT de
    /// `NotificationMetadata` : deux décodeurs pour un même objet sur le fil.
    /// Un palier reçu EN DIRECT (l'app ouverte, le cas le plus fréquent) passe
    /// par le premier ; le même palier relu dans la liste des notifications
    /// passe par le second. Les laisser diverger célébrerait l'un et pas
    /// l'autre — et le défaut ne se verrait que chez qui garde l'app ouverte.
    func test_bothDoors_agree_onTheSameMilestone() throws {
        let charge = #"{"achievementKey":"achievement.first_voice","threshold":400,"level":4}"#
        let rest = try JSONDecoder().decode(NotificationMetadata.self, from: Data(charge.utf8))
        let socket = try JSONDecoder().decode(SocketNotificationMetadata.self, from: Data(charge.utf8))

        for type in [MeeshyNotificationType.achievementUnlocked, .levelUp, .streakMilestone] {
            XCTAssertEqual(EngagementReveal.from(type: type, metadata: rest),
                           EngagementReveal.from(type: type, metadata: socket),
                           "Les deux portes servent la même règle pour \(type.rawValue).")
        }
    }

    /// Les cinq types annonceurs sont exactement ceux que les deux racines
    /// routent vers le tableau de bord — la liste ne doit pas diverger d'elles.
    func test_announcingTypes_coverTheFiveRoutedTypes() {
        XCTAssertEqual(
            EngagementReveal.announcingTypes,
            [.achievementUnlocked, .legacyAchievementUnlocked, .streakMilestone, .levelUp, .badgeEarned]
        )
    }
}
