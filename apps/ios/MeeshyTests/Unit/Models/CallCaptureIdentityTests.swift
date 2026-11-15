import XCTest
@testable import Meeshy

/// QUI EST QUI DANS UNE CAPTURE (#8743) — une personne par case, moi marqué avec mon @pseudo,
/// l'ordre de l'écran, et une caméra coupée qui garde sa case.
@MainActor
final class CallCaptureIdentityTests: XCTestCase {

    private func makeTile(id: String, name: String, isLocal: Bool = false, showsVideo: Bool = true) -> GroupCallStageTile {
        GroupCallStageTile(
            id: id,
            colorKey: id,
            displayName: name,
            avatarURL: nil,
            isLocal: isLocal,
            isSpeaking: false,
            isMicMuted: false,
            showsVideo: showsVideo,
            isScreenSharing: false,
            isReconnecting: false
        )
    }

    private func makeMe(showsVideo: Bool = true) -> CallCaptureSubject {
        CallCaptureIdentity.me(name: "Vous", username: "awa", isMirrored: true, showsVideo: showsVideo)
    }

    // MARK: - Groupe

    func test_group_marksMe_andGivesMyHandleOnlyToMe() {
        let tiles = [
            makeTile(id: GroupCallStage.localTileId, name: "Vous", isLocal: true),
            makeTile(id: "u-karim", name: "Karim"),
            makeTile(id: "u-lina", name: "Lina")
        ]

        let subjects = CallCaptureIdentity.group(tiles: tiles, myName: "Awa Diallo", myUsername: "awa", isMyCaptureMirrored: true)

        XCTAssertEqual(subjects.map(\.id), [GroupCallStage.localTileId, "u-karim", "u-lina"])
        XCTAssertEqual(subjects.map(\.name), ["Awa Diallo", "Karim", "Lina"])
        XCTAssertEqual(subjects.map(\.isSelf), [true, false, false])
        XCTAssertEqual(subjects.map(\.handle), ["awa", nil, nil])
        XCTAssertEqual(subjects.map(\.isMirrored), [true, false, false])
    }

    func test_group_cameraOff_keepsItsSlot() {
        let tiles = [
            makeTile(id: GroupCallStage.localTileId, name: "Vous", isLocal: true),
            makeTile(id: "u-karim", name: "Karim", showsVideo: false)
        ]

        let subjects = CallCaptureIdentity.group(tiles: tiles, myName: "Vous", myUsername: nil, isMyCaptureMirrored: false)

        XCTAssertEqual(subjects.count, 2)
        XCTAssertEqual(subjects.map(\.showsVideo), [true, false])
        XCTAssertNil(subjects[0].handle)
    }

    // MARK: - Mon nom

    func test_myName_displayNameKnown_isWhatOthersRead() {
        XCTAssertEqual(CallCaptureIdentity.myName(displayName: " Awa Diallo ", username: "awa", fallback: "Vous"), "Awa Diallo")
    }

    func test_myName_blankDisplayName_fallsBackToUsername() {
        XCTAssertEqual(CallCaptureIdentity.myName(displayName: "  ", username: "awa", fallback: "Vous"), "awa")
    }

    func test_myName_nothingKnown_keepsTheLocalLabel() {
        XCTAssertEqual(CallCaptureIdentity.myName(displayName: nil, username: nil, fallback: "Vous"), "Vous")
    }

    // MARK: - Duo

    func test_me_isSelf_withTheLocalIdAndMyHandle() {
        let me = makeMe()
        XCTAssertEqual(me.id, CallCaptureIdentity.localDuoId)
        XCTAssertTrue(me.isSelf)
        XCTAssertEqual(me.handle, "awa")
        XCTAssertTrue(me.isMirrored)
    }

    func test_duo_remoteFirst_unlessStreamsAreSwapped() {
        let remoteFirst = CallCaptureIdentity.duo(me: makeMe(), remoteName: "Karim", remoteUsername: "karim_k", remoteShowsVideo: true, meFirst: false)
        let meFirst = CallCaptureIdentity.duo(me: makeMe(), remoteName: "Karim", remoteUsername: "karim_k", remoteShowsVideo: true, meFirst: true)

        XCTAssertEqual(remoteFirst.map(\.id), [CallCaptureIdentity.remoteDuoId, CallCaptureIdentity.localDuoId])
        XCTAssertEqual(meFirst.map(\.id), [CallCaptureIdentity.localDuoId, CallCaptureIdentity.remoteDuoId])
        XCTAssertEqual(remoteFirst[0].handle, "karim_k")
        XCTAssertFalse(remoteFirst[0].isSelf)
        XCTAssertFalse(remoteFirst[0].isMirrored)
    }

    func test_duo_remoteCameraOff_keepsItsSlot() {
        let subjects = CallCaptureIdentity.duo(me: makeMe(showsVideo: false), remoteName: "Karim", remoteUsername: nil, remoteShowsVideo: false, meFirst: false)
        XCTAssertEqual(subjects.count, 2)
        XCTAssertEqual(subjects.map(\.showsVideo), [false, false])
    }

    // MARK: - Pseudo

    func test_handle_blankOrMissing_isNil_otherwiseTrimmed() {
        XCTAssertNil(CallCaptureIdentity.handle(nil))
        XCTAssertNil(CallCaptureIdentity.handle("   "))
        XCTAssertEqual(CallCaptureIdentity.handle(" awa "), "awa")
    }

    func test_subject_defaultsToAnonymousOther() {
        let subject = CallCaptureSubject(id: "x", name: "X", isMirrored: false, showsVideo: true)
        XCTAssertNil(subject.handle)
        XCTAssertFalse(subject.isSelf)
    }
}
