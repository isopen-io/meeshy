import XCTest
@testable import Meeshy
import MeeshySDK

/// Gardes de source du bouton d'appel de l'en-tête (`ConversationHeaderCallButton`).
/// Il ne lit plus `CallManager.shared` : il reçoit un `CallHeaderSnapshot`
/// `Equatable` (voir `CallHeaderSnapshotTests` pour son comportement), et ses
/// actions réveillent la pile par `CallManagerHost.shared.require()`.
@MainActor
final class HeaderCallButtonsViewTests: XCTestCase {

    private func buttonSource() throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Main/Views/ConversationLayers/ConversationHeaderCallButton.swift")
        return AppSourceGuard.stripComments(try String(contentsOf: url, encoding: .utf8))
    }

    func test_button_neverObservesNorReadsTheCallManagerSingleton() throws {
        let source = try buttonSource()
        XCTAssertFalse(source.contains("@ObservedObject"),
                       "le bouton ne s'abonne à aucun objet : il reçoit un instantané Equatable")
        XCTAssertFalse(source.contains("CallManager.shared"),
                       "`CallManager.shared` construit CallKit, WebRTC et PiP : l'en-tête passe par l'hôte")
    }

    func test_button_readsTheSnapshot_andTheDurationWithoutSubscription() throws {
        let source = try buttonSource()
        XCTAssertTrue(source.contains("CallHeaderSnapshot"))
        XCTAssertTrue(source.contains("CallDurationClock"),
                      "la durée se lit sous TimelineView, sans observation")
        XCTAssertTrue(source.contains("CallHeaderPresentation.resolve"))
    }

    func test_actions_wakeTheCallStackThroughTheHost() throws {
        let source = try buttonSource()
        XCTAssertTrue(source.contains("CallManagerHost.shared.require().rejoinActiveCall("),
                      "rejoindre doit appeler CallManager.rejoinActiveCall : un simple displayMode ne ferait rien")
        XCTAssertTrue(source.contains("CallManagerHost.shared.require().displayMode = .fullScreen"))
        XCTAssertTrue(source.contains("CallManagerHost.shared.require().requestPermissionsThenStartCall("))
    }

    func test_rejoinPill_clearsWhenCallEndedArrivesForThatCall() throws {
        let source = try buttonSource()
        guard let range = source.range(of: ".onReceive(MessageSocketManager.shared.callEnded") else {
            XCTFail("le bouton doit invalider la pastille « Rejoindre » à `call:ended`"); return
        }
        let end = source.index(range.lowerBound, offsetBy: 400, limitedBy: source.endIndex) ?? source.endIndex
        let body = String(source[range.lowerBound..<end])
        XCTAssertTrue(body.contains(".receive(on: DispatchQueue.main)"),
                      "callEnded émet depuis la queue du socket : hop main avant de toucher au @State")
        XCTAssertTrue(body.contains("reconciledActiveCall?.id == event.callId"),
                      "l'invalidation se joue par callId : un appel qui finit AILLEURS n'efface pas cette pastille")
        XCTAssertTrue(body.contains("reconciledActiveCall = nil"))
    }

    func test_reconcile_skipsTheNetwork_whenTheLocalCallIsActive_andUsesTheSDKService() throws {
        let source = try buttonSource()
        guard let range = source.range(of: "private func reconcileActiveCall() async {") else {
            XCTFail("reconcileActiveCall introuvable"); return
        }
        let end = source.index(range.lowerBound, offsetBy: 500, limitedBy: source.endIndex) ?? source.endIndex
        let body = String(source[range.lowerBound..<end])
        XCTAssertTrue(body.contains("guard CallHeaderPresentation.shouldReconcile(snapshot: snapshot) else { return }"))
        XCTAssertTrue(body.contains("ActiveCallService.shared.activeCall(conversationId: conversationId)"),
                      "le REST appartient au SDK ; l'app décide seulement QUAND l'appeler")
    }

    func test_reconcile_runsOnConversationChange_notOnEveryRender() throws {
        let source = try buttonSource()
        XCTAssertTrue(
            source.contains(".task(id: HeaderCallReconcileKey(conversationId: conversationId, isLocalCallActive: snapshot.isActive))")
                && source.contains("await reconcileActiveCall()"),
            "la clé de tâche change à chaque changement de conversation et au début / à la fin de l'appel local (#9111), jamais à un tick d'état"
        )
    }

    func test_callGlyph_appliesAdaptiveGlassBeforeMeeshyTapTarget() throws {
        let body = try buttonSource()
        guard let start = body.range(of: "private func callGlyph("),
              let glassRange = body.range(of: ".adaptiveGlass(in: Circle()", range: start.upperBound..<body.endIndex),
              let tapTargetRange = body.range(of: ".meeshyTapTarget()", range: glassRange.upperBound..<body.endIndex) else {
            XCTFail("callGlyph doit appliquer .adaptiveGlass PUIS .meeshyTapTarget"); return
        }
        XCTAssertLessThan(glassRange.lowerBound, tapTargetRange.lowerBound,
                          "le verre est dimensionné aux bornes courantes : après le tap target, le cercle passerait de 28 à 44 pt")
    }
}

/// #10207 — l'en-tête ne propose d'appeler que ce que la loi unique
/// (`CallPermission.canStartCall`) autorise, et rien du tout en `global`.
@MainActor
final class HeaderCallEntryTests: XCTestCase {

    private func conversation(
        type: MeeshyConversation.ConversationType,
        role: String? = "member",
        peer: String? = nil
    ) -> Conversation {
        Conversation(id: "conv-1", identifier: "c1", type: type, participantUserId: peer, currentUserRole: role)
    }

    func test_resolve_globalConversation_offersNoCallAtAll_evenToAPlatformAdmin() {
        XCTAssertNil(HeaderCallEntry.resolve(conversation: conversation(type: .global, role: "creator"),
                                             viewerPlatformRole: "BIGBOSS", viewerIsGuest: false))
    }

    func test_resolve_guestViewer_offersNoCall() {
        XCTAssertNil(HeaderCallEntry.resolve(conversation: conversation(type: .direct, peer: "u2"),
                                             viewerPlatformRole: nil, viewerIsGuest: true))
    }

    func test_resolve_publicConversation_ordinaryMember_canOnlyJoin() {
        let entry = HeaderCallEntry.resolve(conversation: conversation(type: .public, role: "member"),
                                            viewerPlatformRole: "USER", viewerIsGuest: false)
        XCTAssertEqual(entry, HeaderCallEntry(callee: .conversation, canStart: false))
    }

    func test_resolve_publicConversation_creatorOrAdminOrPlatformAdmin_startsTheCall() {
        let creator = HeaderCallEntry.resolve(conversation: conversation(type: .public, role: "creator"),
                                              viewerPlatformRole: "USER", viewerIsGuest: false)
        let admin = HeaderCallEntry.resolve(conversation: conversation(type: .public, role: "ADMIN"),
                                            viewerPlatformRole: "USER", viewerIsGuest: false)
        let platformAdmin = HeaderCallEntry.resolve(conversation: conversation(type: .public, role: "member"),
                                                    viewerPlatformRole: "ADMIN", viewerIsGuest: false)
        XCTAssertEqual(creator?.canStart, true)
        XCTAssertEqual(admin?.canStart, true)
        XCTAssertEqual(platformAdmin?.canStart, true)
    }

    func test_resolve_directAndGroup_startAsBefore() {
        XCTAssertEqual(HeaderCallEntry.resolve(conversation: conversation(type: .direct, peer: "u2"),
                                               viewerPlatformRole: "USER", viewerIsGuest: false),
                       HeaderCallEntry(callee: .peer(userId: "u2"), canStart: true))
        XCTAssertEqual(HeaderCallEntry.resolve(conversation: conversation(type: .group),
                                               viewerPlatformRole: "USER", viewerIsGuest: false),
                       HeaderCallEntry(callee: .conversation, canStart: true))
    }

    func test_resolve_directWithoutPeer_offersNoCall() {
        XCTAssertNil(HeaderCallEntry.resolve(conversation: conversation(type: .direct, peer: nil),
                                             viewerPlatformRole: "USER", viewerIsGuest: false))
    }
}
