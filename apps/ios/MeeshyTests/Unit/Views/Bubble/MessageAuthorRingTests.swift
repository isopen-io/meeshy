import XCTest
import MeeshySDK
import MeeshyUI
@testable import Meeshy

/// #10713 — le contour d'avatar équipé de l'auteur se dessine sur son avatar dans le fil :
/// en bulles (pied de la bulle), en Focal et en Script (en-tête d'identité), dans
/// l'empreinte de l'avatar — rien ne grandit, et sa couche animée y joue (#10815, sous le
/// plafond des films vivants de `LottieLiveBudget`).
@MainActor
final class MessageAuthorRingTests: XCTestCase {

    private static let filet = ServedProfileDecorItem(pack: "contours-essentiels", item: "filet", origin: .builtin)

    func test_resolve_builtinRingOfTheAuthor_isDrawable() throws {
        let message = MeeshyMessage(id: "m1", conversationId: "c1", senderId: "p1", content: "Salut", senderRing: Self.filet)
        let design = try XCTUnwrap(ProfileDecorResolver.ring(message.senderRing))
        XCTAssertEqual(design, AvatarRingCatalog.shared.ring(pack: "contours-essentiels", item: "filet"))
    }

    func test_resolve_noRing_drawsTheAvatarAsBefore() {
        let message = MeeshyMessage(id: "m1", conversationId: "c1", senderId: "p1", content: "Salut")
        XCTAssertNil(ProfileDecorResolver.ring(message.senderRing))
    }

    func test_senderIdentity_ringChangesTheFooterModel() {
        let bare = SenderIdentity(name: "Ama", username: nil, role: nil, avatarURL: nil, accentColor: "6366F1",
                                  moodEmoji: nil, presence: nil, storyRing: .none)
        var ringed = bare
        ringed.ring = Self.filet
        XCTAssertNotEqual(bare, ringed, "un contour qui arrive doit repeindre le pied de la bulle")
    }

    /// #10946, #10956 — la fiche d'auteur d'une pièce de la galerie porte le COMPTE de
    /// l'auteur (la clé de sa présence servie, jamais l'identifiant de participation) et son contour.
    func test_gallerySenderInfo_carriesTheAccountAndTheRing() {
        let message = MeeshyMessage(id: "m1", conversationId: "c1", senderId: "p1", content: "Salut",
                                    senderUserId: "u1", senderRing: Self.filet)

        let info = ConversationMediaRules.senderInfo(of: message)

        XCTAssertEqual(info.senderUserId, "u1")
        XCTAssertEqual(info.senderRing, Self.filet)
    }

    /// #10946 — le visage du frappeur porte son contour équipé, relu dans ses messages comme sa photo.
    func test_typingStarted_carriesTheLocallyKnownRing() async throws {
        let conversationId = "000000000000000000000099"
        let socket = MockMessageSocket()
        let sut = ConversationSocketHandler(conversationId: conversationId, currentUserId: "000000000000000000000001", messageSocket: socket)
        let delegate = MockConversationSocketDelegate()
        sut.delegate = delegate
        sut.armSocketSubscriptions()
        delegate.stubbedRings = ["000000000000000000000002": Self.filet]

        socket.typingStarted.send(TypingEvent(userId: "000000000000000000000002", username: "bob", displayName: "Bob", conversationId: conversationId))
        let deadline = Date().addingTimeInterval(5)
        while delegate.typingParticipants.isEmpty, Date() < deadline { try await Task.sleep(nanoseconds: 10_000_000) }

        XCTAssertEqual(delegate.typingParticipants.first?.ring, Self.filet)
    }

    // MARK: - Gardes de montage

    private static let appRoot = URL(fileURLWithPath: #filePath)
        .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
        .deletingLastPathComponent().deletingLastPathComponent()

    private func source(_ path: String) throws -> String {
        AppSourceGuard.stripComments(try String(contentsOf: Self.appRoot.appendingPathComponent(path), encoding: .utf8))
    }

    /// #10946 — l'avatar résout lui-même la RÉFÉRENCE servie (`ring:`) : le pied de la bulle
    /// la lui passe et ne réenveloppe plus, sans quoi deux contours s'y dessineraient.
    func test_guard_bubbleFooterPassesTheServedRingToTheAvatar() throws {
        let footer = try source("Meeshy/Features/Main/Views/Bubble/BubbleFooter.swift")
        XCTAssertTrue(footer.contains("ring: sender.ring,"))
        XCTAssertFalse(footer.contains(".avatarRingWithin("))
        let layout = try source("Meeshy/Features/Main/Views/Bubble/BubbleStandardLayout+Footer.swift")
        XCTAssertTrue(layout.contains("ring: message.senderRing"))
    }

    func test_guard_focalAndScriptHeaderPassTheServedRingToTheAvatar() throws {
        let header = try source("Meeshy/Features/Main/Focal/Row/FocalIdentityHeader.swift")
        XCTAssertTrue(header.contains("ring: senderRing,"))
        XCTAssertFalse(header.contains(".avatarRingWithin("))
        let row = try source("Meeshy/Features/Main/Focal/Row/FocalRow.swift")
            + "\n" + source("Meeshy/Features/Main/Focal/Row/FocalFocusChrome.swift")
        XCTAssertEqual(row.components(separatedBy: "senderRing: input.senderRing").count - 1, 2, "les deux en-têtes de la rangée plate")
        let rows = try source("Meeshy/Features/Main/Views/MessageListViewController+Rows.swift")
        XCTAssertTrue(rows.contains("senderRing: isMine ? nil : message.senderRing"))
    }

    /// Décision porteur 2026-10-16 (#10815) : tout décor animé s'anime partout, listes comprises.
    /// Le plafond des films vivants (`LottieLiveBudget`) borne ce qui joue ; aucune surface ne
    /// fige son décor d'elle-même.
    func test_guard_noDecorSurfaceFreezesItsAnimatedLayer() throws {
        let surfaces = [
            "Meeshy/Features/Main/Views/Bubble/BubbleFooter.swift",
            "Meeshy/Features/Main/Focal/Row/FocalIdentityHeader.swift",
            "Meeshy/Features/Main/Views/ThemedConversationRow.swift",
            "Meeshy/Features/Main/Lentille/Row/LentilleConversationRow.swift",
            "Meeshy/Features/Main/Views/ParticipantsView.swift",
            "Meeshy/Features/Main/Components/ConversationInfoSheet.swift",
            "Meeshy/Features/Main/Views/ProfileDecorSheet.swift",
        ]
        for path in surfaces {
            let text = try source(path)
            XCTAssertTrue(text.contains("ring:") || text.contains("avatarRing"), "\(path) pose un contour")
            XCTAssertFalse(text.contains("animates: false"), "\(path) ne fige pas son décor (#10815)")
        }
    }

    // MARK: - Garde d'inventaire : chaque avatar d'une personne porte son contour servi

    /// Directive porteur 2026-10-18 (#10946) : le contour équipé s'affiche partout où l'avatar
    /// d'une personne s'affiche. Chaque `MeeshyAvatar(` qui ne passe pas `ring:` (hors
    /// `kind: .entity`, qui ne porte aucun contour) est COMPTÉ par fichier, et le compte ne
    /// dépasse jamais celui nommé ici avec sa raison — un registre EXACT : il ne fait que descendre, et une entrée qui ne compte plus rien rougit.
    private static let avatarsWithoutRing: [String: (count: Int, reason: String)] = [
        "Contacts/BlockedTab.swift": (1, "bloqué — ni contour ni présence ne se montrent"),
        "Main/Views/BlockedUsersView.swift": (1, "bloqué — ni contour ni présence ne se montrent"),
        "Contacts/CallDetailSheet.swift": (2, "journal d'appel — la charge de l'appel ne sert pas le contour (#10957)"),
        "Contacts/CallLinkConfirmation.swift": (1, "lien d'appel — la cible résolue ne sert pas le contour (#10957)"),
        "Contacts/CallsTab.swift": (1, "journal d'appel — la charge de l'appel ne sert pas le contour (#10957)"),
        "Main/Views/CallControlsViews.swift": (1, "appel — l'invitation qui sonne ne porte pas le contour (#10957)"),
        "Main/Components/ContactCard/ContactCardDetailSheet.swift": (1, "carte de contact — le compte public servi ne porte pas le contour (#10957)"),
        "Main/Components/ContactCardView.swift": (1, "carte de contact — le compte public servi ne porte pas le contour (#10957)"),
        "Main/Components/ConversationCard/ConversationLinkCardBody.swift": (1, "carte de lien — l'invitant servi ne porte pas le contour (#10957)"),
        "Main/Components/MessageDetail/MessageReactionsDetailView.swift": (1, "réactions — la liste des réacteurs ne porte pas le contour (#10957)"),
        "Main/Views/AudioFullscreenPage.swift": (1, "plein écran audio — l'auteur transmis (`ProfileSheetUser`) ne porte pas le contour (#10957)"),
        "Main/Views/GlobalSearchView.swift": (1, "résultat de MESSAGE — l'avatar de la conversation, dont la recherche ne sert ni le type ni le pair (#10957)"),
        "Main/Views/ShareLinkArrivalsSection.swift": (1, "arrivées par lien — l'entrée servie ne porte pas le contour (#10957)"),
        "Main/Views/VisitorContentView.swift": (1, "visiteur — le partageur du lien servi ne porte pas le contour (#10957)"),
        "MeeshyUI/JoinFlow/InviteLanding/InviteInviterHeader.swift": (1, "invitation — le créateur du lien servi ne porte pas le contour (#10957)"),
        "MeeshyUI/Notifications/NotificationRowView.swift": (1, "notification — l'acteur est un instantané écrit sans contour (#10957)"),
        "MeeshyUI/Notifications/NotificationToastView.swift": (1, "notification — l'acteur est un instantané écrit sans contour (#10957)"),
        "Main/Views/LoginView.swift": (1, "comptes enregistrés sur l'appareil — l'instantané local ne garde pas le contour"),
        "Main/Views/AccountSwitcherSheet.swift": (1, "comptes enregistrés sur l'appareil — l'instantané local ne garde pas le contour"),
        "Main/Views/ProfileOwnAvatar.swift": (1, "profil — le contour se pose AUTOUR de l'avatar (`.avatarRing`), comme sur la fiche de profil"),
        "Main/Views/ProfileDecorSheet.swift": (1, "sélecteur de contour — chaque tuile pose SON contour autour de l'avatar (`.avatarRing`)"),
        "MeeshyUI/Profile/UserProfileSheet+Header.swift": (2, "profil — le contour se pose AUTOUR de l'avatar (`.avatarRing`)"),
        "Main/Share/ShareRecipientRow.swift": (2, "écran de partage unique en cours (#10947/#10948) — son contour est l'affaire de son lot"),
        "Main/Views/PublicationViewersSheet.swift": (2, "vues d'une publication — la liste servie ne porte pas le contour (#10957)"),
        "Stories/Notifications/StoryExpiredContent.swift": (1, "notification de story expirée — l'acteur est un instantané sans contour (#10957)"),
        "MeeshyUI/Profile/UserProfileSheet+ConversationsTab.swift": (1, "entité — les conversations d'un profil"),
        "Auth/LinkSignInConfirmationSheet.swift": (1, "soi, avant toute session — aucun profil servi"),
        "Auth/Signup/SignupView+Card.swift": (1, "soi, compte en création — aucun contour équipé"),
        "Main/Game/Photo/GameAuthorPlateView.swift": (1, "décor, illustration ou son — aucune personne"),
        "Main/Views/WidgetPreviewView.swift": (1, "décor, illustration ou son — aucune personne"),
        "Onboarding/OnboardingCards.swift": (1, "décor, illustration ou son — aucune personne"),
        "Onboarding/OnboardingIllustrations.swift": (2, "décor, illustration ou son — aucune personne"),
        "MeeshyUI/Profile/FullscreenImageView.swift": (1, "décor, illustration ou son — aucune personne"),
        "MeeshyUI/Story/Controls/SoundDetailView.swift": (1, "décor, illustration ou son — aucune personne"),
        "MeeshyUI/Story/Controls/SoundLibraryPicker.swift": (1, "décor, illustration ou son — aucune personne"),
    ]

    func test_everyPersonAvatar_passesTheServedRing_orIsCountedWithItsReason() throws {
        let repo = Self.appRoot.deletingLastPathComponent().deletingLastPathComponent()
        let roots = [("apps/ios/Meeshy/Features/", "apps/ios/Meeshy"), ("packages/MeeshySDK/Sources/", "packages/MeeshySDK/Sources/MeeshyUI")]
        var offenders: [String] = []
        var counted: [String: Int] = [:]
        for (prefix, root) in roots {
            let enumerator = FileManager.default.enumerator(at: repo.appendingPathComponent(root), includingPropertiesForKeys: nil)
            while let url = enumerator?.nextObject() as? URL {
                guard url.pathExtension == "swift" else { continue }
                let source = AppSourceGuard.stripComments(try String(contentsOf: url, encoding: .utf8))
                let bare = Self.avatarCalls(in: source).filter { !$0.contains("ring:") && !$0.contains("kind: .entity") }.count
                guard bare > 0 else { continue }
                let relative = String(url.path.dropFirst(repo.path.count + 1))
                let key = relative.hasPrefix(prefix) ? String(relative.dropFirst(prefix.count)) : relative
                if bare > (Self.avatarsWithoutRing[key]?.count ?? 0) { offenders.append("\(key) (\(bare))") }
                counted[key] = bare
            }
        }
        XCTAssertEqual(offenders.sorted(), [], "avatar de personne sans contour servi ni raison comptée")
        let stale = Self.avatarsWithoutRing.filter { counted[$0.key] != $0.value.count }.map { "\($0.key) (\($0.value.count) → \(counted[$0.key] ?? 0))" }
        XCTAssertEqual(stale.sorted(), [], "exemption périmée : le site porte désormais son contour — le registre ne survit pas aux surfaces qu'il décrit")
    }

    private static func avatarCalls(in source: String) -> [Substring] {
        var calls: [Substring] = []
        var rest = source[...]
        while let open = rest.range(of: "MeeshyAvatar(") {
            var depth = 1
            var index = open.upperBound
            while depth > 0, index < rest.endIndex {
                if rest[index] == "(" { depth += 1 } else if rest[index] == ")" { depth -= 1 }
                index = rest.index(after: index)
            }
            calls.append(rest[open.lowerBound..<index])
            rest = rest[index...]
        }
        return calls
    }

    /// Les vignettes des fonds du sélecteur d'apparence jouent leur couche, comme le fond lui-même.
    func test_guard_appearanceThumbnailsMountTheirAnimatedLayer() throws {
        let sheet = try source("Meeshy/Features/Main/Components/ConversationAppearanceSheet.swift")
        XCTAssertTrue(sheet.contains("PackLottieLayer(ref: lottie, contentMode: .fill)"))
    }
}
