import XCTest
import MeeshyUI
@_spi(Testing) import MeeshyE2EE
import MeeshySDK
@testable import Meeshy

/// L'épure des réglages (#17584, lot iOS 1/3) : un libellé NOMME, l'explication
/// passe derrière un (i) dont le nom est la QUESTION et dont la note reste lue,
/// et les repères propres à Meeshy restent visibles au repos.
@MainActor
final class SettingsEpureTests: XCTestCase {

    // MARK: - Les (i)

    func test_notes_everyQuestion_isAQuestion_neverAGenericLabel() {
        let questionMarks: Set<Character> = ["?", "؟", "？"]
        for note in SettingsInfoNotes.all {
            XCTAssertTrue(note.question.last.map(questionMarks.contains) ?? false, "le nom accessible du (i) est une question : \(note.question)")
            XCTAssertFalse(note.question.lowercased().contains("plus d'infos"), note.question)
            XCTAssertFalse(note.question.lowercased().contains("more info"), note.question)
        }
    }

    func test_notes_everyNote_saysSomethingTheQuestionDoesNot() {
        for note in SettingsInfoNotes.all {
            XCTAssertFalse(note.text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty, note.question)
            XCTAssertNotEqual(note.text, note.question)
        }
    }

    func test_notes_identifiers_areUnique_soOnlyOneNoteOpensAtATime() {
        XCTAssertEqual(Set(SettingsInfoNotes.all.map(\.id)).count, SettingsInfoNotes.all.count)
    }

    func test_notes_privacyOnes_areTheOnesTheAlertsCarried() {
        let questions = Set(SettingsInfoNotes.all.map(\.question))
        for note in [SettingsInfoNotes.onlineStatus, SettingsInfoNotes.returnAnnouncement, SettingsInfoNotes.readReceipts, SettingsInfoNotes.contactSearch,
                     SettingsInfoNotes.callsFromNonContacts, SettingsInfoNotes.analytics, SettingsInfoNotes.hiddenCallAddress] {
            XCTAssertTrue(questions.contains(note.question))
        }
    }

    func test_toggling_aSecondNote_closesTheFirst() {
        let first = SettingsInfoNotes.onlineStatus
        let second = SettingsInfoNotes.analytics
        let afterFirst = MeeshyInfoNote.toggled(open: nil, tapped: first.id)
        XCTAssertEqual(afterFirst, first.id)
        XCTAssertEqual(MeeshyInfoNote.toggled(open: afterFirst, tapped: second.id), second.id)
        XCTAssertNil(MeeshyInfoNote.toggled(open: afterFirst, tapped: first.id))
    }

    // MARK: - Sessions : un lieu ne répète pas « approximatif » sur chaque ligne

    func test_place_ofASession_doesNotRepeatApproximateOnEveryRow() throws {
        let session: UserSession = JSONStub.decode("""
        { "id": "s1", "createdAt": "2026-10-01T08:00:00.000Z", "isCurrentSession": false, "city": "Lyon", "country": "FR", "ipAddress": "203.0.113.4" }
        """)
        let place = try XCTUnwrap(SessionRowPresentation(session, locale: Locale(identifier: "fr_FR")).place)
        XCTAssertTrue(place.contains("Lyon"), place)
        XCTAssertFalse(place.localizedCaseInsensitiveContains("approx"), "le pied de page le dit une fois : \(place)")
    }

    // MARK: - Appareils chiffrés : date d'inscription, dernier usage, « Cet appareil »

    private func device(trust: EndToEndOwnDevice.Trust, enrolledAt: Date?, lastSeenAt: Date?) -> EndToEndOwnDevice {
        EndToEndOwnDevice(deviceId: 2, registrationId: 20, platform: .ios, label: "iPhone", enrolledAt: enrolledAt, lastSeenAt: lastSeenAt, trust: trust)
    }

    func test_devicePresentation_withALastSeenDate_saysItsLastUse() throws {
        let row = EncryptedDevicePresentation(device(trust: .approved, enrolledAt: Date(timeIntervalSince1970: 1_690_000_000), lastSeenAt: Date(timeIntervalSince1970: 1_700_000_000)))
        XCTAssertNotNil(row.lastUsed)
        XCTAssertNotNil(row.detail)
        XCTAssertTrue(row.accessibilityLabel.contains(try XCTUnwrap(row.lastUsed)), "VoiceOver lit aussi le dernier usage")
    }

    func test_devicePresentation_withoutALastSeenDate_inventsNothing() {
        let row = EncryptedDevicePresentation(device(trust: .approved, enrolledAt: nil, lastSeenAt: nil))
        XCTAssertNil(row.lastUsed)
    }

    func test_devicePresentation_ofThisDevice_staysNamedThisDevice() {
        let row = EncryptedDevicePresentation(device(trust: .thisDevice, enrolledAt: nil, lastSeenAt: nil))
        XCTAssertEqual(row.status, EncryptedDevicePresentation.status(of: .thisDevice))
        XCTAssertTrue(row.accessibilityLabel.contains(row.status))
    }
}
