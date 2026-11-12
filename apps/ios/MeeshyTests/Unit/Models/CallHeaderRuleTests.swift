import MeeshySDK
import XCTest
@testable import Meeshy

/// #17329 — l'en-tête de l'appel porte, de gauche à droite, Réduire · Image dans
/// l'image (si l'appel y est éligible, ou pour en sortir) · Conversation (si elle
/// est connue). #17341 — sa capsule de droite : en vidéo « nom donné · durée », en
/// audio le réseau dégradé seul, en groupe « nom du groupe · nombre · durée ».
@MainActor
final class CallHeaderRuleTests: XCTestCase {

    private func context(canActivateSystemPiP: Bool = false, isSystemPiPActive: Bool = false, hasConversation: Bool = false) -> CallHeaderContext {
        CallHeaderContext(canActivateSystemPiP: canActivateSystemPiP, isSystemPiPActive: isSystemPiPActive, hasConversation: hasConversation)
    }

    // MARK: - Les boutons

    func test_actions_minimalCall_offersOnlyMinimize() {
        XCTAssertEqual(CallHeaderRule.actions(context()), [.minimize])
    }

    func test_actions_eligibleAndKnownConversation_ordersMinimizePipConversation() {
        let actions = CallHeaderRule.actions(context(canActivateSystemPiP: true, hasConversation: true))
        XCTAssertEqual(actions, [.minimize, .pictureInPicture, .conversation])
    }

    func test_actions_notEligible_hidesPictureInPicture() {
        XCTAssertEqual(CallHeaderRule.actions(context(hasConversation: true)), [.minimize, .conversation])
    }

    func test_actions_pipAlreadyActive_keepsTheButtonToLeaveIt() {
        XCTAssertEqual(CallHeaderRule.actions(context(isSystemPiPActive: true)), [.minimize, .pictureInPicture])
    }

    func test_actions_unknownConversation_hidesConversation() {
        XCTAssertFalse(CallHeaderRule.actions(context(canActivateSystemPiP: true)).contains(.conversation))
    }

    // MARK: - La capsule

    private func input(
        layout: CallHeaderCapsuleLayout,
        isEstablished: Bool = true,
        isNetworkDegraded: Bool = false,
        givenName: String? = nil,
        displayName: String? = nil,
        groupName: String? = nil,
        participantCount: Int = 0,
        receivesScreen: Bool = false
    ) -> CallHeaderCapsuleInput {
        CallHeaderCapsuleInput(
            layout: layout,
            isEstablished: isEstablished,
            isNetworkDegraded: isNetworkDegraded,
            givenName: givenName,
            displayName: displayName,
            groupName: groupName,
            participantCount: participantCount,
            receivesScreen: receivesScreen
        )
    }

    func test_capsule_videoDuo_givenNameWinsOverTheDisplayName() {
        let capsule = CallHeaderCapsuleRule.resolve(input(layout: .video, givenName: "Awa", displayName: "Awa Diallo"))
        XCTAssertEqual(capsule, CallHeaderCapsule(title: "Awa", participantCount: nil, showsDuration: true, showsNetwork: false))
    }

    func test_capsule_videoDuo_withoutGivenName_fallsBackToTheDisplayName() {
        let capsule = CallHeaderCapsuleRule.resolve(input(layout: .video, givenName: "  ", displayName: "Awa Diallo"))
        XCTAssertEqual(capsule?.title, "Awa Diallo")
    }

    func test_capsule_videoDuo_networkShowsOnlyWhenDegraded() {
        XCTAssertEqual(CallHeaderCapsuleRule.resolve(input(layout: .video, givenName: "Awa"))?.showsNetwork, false)
        XCTAssertEqual(CallHeaderCapsuleRule.resolve(input(layout: .video, isNetworkDegraded: true, givenName: "Awa"))?.showsNetwork, true)
    }

    func test_capsule_audio_healthyLink_hasNoCapsule() {
        XCTAssertNil(CallHeaderCapsuleRule.resolve(input(layout: .audio, givenName: "Awa")))
    }

    func test_capsule_audio_degradedLink_carriesTheNetworkAlone() {
        let capsule = CallHeaderCapsuleRule.resolve(input(layout: .audio, isNetworkDegraded: true, givenName: "Awa"))
        XCTAssertEqual(capsule, CallHeaderCapsule(title: nil, participantCount: nil, showsDuration: false, showsNetwork: true))
    }

    func test_capsule_group_carriesNameCountAndDuration() {
        let capsule = CallHeaderCapsuleRule.resolve(input(layout: .group, groupName: "Les Copains", participantCount: 5))
        XCTAssertEqual(capsule, CallHeaderCapsule(title: "Les Copains", participantCount: 5, showsDuration: true, showsNetwork: false))
    }

    func test_capsule_group_withoutName_keepsCountAndDuration() {
        let capsule = CallHeaderCapsuleRule.resolve(input(layout: .group, groupName: nil, participantCount: 3))
        XCTAssertNil(capsule?.title)
        XCTAssertEqual(capsule?.participantCount, 3)
    }

    func test_capsule_beforeTheCallIsEstablished_neverShows() {
        for layout in [CallHeaderCapsuleLayout.audio, .video, .group] {
            XCTAssertNil(CallHeaderCapsuleRule.resolve(input(layout: layout, isEstablished: false, isNetworkDegraded: true, givenName: "Awa", groupName: "G", participantCount: 4)))
        }
    }

    // MARK: - P15.4 — l'écran reçu en duo s'annonce dans la capsule

    func test_capsule_videoDuo_receivedScreen_namesTheScreenInsteadOfNameAndDuration() {
        let capsule = CallHeaderCapsuleRule.resolve(input(layout: .video, givenName: "Karim", displayName: "Karim Diallo", receivesScreen: true))
        XCTAssertEqual(capsule, CallHeaderCapsule(title: "Karim", participantCount: nil, showsDuration: false, showsNetwork: false, isReceivedScreen: true))
    }

    func test_capsule_videoDuo_receivedScreen_withoutGivenName_fallsBackToTheDisplayName() {
        XCTAssertEqual(CallHeaderCapsuleRule.resolve(input(layout: .video, givenName: " ", displayName: "Karim Diallo", receivesScreen: true))?.title, "Karim Diallo")
    }

    func test_capsule_videoDuo_receivedScreen_keepsTheNetworkOnlyWhenDegraded() {
        XCTAssertEqual(CallHeaderCapsuleRule.resolve(input(layout: .video, givenName: "Karim", receivesScreen: true))?.showsNetwork, false)
        XCTAssertEqual(CallHeaderCapsuleRule.resolve(input(layout: .video, isNetworkDegraded: true, givenName: "Karim", receivesScreen: true))?.showsNetwork, true)
    }

    func test_capsule_noReceivedScreen_isNeverMarkedAsScreen() {
        XCTAssertEqual(CallHeaderCapsuleRule.resolve(input(layout: .video, givenName: "Karim"))?.isReceivedScreen, false)
    }

    func test_capsule_groupAndAudio_ignoreTheReceivedScreen() {
        XCTAssertEqual(
            CallHeaderCapsuleRule.resolve(input(layout: .group, groupName: "Équipe", participantCount: 4, receivesScreen: true)),
            CallHeaderCapsuleRule.resolve(input(layout: .group, groupName: "Équipe", participantCount: 4))
        )
        XCTAssertNil(CallHeaderCapsuleRule.resolve(input(layout: .audio, givenName: "Karim", receivesScreen: true)))
    }

    func test_capsule_receivedScreen_beforeTheCallIsEstablished_neverShows() {
        XCTAssertNil(CallHeaderCapsuleRule.resolve(input(layout: .video, isEstablished: false, givenName: "Karim", receivesScreen: true)))
    }

    func test_capsule_spokenTitle_namesTheScreenOnlyWhenItIsTheReceivedScreen() {
        let screen = CallHeaderCapsule(title: "Karim", participantCount: nil, showsDuration: false, showsNetwork: false, isReceivedScreen: true)
        XCTAssertEqual(screen.spokenTitle, CallScreenShareCopy.screenOf(name: "Karim"))
        let video = CallHeaderCapsule(title: "Karim", participantCount: nil, showsDuration: true, showsNetwork: false)
        XCTAssertEqual(video.spokenTitle, "Karim")
    }

    // MARK: - Les noms lus dans la conversation en cache

    private func conversation(type: MeeshyConversation.ConversationType, title: String?, customName: String? = nil) -> MeeshyConversation {
        var conversation = MeeshyConversation(
            id: "conv-1",
            identifier: "ident-conv-1",
            type: type,
            title: title,
            lastMessageAt: Date(timeIntervalSince1970: 1_700_000_000)
        )
        conversation.userState.customName = customName
        return conversation
    }

    func test_names_direct_givenNameIsTheCustomName() {
        let names = CallHeaderNames.resolve(conversation: conversation(type: .direct, title: "Awa Diallo", customName: " Maman "), knownGroupTitle: nil)
        XCTAssertEqual(names.givenName, "Maman")
        XCTAssertNil(names.groupName)
    }

    func test_names_direct_withoutCustomName_hasNoGivenName() {
        XCTAssertNil(CallHeaderNames.resolve(conversation: conversation(type: .direct, title: "Awa Diallo"), knownGroupTitle: nil).givenName)
    }

    func test_names_group_customNameWinsOverTitle_thenTheMeshTitle() {
        XCTAssertEqual(CallHeaderNames.resolve(conversation: conversation(type: .group, title: "Titre", customName: "Ma bande"), knownGroupTitle: "Maillage").groupName, "Ma bande")
        XCTAssertEqual(CallHeaderNames.resolve(conversation: conversation(type: .group, title: "Titre"), knownGroupTitle: "Maillage").groupName, "Titre")
        XCTAssertEqual(CallHeaderNames.resolve(conversation: nil, knownGroupTitle: "Maillage").groupName, "Maillage")
    }

    func test_names_noConversationAndNoTitle_isEmpty() {
        XCTAssertEqual(CallHeaderNames.resolve(conversation: nil, knownGroupTitle: nil), CallHeaderNames(givenName: nil, groupName: nil))
    }
}
