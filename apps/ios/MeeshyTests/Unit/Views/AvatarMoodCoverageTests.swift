import XCTest
import SwiftUI
@testable import Meeshy

/// L'humeur se voit sur l'avatar des messages en mode bulles et dans toutes
/// les feuilles de profil (#10529, suite de #10528).
///
/// Le mode bulles déclarait `ThemedMessageBubble.senderMoodEmoji` sans qu'aucun
/// appelant ne l'alimente, et la feuille de profil ouverte depuis la
/// visionneuse de story ne recevait ni l'humeur ni son toucher.
@MainActor
final class AvatarMoodCoverageTests: XCTestCase {

    private var appRoot: URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // Unit/Views
            .deletingLastPathComponent()   // Unit
            .deletingLastPathComponent()   // MeeshyTests
            .deletingLastPathComponent()   // apps/ios
    }

    private func stripped(_ relativePath: String) throws -> String {
        let url = appRoot.appendingPathComponent(relativePath)
        return AppSourceGuard.stripComments(try AppSourceGuard.text(at: url))
    }

    private let views = "Meeshy/Features/Main/Views/"

    // MARK: - Mon profil

    func test_shownMood_outsideEditing_returnsMyMood() {
        XCTAssertEqual(ProfileOwnAvatar.shownMood("🎉", isEditing: false), "🎉")
    }

    func test_shownMood_whileEditing_leavesTheCornerToThePencil() {
        XCTAssertNil(ProfileOwnAvatar.shownMood("🎉", isEditing: true))
    }

    func test_shownMood_withoutMood_returnsNil() {
        XCTAssertNil(ProfileOwnAvatar.shownMood(nil, isEditing: false))
    }

    func test_profileView_mountsTheAvatarThatCarriesMyMood() throws {
        XCTAssertTrue(
            try stripped(views + "ProfileView.swift").contains("ProfileOwnAvatar(user: user, accentColor: user?.profileAccentHex ?? accentColor, isEditing: isEditing)"),
            "l'écran de mon profil peint mon avatar par ProfileOwnAvatar — sans lui, mon humeur manque sur le seul écran qui me présente"
        )
    }

    // MARK: - Mode bulles

    func test_bubbleSenderMoodTap_byDefault_isAbsent() {
        XCTAssertNil(EnvironmentValues().bubbleSenderMoodTap, "sans hôte, la pastille reste un dessin : aucun toucher sans effet")
    }

    func test_bubbleSenderMoodTap_whenSet_reachesTheFooterWithItsAnchor() {
        var received: CGPoint?
        var environment = EnvironmentValues()
        environment.bubbleSenderMoodTap = { received = $0 }
        environment.bubbleSenderMoodTap?(CGPoint(x: 12, y: 34))
        XCTAssertEqual(received, CGPoint(x: 12, y: 34))
    }

    func test_host_bubbleMode_feedsTheSenderMoodAndItsTap() throws {
        let code = try stripped(views + "MessageListViewController.swift")
        XCTAssertTrue(
            code.contains("senderIsHere: senderIsHere, senderMoodEmoji: statuses.statusForUser(userId: senderId)?.moodEmoji,"),
            "l'hôte remet à la bulle l'humeur de l'auteur, lue dans les statuts déjà en mémoire — aucune requête par cellule"
        )
        XCTAssertTrue(
            code.contains("onSenderMoodTap: statuses.moodTapHandler(for: senderId)"),
            "le toucher de l'humeur ouvre la bulle d'humeur (emoji + texte) par le gestionnaire de #10528"
        )
    }

    func test_themedMessageBubble_handsTheMoodTapToItsFooter() throws {
        XCTAssertTrue(
            try stripped(views + "ThemedMessageBubble.swift").contains(".environment(\\.bubbleSenderMoodTap, onSenderMoodTap)"),
            "la bulle pose le toucher de l'humeur pour le pied qui porte l'avatar de l'auteur"
        )
    }

    func test_themedMessageBubble_keepsTheMoodTapOutOfItsEquality() throws {
        let code = try stripped(views + "ThemedMessageBubble.swift")
        XCTAssertTrue(code.contains("lhs.senderMoodEmoji == rhs.senderMoodEmoji"), "l'humeur est une valeur comparée")
        XCTAssertFalse(code.contains("lhs.onSenderMoodTap"), "une fermeture ne se compare pas : elle ne provoque aucun rendu de cellule")
    }

    func test_bubbleFooter_keepsTheMoodStillAndTappable() throws {
        let code = try stripped(views + "Bubble/BubbleFooter.swift")
        XCTAssertTrue(code.contains("context: .messageBubble"), "le contexte de bulle ne fait pas respirer la pastille")
        XCTAssertTrue(code.contains("enablePulse: false"), "aucun pulse sur la pastille d'un message")
        XCTAssertTrue(code.contains("onMoodTap: senderMoodTap"), "l'avatar de l'auteur reçoit le toucher de l'humeur")
    }

    // MARK: - Feuilles de profil

    /// Chaque présentation de `UserProfileSheet` remet l'humeur ET son toucher.
    /// La visionneuse de story ne remettait ni l'une ni l'autre.
    func test_everyProfileSheetSite_receivesTheMoodAndItsTap() throws {
        let sources = appRoot.appendingPathComponent("Meeshy")
        let files = (FileManager.default.enumerator(at: sources, includingPropertiesForKeys: nil)?
            .compactMap { $0 as? URL } ?? [])
            .filter { $0.pathExtension == "swift" }
        var sites = 0
        for file in files {
            let code = AppSourceGuard.stripComments(try AppSourceGuard.text(at: file))
            for call in Self.calls(of: "UserProfileSheet(", in: code) {
                sites += 1
                XCTAssertTrue(call.contains("moodEmoji:"), "\(file.lastPathComponent) présente un profil sans son humeur")
                XCTAssertTrue(call.contains("onMoodTap:"), "\(file.lastPathComponent) présente un profil dont l'humeur ne se touche pas")
            }
        }
        XCTAssertGreaterThanOrEqual(sites, 11, "la garde doit avoir lu les présentations de profil, pas un dossier vide")
    }

    func test_storyViewerProfileSheet_readsTheMoodFromTheRootResolvers() throws {
        let code = try stripped(views + "StoryViewerView+Header.swift")
        XCTAssertTrue(code.contains("moodEmoji: moodEmojiResolver?(user.userId ?? \"\")"))
        XCTAssertTrue(code.contains("onMoodTap: moodTapResolver?(user.userId ?? \"\")"))
    }

    func test_callDetailSheet_showsThePeerMoodAndItsTap() throws {
        let code = try stripped("Meeshy/Features/Contacts/CallDetailSheet.swift")
        XCTAssertTrue(code.contains("moodEmoji: peerUserId.flatMap { moodEmojiResolver?($0) }"))
        XCTAssertTrue(code.contains("onMoodTap: peerUserId.flatMap { moodTapResolver?($0) }"))
    }

    /// Le texte de chaque appel `nom(` … `)`, parenthèses équilibrées.
    private static func calls(of opener: String, in code: String) -> [String] {
        var found: [String] = []
        var cursor = code.startIndex
        while let range = code.range(of: opener, range: cursor..<code.endIndex) {
            let before = range.lowerBound == code.startIndex ? nil : code[code.index(before: range.lowerBound)]
            var depth = 1
            var index = range.upperBound
            while depth > 0, index < code.endIndex {
                if code[index] == "(" { depth += 1 }
                if code[index] == ")" { depth -= 1 }
                index = code.index(after: index)
            }
            let prolonged = before.map { $0.isLetter || $0.isNumber || $0 == "_" } ?? false
            if !prolonged { found.append(String(code[range.lowerBound..<index])) }
            cursor = index
        }
        return found
    }
}
