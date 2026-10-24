import XCTest
import MeeshySDK
@testable import Meeshy

@MainActor
final class PresenceManagerTests: XCTestCase {

    private typealias AppUserPresence = UserPresence

    private var sut: PresenceManager!

    override func setUp() async throws {
        sut = PresenceManager.shared
        sut.presenceMap.removeAll()
    }

    override func tearDown() async throws {
        sut.presenceMap.removeAll()
        sut = nil
    }

    // MARK: - Déconnexion

    /// La carte de présence (et son fichier `meeshy_cache/presence_map.json`,
    /// sans compte dans son nom) survivait à la déconnexion : le compte suivant
    /// voyait la présence des amis du compte sortant — que la loi de visibilité
    /// ne lui sert jamais.
    func test_resetForLogout_forgetsEveryPresence() {
        sut.presenceMap["friend-of-A"] = AppUserPresence(isOnline: true, lastActiveAt: Date())
        sut.resetForLogout()
        XCTAssertTrue(sut.presenceMap.isEmpty)
        XCTAssertEqual(sut.conversationViewers, ConversationViewers())
    }

    func test_logoutTeardown_resetsPresence() throws {
        let source = try AppSourceGuard.unit("Meeshy/Core/DependencyContainer.swift")
        XCTAssertTrue(source.contains("PresenceManager.shared.resetForLogout()"),
                      "la purge de déconnexion doit vider la présence du compte sortant")
    }

    // MARK: - La présence de l'auteur d'un message (#10944)

    /// `senderId` est l'identifiant de PARTICIPATION ; la carte est tenue par
    /// COMPTE. Lue par `senderId`, la pastille d'un ami en ligne restait éteinte
    /// dans les bulles, la pile de l'en-tête, la Rivière et le résumé.
    func test_presenceStateForSenderOf_registeredSender_readsTheAccountPresence() {
        sut.presenceMap["user-1"] = AppUserPresence(isOnline: true, lastActiveAt: Date())
        let message = Message(conversationId: "conv-1", senderId: "participant-1", content: "salut", senderUserId: "user-1")
        XCTAssertEqual(sut.presenceState(forSenderOf: message), .online)
    }

    func test_presenceStateForSenderOf_anonymousSender_withoutServedPresence_isOffline() {
        sut.presenceMap["user-1"] = AppUserPresence(isOnline: true, lastActiveAt: Date())
        let message = Message(conversationId: "conv-1", senderId: "participant-9", content: "salut", senderUserId: "user-1", senderIsAnonymous: true)
        XCTAssertEqual(sut.presenceState(forSenderOf: message), .offline)
    }

    /// Le plateau d'histoires sert la présence de l'auteur : sans elle, une
    /// story d'ami ne portait de point qu'après un `user:status`.
    func test_presenceStateServed_withoutLiveEntry_rendersTheServedPresence() {
        XCTAssertEqual(sut.presenceState(for: "user-2", served: AppUserPresence(isOnline: true)), .online)
        XCTAssertEqual(sut.presenceState(for: "user-2", served: nil), .offline)
    }

    func test_presenceStateServed_liveEntryWins() {
        sut.presenceMap["user-2"] = AppUserPresence(isOnline: false, lastActiveAt: Date().addingTimeInterval(-120))
        XCTAssertEqual(sut.presenceState(for: "user-2", served: AppUserPresence(isOnline: true)), .away)
    }

    /// Aucun site ne relit la carte par un identifiant de PARTICIPATION.
    func test_noAvatarSite_readsPresenceByParticipationId() throws {
        let sites = [
            "Meeshy/Features/Main/Views/ConversationView+Header.swift",
            "Meeshy/Features/Main/Views/ConversationView.swift",
            "Meeshy/Features/Main/Views/MessageListViewController+Rows.swift",
            "Meeshy/Features/Main/Focal/Summary/LivingSummaryAssembly.swift",
            "Meeshy/Features/Main/Components/ConversationInfoSheet.swift",
            "Meeshy/Features/Main/Views/ParticipantsView.swift",
        ]
        let forbidden = try NSRegularExpression(pattern: #"presenceState\(for: (message\.senderId|senderId|member\.id|participant\.id)\)"#)
        for site in sites {
            let source = AppSourceGuard.stripComments(try AppSourceGuard.unit(site))
            let hits = forbidden.numberOfMatches(in: source, range: NSRange(source.startIndex..., in: source))
            XCTAssertEqual(hits, 0, "\(site) lit la présence par un identifiant de participation")
        }
    }

    // MARK: - Un avatar de pair porte la présence servie (#10944)

    /// Chaque `MeeshyAvatar(` de l'app et de MeeshyUI passe `presenceState:` —
    /// la présence SERVIE, absente ⇒ aucun point. Un fichier qui en monte un
    /// sans elle doit être NOMMÉ ici, avec sa raison : un nouvel avatar de pair
    /// sans présence rougit.
    private static let avatarsWithoutPresence: [String: String] = [
        "Auth/LinkSignInConfirmationSheet.swift": "soi — l'avatar du compte connecté",
        "Auth/Signup/SignupView+Card.swift": "soi — l'avatar du compte connecté",
        "Main/Composer/ComposerDocumentSurface.swift": "soi — l'avatar du compte connecté",
        "Main/Views/AccountSwitcherSheet.swift": "soi — l'avatar du compte connecté",
        "Main/Views/FeedView+Composer.swift": "soi — l'avatar du compte connecté",
        "Main/Views/LoginView.swift": "soi — l'avatar du compte connecté",
        "Main/Views/ProfileDecorSheet.swift": "soi — l'avatar du compte connecté",
        "Main/Views/ProfileOwnAvatar.swift": "soi — l'avatar du compte connecté",
        "Main/Views/RootFloatingChrome.swift": "soi — l'avatar du compte connecté",
        "Main/Views/RootViewComponents.swift": "soi — l'avatar du compte connecté",
        "Main/Views/SettingsView.swift": "soi — l'avatar du compte connecté",
        "Main/Views/FeedComposerSheet.swift": "soi — l'avatar du compte connecté",
        "Main/Views/StoryTrayView.swift": "soi — l'avatar du compte connecté",
        "Main/Views/GlobalSearchView.swift": "entité — groupe, communauté, conversation, message sans compte",
        "MeeshyUI/Profile/UserProfileSheet+ConversationsTab.swift": "entité — groupe, communauté, conversation, message sans compte",
        "Main/Components/ContactCard/ContactCardDetailSheet.swift": "contexte qui ne peint aucun point (showsOnlineDot == false) ou carte de présence séparée",
        "Main/Views/StoryAuthorIdentityCard.swift": "contexte qui ne peint aucun point (showsOnlineDot == false) ou carte de présence séparée",
        "Contacts/BlockedTab.swift": "bloqué — aucune présence ne se montre",
        "Main/Views/BlockedUsersView.swift": "bloqué — aucune présence ne se montre",
        "Main/Game/Photo/GameAuthorPlateView.swift": "décor, illustration ou son — aucune personne",
        "Main/Views/WidgetPreviewView.swift": "décor, illustration ou son — aucune personne",
        "Onboarding/OnboardingCards.swift": "décor, illustration ou son — aucune personne",
        "Onboarding/OnboardingIllustrations.swift": "décor, illustration ou son — aucune personne",
        "MeeshyUI/Profile/FullscreenImageView.swift": "décor, illustration ou son — aucune personne",
        "MeeshyUI/Story/Controls/SoundDetailView.swift": "décor, illustration ou son — aucune personne",
        "MeeshyUI/Story/Controls/SoundLibraryPicker.swift": "décor, illustration ou son — aucune personne",
        "Contacts/CallDetailSheet.swift": "la passerelle ne sert aucune présence à cette charge (non-amis, visiteur, auteur de publication)",
        "Contacts/CallLinkConfirmation.swift": "la passerelle ne sert aucune présence à cette charge (non-amis, visiteur, auteur de publication)",
        "Contacts/RequestsTab.swift": "la passerelle ne sert aucune présence à cette charge (non-amis, visiteur, auteur de publication)",
        "Main/Views/FriendRequestListView.swift": "la passerelle ne sert aucune présence à cette charge (non-amis, visiteur, auteur de publication)",
        "Main/Components/ContactCardView.swift": "la passerelle ne sert aucune présence à cette charge (non-amis, visiteur, auteur de publication)",
        "Main/Components/ConversationCard/ConversationLinkCardBody.swift": "la passerelle ne sert aucune présence à cette charge (non-amis, visiteur, auteur de publication)",
        "Main/Views/ShareLinkArrivalsSection.swift": "la passerelle ne sert aucune présence à cette charge (non-amis, visiteur, auteur de publication)",
        "Main/Views/VisitorContentView.swift": "la passerelle ne sert aucune présence à cette charge (non-amis, visiteur, auteur de publication)",
        "MeeshyUI/JoinFlow/InviteLanding/InviteInviterHeader.swift": "la passerelle ne sert aucune présence à cette charge (non-amis, visiteur, auteur de publication)",
        "Stories/Notifications/StoryExpiredContent.swift": "la passerelle ne sert aucune présence à cette charge (non-amis, visiteur, auteur de publication)",
        "Main/Views/NearbyDiscoveryView.swift": "la passerelle ne sert aucune présence à cette charge (non-amis, visiteur, auteur de publication)",
        "Main/Views/AudioFullscreenPage.swift": "la passerelle ne sert aucune présence à cette charge (non-amis, visiteur, auteur de publication)",
        "Main/Components/ForwardPickerSheet.swift": "remplacés par l'écran de partage unique (#10947/#10948)",
        "Main/Views/SharePickerView.swift": "remplacés par l'écran de partage unique (#10947/#10948)",
        "Main/Share/ShareSheetView.swift": "écran de partage unique en cours (#10947/#10948) — sa présence est l'affaire de son lot",
    ]

    func test_everyPeerAvatar_passesTheServedPresence_orIsNamedWithItsReason() throws {
        let repo = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
        let roots = [("apps/ios/Meeshy/Features/", "apps/ios/Meeshy"), ("packages/MeeshySDK/Sources/", "packages/MeeshySDK/Sources/MeeshyUI")]
        var offenders: [String] = []
        for (prefix, root) in roots {
            let enumerator = FileManager.default.enumerator(at: repo.appendingPathComponent(root), includingPropertiesForKeys: nil)
            while let url = enumerator?.nextObject() as? URL {
                guard url.pathExtension == "swift" else { continue }
                let source = AppSourceGuard.stripComments(try String(contentsOf: url, encoding: .utf8))
                guard Self.avatarCalls(in: source).contains(where: { !$0.contains("presenceState:") && !$0.contains("kind: .entity") }) else { continue }
                let relative = String(url.path.dropFirst(repo.path.count + 1))
                let key = relative.hasPrefix(prefix) ? String(relative.dropFirst(prefix.count)) : relative
                if Self.avatarsWithoutPresence[key] == nil { offenders.append(key) }
            }
        }
        XCTAssertEqual(offenders.sorted(), [], "avatar sans présence servie ni raison nommée")
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

    // MARK: - UserPresence.state computed property

    func test_state_whenOffline_returnsOffline() {
        let presence = AppUserPresence(isOnline: false, lastActiveAt: nil)
        XCTAssertEqual(presence.state, PresenceState.offline)
    }

    func test_state_whenOfflineActive2minAgo_returnsAway() {
        let presence = AppUserPresence(isOnline: false, lastActiveAt: Date().addingTimeInterval(-120))
        XCTAssertEqual(presence.state, PresenceState.away)
    }

    func test_state_whenOfflineInactiveOver5min_returnsOffline() {
        let presence = AppUserPresence(isOnline: false, lastActiveAt: Date().addingTimeInterval(-360))
        XCTAssertEqual(presence.state, PresenceState.offline)
    }

    func test_state_whenOnlineNoLastActiveAt_returnsOnline() {
        let presence = AppUserPresence(isOnline: true, lastActiveAt: nil)
        XCTAssertEqual(presence.state, PresenceState.online)
    }

    func test_state_whenOnlineRecentActivity_returnsOnline() {
        // -30s : confortablement dans la fenetre online (<= 60s), robuste aux ms
        // ecoulees avant que `.state` relise Date() (la borne exacte 60s est
        // testee de maniere deterministe dans UserPresenceStateTests via state(now:)).
        let recentDate = Date().addingTimeInterval(-30)
        let presence = AppUserPresence(isOnline: true, lastActiveAt: recentDate)
        XCTAssertEqual(presence.state, PresenceState.online)
    }

    func test_state_whenConnectedWithStaleTimestamp_staysOnline() {
        // isOnline backend est autoritatif : connecte = vert, meme si le
        // dernier lastActiveAt date de quelques minutes (garde anti-stale 5 min).
        let borderDate = Date().addingTimeInterval(-240) // 4 min : sous la garde
        let presence = AppUserPresence(isOnline: true, lastActiveAt: borderDate)
        XCTAssertEqual(presence.state, PresenceState.online)
    }

    func test_state_whenDisconnectedWithin5min_returnsIdle() {
        let borderDate = Date().addingTimeInterval(-240) // 4 min : fenetre grise 3-5 min
        let presence = AppUserPresence(isOnline: false, lastActiveAt: borderDate)
        XCTAssertEqual(presence.state, PresenceState.idle)
    }

    func test_state_whenDisconnectedBeyond5min_returnsOffline() {
        let staleDate = Date().addingTimeInterval(-600) // 10 min
        let presence = AppUserPresence(isOnline: false, lastActiveAt: staleDate)
        XCTAssertEqual(presence.state, PresenceState.offline)
    }

    func test_state_whenOnlineButStaleOver5min_returnsOffline() {
        // Garde anti-stale : isOnline=true avec lastActiveAt > 5min est une
        // donnee incoherente -> la decroissance temporelle prime.
        let veryStaleDate = Date().addingTimeInterval(-3600) // 60 min
        let presence = AppUserPresence(isOnline: true, lastActiveAt: veryStaleDate)
        XCTAssertEqual(presence.state, PresenceState.offline)
    }

    // MARK: - presenceState(for:)

    func test_presenceState_unknownUserId_returnsOffline() {
        let state = sut.presenceState(for: "unknown-user-id")
        XCTAssertEqual(state, PresenceState.offline)
    }

    func test_presenceState_knownOnlineUser_returnsOnline() {
        sut.presenceMap["user-1"] = AppUserPresence(isOnline: true, lastActiveAt: nil)
        let state = sut.presenceState(for: "user-1")
        XCTAssertEqual(state, PresenceState.online)
    }

    func test_presenceState_knownOfflineUser_returnsOffline() {
        sut.presenceMap["user-1"] = AppUserPresence(isOnline: false, lastActiveAt: nil)
        let state = sut.presenceState(for: "user-1")
        XCTAssertEqual(state, PresenceState.offline)
    }

    func test_presenceState_knownAwayUser_returnsAway() {
        let staleDate = Date().addingTimeInterval(-120)
        sut.presenceMap["user-1"] = AppUserPresence(isOnline: false, lastActiveAt: staleDate)
        let state = sut.presenceState(for: "user-1")
        XCTAssertEqual(state, PresenceState.away)
    }

    // MARK: - noteActivity(userId:) — typing = signal de presence

    func test_noteActivity_unknownUser_becomesOnline() {
        sut.noteActivity(userId: "typer-1")
        XCTAssertEqual(sut.presenceState(for: "typer-1"), PresenceState.online)
    }

    func test_noteActivity_staleUser_bumpsBackToOnline() {
        sut.presenceMap["typer-1"] = AppUserPresence(
            isOnline: false,
            lastActiveAt: Date().addingTimeInterval(-600)
        )
        XCTAssertEqual(sut.presenceState(for: "typer-1"), PresenceState.offline)

        sut.noteActivity(userId: "typer-1")

        XCTAssertEqual(sut.presenceState(for: "typer-1"), PresenceState.online)
    }

    func test_noteActivity_emptyUserId_isIgnored() {
        sut.noteActivity(userId: "")
        XCTAssertTrue(sut.presenceMap.isEmpty)
    }

    /// #11412 — la frappe date l'activité sans prétendre que le serveur voit le
    /// pair connecté : poser `isOnline:true` donnait 5 min de vert puis plus
    /// rien, sans passer par l'orange ni le gris.
    func test_noteActivity_unknownUser_refreshesLastActiveAtWithoutClaimingOnline() throws {
        sut.noteActivity(userId: "typer-1")

        let entry = try XCTUnwrap(sut.presenceMap["typer-1"])
        XCTAssertFalse(entry.isOnline)
        let lastActiveAt = try XCTUnwrap(entry.lastActiveAt)
        XCTAssertLessThan(Date().timeIntervalSince(lastActiveAt), 5)
    }

    func test_noteActivity_thenSilence_decaysGreenOrangeGrey() throws {
        sut.noteActivity(userId: "typer-1")
        let entry = try XCTUnwrap(sut.presenceMap["typer-1"])
        let now = Date()

        XCTAssertEqual(entry.state(now: now.addingTimeInterval(30)), .online)
        XCTAssertEqual(entry.state(now: now.addingTimeInterval(120)), .away)
        XCTAssertEqual(entry.state(now: now.addingTimeInterval(240)), .idle)
        XCTAssertEqual(entry.state(now: now.addingTimeInterval(400)), .offline)
    }

    func test_noteActivity_userTheServerSaysOnline_keepsIsOnline() throws {
        sut.presenceMap["typer-1"] = AppUserPresence(isOnline: true, lastActiveAt: nil)

        sut.noteActivity(userId: "typer-1")

        let entry = try XCTUnwrap(sut.presenceMap["typer-1"])
        XCTAssertTrue(entry.isOnline)
        XCTAssertNotNil(entry.lastActiveAt)
    }

    func test_noteActivity_currentUser_neverWritesTheMap() {
        let previous = AuthManager.shared.currentUser
        defer { AuthManager.shared.currentUser = previous }
        AuthManager.shared.currentUser = MeeshyUser(id: "me-id", username: "me", displayName: "Moi")

        sut.noteActivity(userId: "me-id")

        XCTAssertNil(sut.presenceMap["me-id"])
    }

    // MARK: - Sa propre pastille ne se peint jamais (décision porteur 2026-10-21, #11412)

    func test_knownPresenceState_currentUserInTheMap_isOfflineSoNoDot() {
        let previous = AuthManager.shared.currentUser
        defer { AuthManager.shared.currentUser = previous }
        AuthManager.shared.currentUser = MeeshyUser(id: "me-id", username: "me", displayName: "Moi")
        sut.presenceMap["me-id"] = AppUserPresence(isOnline: true, lastActiveAt: Date())

        XCTAssertEqual(sut.knownPresenceState(for: "me-id"), .offline)
        XCTAssertEqual(sut.presenceState(for: "me-id"), .offline)
    }

    func test_resolvedState_currentUserServedOnlineByREST_isOffline() {
        let previous = AuthManager.shared.currentUser
        defer { AuthManager.shared.currentUser = previous }
        AuthManager.shared.currentUser = MeeshyUser(id: "me-id", username: "me", displayName: "Moi")

        XCTAssertEqual(sut.resolvedState(userId: "me-id", isOnline: true, lastActiveAt: Date()), .offline)
        XCTAssertEqual(sut.presenceState(for: "me-id", served: AppUserPresence(isOnline: true, lastActiveAt: Date())), .offline)
    }

    func test_resolvedState_otherUserServedOnline_keepsTheDot() {
        let previous = AuthManager.shared.currentUser
        defer { AuthManager.shared.currentUser = previous }
        AuthManager.shared.currentUser = MeeshyUser(id: "me-id", username: "me", displayName: "Moi")

        XCTAssertEqual(sut.resolvedState(userId: "friend-9", isOnline: true, lastActiveAt: Date()), .online)
    }

    func test_settingsAvatar_neverHardcodesItsOwnPresence() throws {
        let source = AppSourceGuard.stripComments(try AppSourceGuard.unit("Meeshy/Features/Main/Views/SettingsView.swift"))
        XCTAssertFalse(source.contains("presenceState: .online"), "les Réglages ne peignent pas la pastille du compte connecté")
    }

    // MARK: - noteSocketDisconnected() — la coupure éteint sans figer le vert (#11412)

    func test_noteSocketDisconnected_onlineWithoutLastActiveAt_isNoLongerGreen() {
        sut.presenceMap["friend-1"] = AppUserPresence(isOnline: true, lastActiveAt: nil)

        sut.noteSocketDisconnected()

        XCTAssertEqual(sut.presenceMap["friend-1"]?.isOnline, false)
        XCTAssertEqual(sut.presenceState(for: "friend-1"), .offline)
    }

    func test_noteSocketDisconnected_keepsLastActiveAt_soTheEntryDecays() throws {
        let lastActiveAt = Date().addingTimeInterval(-120)
        sut.presenceMap["friend-1"] = AppUserPresence(isOnline: true, lastActiveAt: lastActiveAt)

        sut.noteSocketDisconnected()

        let entry = try XCTUnwrap(sut.presenceMap["friend-1"])
        XCTAssertFalse(entry.isOnline)
        XCTAssertEqual(entry.lastActiveAt, lastActiveAt)
        XCTAssertEqual(sut.presenceState(for: "friend-1"), .away)
    }

    func test_noteSocketDisconnected_keepsEveryKnownEntry() {
        sut.presenceMap["friend-1"] = AppUserPresence(isOnline: true, lastActiveAt: Date())
        sut.presenceMap["friend-2"] = AppUserPresence(isOnline: false, lastActiveAt: Date().addingTimeInterval(-200))

        sut.noteSocketDisconnected()

        XCTAssertEqual(Set(sut.presenceMap.keys), ["friend-1", "friend-2"])
        XCTAssertEqual(sut.presenceState(for: "friend-1"), .online)
        XCTAssertEqual(sut.presenceState(for: "friend-2"), .idle)
    }

    func test_ingestSnapshot_afterDisconnect_replacesTheDimmedEntry() {
        sut.presenceMap["friend-1"] = AppUserPresence(isOnline: true, lastActiveAt: nil)
        sut.noteSocketDisconnected()

        sut.ingestSnapshot([UserStatusEvent(userId: "friend-1", username: "friend", isOnline: true, lastActiveAt: nil)])

        XCTAssertEqual(sut.presenceState(for: "friend-1"), .online)
    }

    func test_disconnect_isWiredToNoteSocketDisconnected() throws {
        let source = AppSourceGuard.stripComments(try AppSourceGuard.unit("Meeshy/Features/Main/Services/PresenceManager.swift"))
        let wiring = try XCTUnwrap(source.range(of: "self?.noteSocketDisconnected()"), "la coupure du socket doit atteindre noteSocketDisconnected")
        let before = String(source[source.startIndex..<wiring.lowerBound].suffix(400))
        XCTAssertTrue(before.contains("MessageSocketManager.shared.$isConnected"))
        XCTAssertTrue(before.contains(".filter { !$0 }"))
    }

    // MARK: - resolvedState(userId:isOnline:lastActiveAt:)

    func test_resolvedState_knownUser_liveMapWins() {
        sut.presenceMap["user-1"] = AppUserPresence(isOnline: true, lastActiveAt: nil)
        let state = sut.resolvedState(userId: "user-1", isOnline: false, lastActiveAt: nil)
        XCTAssertEqual(state, PresenceState.online)
    }

    func test_resolvedState_unknownUserOnline_returnsOnline() {
        let state = sut.resolvedState(userId: "unknown", isOnline: true, lastActiveAt: nil)
        XCTAssertEqual(state, PresenceState.online)
    }

    func test_resolvedState_unknownUserOnlineWithinGuard_returnsOnline() {
        // isOnline autoritatif : le snapshot REST dit connecte -> vert,
        // tant que lastActiveAt reste sous la garde anti-stale de 5 min.
        let state = sut.resolvedState(userId: "unknown", isOnline: true, lastActiveAt: Date().addingTimeInterval(-240))
        XCTAssertEqual(state, PresenceState.online)
    }

    func test_resolvedState_unknownUserOnlineStale_decaysToOffline() {
        // Au-dela de la garde 5 min, isOnline perime ne force plus le vert.
        let state = sut.resolvedState(userId: "unknown", isOnline: true, lastActiveAt: Date().addingTimeInterval(-600))
        XCTAssertEqual(state, PresenceState.offline)
    }

    func test_resolvedState_unknownUserOfflineActive2minAgo_returnsAway() {
        let state = sut.resolvedState(userId: "unknown", isOnline: false, lastActiveAt: Date().addingTimeInterval(-120))
        XCTAssertEqual(state, PresenceState.away)
    }

    func test_resolvedState_unknownUserOfflineStale_returnsOffline() {
        let state = sut.resolvedState(userId: "unknown", isOnline: false, lastActiveAt: Date().addingTimeInterval(-1860))
        XCTAssertEqual(state, PresenceState.offline)
    }

    func test_resolvedState_nilUserIdNilIsOnline_returnsOffline() {
        let state = sut.resolvedState(userId: nil, isOnline: nil, lastActiveAt: nil)
        XCTAssertEqual(state, PresenceState.offline)
    }

    // MARK: - recalculateStates(now:) — la signature des états publiés (#11412)
    //
    // Le minuteur re-résout TOUTES les entrées et compare au dernier battement
    // publié : un seuil franchi à n'importe quel moment se repeint, et rien ne
    // se repeint quand rien n'a changé. L'ancien test par fenêtres fixes
    // (60–90 s, 180–210 s, 300–330 s) sautait un seuil dès qu'un tick manquait.

    private func settle() async throws {
        try await Task.sleep(nanoseconds: UInt64((PresenceManager.versionBumpDebounce + 0.3) * 1_000_000_000))
    }

    /// Attend le battement que la dernière écriture a programmé : c'est lui qui
    /// pose `publishedStates`. Une attente fixe ne le garantit pas sur un
    /// simulateur chargé — ces tests rougissaient en CI et dans la suite
    /// complète, jamais lancés seuls.
    private func awaitBeat(after version: Int) async throws {
        let deadline = Date().addingTimeInterval(5)
        while sut.refreshSignal.presenceVersion == version, Date() < deadline {
            try await Task.sleep(nanoseconds: 50_000_000)
        }
    }

    func test_recalculateStates_nothingChangedSinceTheLastBeat_doesNotRepaint() async throws {
        let initial = sut.refreshSignal.presenceVersion
        sut.presenceMap["user-1"] = AppUserPresence(isOnline: false, lastActiveAt: Date().addingTimeInterval(-10))
        try await awaitBeat(after: initial)
        let before = sut.refreshSignal.presenceVersion

        XCTAssertFalse(sut.recalculateStates(now: Date()))
        try await settle()

        XCTAssertEqual(sut.refreshSignal.presenceVersion, before)
    }

    func test_recalculateStates_thresholdCrossed_repaintsOnce() async throws {
        let initial = sut.refreshSignal.presenceVersion
        sut.presenceMap["user-1"] = AppUserPresence(isOnline: false, lastActiveAt: Date().addingTimeInterval(-50))
        try await awaitBeat(after: initial)
        let before = sut.refreshSignal.presenceVersion

        XCTAssertTrue(sut.recalculateStates(now: Date().addingTimeInterval(20)))
        try await awaitBeat(after: before)
        try await settle()

        XCTAssertEqual(sut.refreshSignal.presenceVersion, before + 1)
    }

    /// Un tick manqué ne saute plus un seuil : à 250 s, aucune des anciennes
    /// fenêtres ne contenait l'instant, l'état avait pourtant changé deux fois.
    func test_recalculateStates_tickMissedAcrossTwoThresholds_stillRepaints() async throws {
        let initial = sut.refreshSignal.presenceVersion
        sut.presenceMap["user-1"] = AppUserPresence(isOnline: false, lastActiveAt: Date().addingTimeInterval(-50))
        try await awaitBeat(after: initial)

        XCTAssertTrue(sut.recalculateStates(now: Date().addingTimeInterval(200)))
        try await settle()
    }

    func test_resolvedStates_resolvesEveryEntryAtTheGivenInstant() {
        let now = Date()
        let map = [
            "a": AppUserPresence(isOnline: false, lastActiveAt: now.addingTimeInterval(-30)),
            "b": AppUserPresence(isOnline: false, lastActiveAt: now.addingTimeInterval(-120)),
            "c": AppUserPresence(isOnline: false, lastActiveAt: now.addingTimeInterval(-240)),
            "d": AppUserPresence(isOnline: false, lastActiveAt: now.addingTimeInterval(-600)),
        ]

        XCTAssertEqual(
            PresenceManager.resolvedStates(of: map, at: now),
            ["a": .online, "b": .away, "c": .idle, "d": .offline]
        )
    }

    // MARK: - Cadence de recalcul

    func test_recalcInterval_repaintsAThresholdWithinFifteenSeconds() {
        XCTAssertEqual(PresenceManager.recalcInterval, 15)
    }

    func test_recalcTimer_runsInCommonModes_soScrollingDoesNotPauseTheDecay() throws {
        let source = AppSourceGuard.stripComments(try AppSourceGuard.unit("Meeshy/Features/Main/Services/PresenceManager.swift"))
        XCTAssertTrue(source.contains("RunLoop.main.add(timer, forMode: .common)"))
        XCTAssertFalse(source.contains("Timer.scheduledTimer("), "un minuteur programmé en mode .default s'arrête pendant le défilement")
    }

    // MARK: - refreshPublisher — le battement remis aux vues du SDK (#11412)

    func test_refreshPublisher_emitsOnABeat_notOnSubscription() async throws {
        var received: [Int] = []
        let cancellable = sut.refreshPublisher.sink { received.append($0) }
        defer { cancellable.cancel() }
        XCTAssertEqual(received, [], "s'abonner n'est pas un battement")

        sut.presenceMap["user-1"] = AppUserPresence(isOnline: true, lastActiveAt: nil)
        try await settle()

        XCTAssertEqual(received, [sut.refreshSignal.presenceVersion])
    }

    // MARK: - refreshSignal.presenceVersion (debounced re-render signal, audit 2026-07-20)
    //
    // `ConversationListView` observes `refreshSignal` INSTEAD of `PresenceManager`
    // itself (see PresenceManager.swift header comment on `PresenceRefreshSignal`) —
    // these tests exercise the REAL debounced wiring end-to-end, not just an
    // isolated `bump()` call, since that's the whole point of the fix.

    func test_presenceMapMutation_eventuallyBumpsRefreshSignal() async throws {
        let before = sut.refreshSignal.presenceVersion

        sut.presenceMap["user-1"] = AppUserPresence(isOnline: true, lastActiveAt: nil)

        try await Task.sleep(nanoseconds: UInt64((PresenceManager.versionBumpDebounce + 0.3) * 1_000_000_000))

        XCTAssertGreaterThan(
            sut.refreshSignal.presenceVersion, before,
            "A presenceMap mutation must eventually bump the debounced refresh signal"
        )
    }

    func test_rapidPresenceMapMutations_coalesceIntoOneVersionBump() async throws {
        let before = sut.refreshSignal.presenceVersion

        // Three mutations fired back-to-back (no `await` between them) — the
        // debounce must cancel+reschedule each time, netting out to exactly
        // ONE bump instead of three (burst behavior during e.g. reconnect).
        sut.presenceMap["user-1"] = AppUserPresence(isOnline: true, lastActiveAt: nil)
        sut.presenceMap["user-2"] = AppUserPresence(isOnline: true, lastActiveAt: nil)
        sut.presenceMap["user-3"] = AppUserPresence(isOnline: true, lastActiveAt: nil)

        try await Task.sleep(nanoseconds: UInt64((PresenceManager.versionBumpDebounce + 0.3) * 1_000_000_000))

        XCTAssertEqual(
            sut.refreshSignal.presenceVersion, before + 1,
            "3 mutations within the debounce window must coalesce into exactly ONE bump"
        )
    }

    func test_noteActivity_alsoEventuallyBumpsRefreshSignal() async throws {
        // `noteActivity` (typing:start) mutates `presenceMap` via the SAME
        // didSet as every other writer — confirms the signal isn't wired to
        // only one specific mutator.
        let before = sut.refreshSignal.presenceVersion

        sut.noteActivity(userId: "typer-1")

        try await Task.sleep(nanoseconds: UInt64((PresenceManager.versionBumpDebounce + 0.3) * 1_000_000_000))

        XCTAssertGreaterThan(sut.refreshSignal.presenceVersion, before)
    }

    // MARK: - seed(from:currentUserId:)

    func test_seed_populatesPresenceMapFromConversations() {
        let conversations = [makeConversation(members: [
            makeMemberJSON(userId: "me", isOnline: true, lastActiveAt: nil),
            makeMemberJSON(userId: "other-1", isOnline: true, lastActiveAt: nil),
            makeMemberJSON(userId: "other-2", isOnline: false, lastActiveAt: nil)
        ])]

        sut.seed(from: conversations, currentUserId: "me")

        XCTAssertEqual(sut.presenceMap.count, 2)
        XCTAssertEqual(sut.presenceState(for: "other-1"), PresenceState.online)
        XCTAssertEqual(sut.presenceState(for: "other-2"), PresenceState.offline)
    }

    func test_seed_excludesCurrentUser() {
        let conversations = [makeConversation(members: [
            makeMemberJSON(userId: "me", isOnline: true, lastActiveAt: nil),
            makeMemberJSON(userId: "other-1", isOnline: true, lastActiveAt: nil)
        ])]

        sut.seed(from: conversations, currentUserId: "me")

        XCTAssertNil(sut.presenceMap["me"])
        XCTAssertEqual(sut.presenceMap.count, 1)
    }

    func test_seed_multipleConversations_aggregatesAllMembers() {
        let conversations = [
            makeConversation(members: [
                makeMemberJSON(userId: "me", isOnline: true, lastActiveAt: nil),
                makeMemberJSON(userId: "user-A", isOnline: true, lastActiveAt: nil)
            ]),
            makeConversation(members: [
                makeMemberJSON(userId: "me", isOnline: true, lastActiveAt: nil),
                makeMemberJSON(userId: "user-B", isOnline: false, lastActiveAt: nil)
            ])
        ]

        sut.seed(from: conversations, currentUserId: "me")

        XCTAssertEqual(sut.presenceMap.count, 2)
        XCTAssertEqual(sut.presenceState(for: "user-A"), PresenceState.online)
        XCTAssertEqual(sut.presenceState(for: "user-B"), PresenceState.offline)
    }

    func test_seed_skipsConversationsWithNoMembers() {
        let conversations = [makeConversation(members: nil)]

        sut.seed(from: conversations, currentUserId: "me")

        XCTAssertTrue(sut.presenceMap.isEmpty)
    }

    func test_seed_skipsMembersWithNoUser() {
        let now = ISO8601DateFormatter().string(from: Date())
        let conversations = [makeConversation(members: [
            [
                "id": "participant-other-1",
                "conversationId": "conv-test",
                "type": "user",
                "userId": "other-1",
                "displayName": "other1",
                "role": "USER",
                "language": "en",
                "permissions": [
                    "canSendMessages": true, "canSendFiles": true, "canSendImages": true,
                    "canSendVideos": true, "canSendAudios": true, "canSendLocations": true, "canSendLinks": true
                ],
                "isActive": true,
                "joinedAt": now
            ] as [String: Any]
        ])]

        sut.seed(from: conversations, currentUserId: "me")

        XCTAssertEqual(sut.presenceMap.count, 1, "Participant with userId is added even without user object")
        XCTAssertEqual(sut.presenceState(for: "other-1"), PresenceState.offline)
    }

    func test_seed_skipsMembersWithNilIsOnline() {
        let now = ISO8601DateFormatter().string(from: Date())
        let conversations = [makeConversation(members: [
            makeMemberJSON(userId: "me", isOnline: true, lastActiveAt: nil),
            [
                "id": "participant-other-1",
                "conversationId": "conv-test",
                "type": "user",
                "userId": "other-1",
                "displayName": "other1",
                "role": "USER",
                "language": "en",
                "permissions": [
                    "canSendMessages": true, "canSendFiles": true, "canSendImages": true,
                    "canSendVideos": true, "canSendAudios": true, "canSendLocations": true, "canSendLinks": true
                ],
                "isActive": true,
                "joinedAt": now,
                "user": ["id": "other-1", "username": "other1"]
            ] as [String: Any]
        ])]

        sut.seed(from: conversations, currentUserId: "me")

        XCTAssertEqual(sut.presenceState(for: "other-1"), PresenceState.offline,
                       "Participant with nil isOnline defaults to offline")
    }

    func test_seed_preservesLastActiveAt_awayState() {
        // isOnline=false ici (pas true) : depuis la garde anti-stale (isOnline
        // autoritatif jusqu'a 5min), un membre connecte resterait "online"
        // meme avec un lastActiveAt vieux de 2min — cf.
        // test_state_whenConnectedWithStaleTimestamp_staysOnline. La decroissance
        // vers "away" ne s'observe que pour un membre deconnecte.
        let activeDate = Date().addingTimeInterval(-120)
        let conversations = [makeConversation(members: [
            makeMemberJSON(userId: "me", isOnline: true, lastActiveAt: nil),
            makeMemberJSON(userId: "other-1", isOnline: false, lastActiveAt: activeDate)
        ])]

        sut.seed(from: conversations, currentUserId: "me")

        XCTAssertEqual(sut.presenceState(for: "other-1"), PresenceState.away)
    }

    func test_seed_emptyConversations_doesNotPopulate() {
        sut.seed(from: [], currentUserId: "me")
        XCTAssertTrue(sut.presenceMap.isEmpty)
    }

    // MARK: - presenceMap clearing

    func test_clearingPresenceMap_allUsersReturnOffline() {
        sut.presenceMap["user-1"] = AppUserPresence(isOnline: true, lastActiveAt: nil)
        sut.presenceMap["user-2"] = AppUserPresence(isOnline: true, lastActiveAt: nil)

        sut.presenceMap.removeAll()

        XCTAssertEqual(sut.presenceState(for: "user-1"), PresenceState.offline)
        XCTAssertEqual(sut.presenceState(for: "user-2"), PresenceState.offline)
    }

    // MARK: - Factory Helpers

    private func makeConversation(members: [[String: Any]]?) -> APIConversation {
        let now = ISO8601DateFormatter().string(from: Date())
        var json: [String: Any] = [
            "id": UUID().uuidString,
            "type": "direct",
            "createdAt": now
        ]
        if let members {
            json["participants"] = members
        }
        let data = try! JSONSerialization.data(withJSONObject: json)
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .custom { decoder in
            let container = try decoder.singleValueContainer()
            let dateStr = try container.decode(String.self)
            let iso = ISO8601DateFormatter()
            iso.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
            if let date = iso.date(from: dateStr) { return date }
            iso.formatOptions = [.withInternetDateTime]
            if let date = iso.date(from: dateStr) { return date }
            throw DecodingError.dataCorruptedError(in: container, debugDescription: "Expected date string to be ISO8601-formatted.")
        }
        return try! decoder.decode(APIConversation.self, from: data)
    }

    private func makeMemberJSON(userId: String, isOnline: Bool, lastActiveAt: Date?) -> [String: Any] {
        let now = ISO8601DateFormatter().string(from: Date())
        var participantDict: [String: Any] = [
            "id": "participant-\(userId)",
            "conversationId": "conv-test",
            "type": "user",
            "userId": userId,
            "displayName": "user_\(userId)",
            "role": "USER",
            "language": "en",
            "permissions": [
                "canSendMessages": true,
                "canSendFiles": true,
                "canSendImages": true,
                "canSendVideos": true,
                "canSendAudios": true,
                "canSendLocations": true,
                "canSendLinks": true
            ],
            "isActive": true,
            "isOnline": isOnline,
            "joinedAt": now
        ]
        var userDict: [String: Any] = [
            "id": userId,
            "username": "user_\(userId)",
            "isOnline": isOnline
        ]
        if let lastActiveAt {
            let formatter = ISO8601DateFormatter()
            formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
            let dateStr = formatter.string(from: lastActiveAt)
            userDict["lastActiveAt"] = dateStr
            participantDict["lastActiveAt"] = dateStr
        }
        participantDict["user"] = userDict
        return participantDict
    }
}
