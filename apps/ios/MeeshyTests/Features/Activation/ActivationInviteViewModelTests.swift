import XCTest
import MeeshySDK
@testable import Meeshy

/// « Validez votre compte » (#8239, loi serveur #8238) — la modal s'ouvre à
/// l'ouverture de l'app en phase `invite` seulement, au plus une fois par jour
/// et par appareil ; `quiet`, `done` (même sans numéro), `blocked` et une
/// passerelle muette n'ouvrent rien. « Plus tard » ferme ; l'adresse prouvée
/// dans la modal fait passer le compte à `done`.
@MainActor
final class ActivationInviteViewModelTests: XCTestCase {

    private final class MockDayStore: ActivationInviteDayStoring {
        var shownToday = false
        private(set) var markCount = 0
        func wasShownToday(now: Date) -> Bool { shownToday }
        func markShown(now: Date) {
            markCount += 1
            shownToday = true
        }
    }

    private let now = Date(timeIntervalSince1970: 1_790_000_000)

    private func makeSUT(shownToday: Bool = false) -> (ActivationInviteViewModel, MockDayStore) {
        let store = MockDayStore()
        store.shownToday = shownToday
        let now = self.now
        return (ActivationInviteViewModel(store: store, now: { now }), store)
    }

    private func makeUser(_ activation: UserActivation?, emailVerifiedAt: String? = nil, phoneNumber: String? = nil, phoneVerifiedAt: String? = nil) -> MeeshyUser {
        MeeshyUser(id: "u1", username: "amina", email: "amina@example.test",
                   phoneNumber: phoneNumber, emailVerifiedAt: emailVerifiedAt, phoneVerifiedAt: phoneVerifiedAt,
                   activation: activation)
    }

    private func invite(_ missing: [UserActivation.Channel]) -> UserActivation {
        UserActivation(phase: .invite, deadline: ISO8601DateFormatter().string(from: now.addingTimeInterval(9 * 86_400)), missing: missing)
    }

    func test_userChanged_invitePhase_presentsAndRemembersTheDay() {
        let (sut, store) = makeSUT()

        sut.userChanged(makeUser(invite([.email, .phone])))

        XCTAssertTrue(sut.isPresented)
        XCTAssertEqual(sut.missing, [.email, .phone])
        XCTAssertEqual(sut.email, "amina@example.test")
        XCTAssertEqual(sut.daysLeft, 9)
        XCTAssertEqual(store.markCount, 1)
    }

    func test_userChanged_otherPhasesOrAbsentField_presentNothing() {
        let phases: [UserActivation?] = [
            UserActivation(phase: .quiet, deadline: nil, missing: [.email]),
            UserActivation(phase: .blocked, deadline: nil, missing: [.email]),
            UserActivation(phase: .done, deadline: nil, missing: [.phone]),
            UserActivation(phase: nil, deadline: nil, missing: [.email]),
            nil,
        ]
        for activation in phases {
            let (sut, store) = makeSUT()
            sut.userChanged(makeUser(activation))
            XCTAssertFalse(sut.isPresented, "\(String(describing: activation))")
            XCTAssertEqual(store.markCount, 0)
        }
    }

    func test_userChanged_alreadyShownToday_presentsNothing() {
        let (sut, store) = makeSUT(shownToday: true)

        sut.userChanged(makeUser(invite([.email])))

        XCTAssertFalse(sut.isPresented)
        XCTAssertEqual(store.markCount, 0)
    }

    func test_dismiss_later_closesAndDoesNotReopenTheSameDay() {
        let (sut, _) = makeSUT()
        sut.userChanged(makeUser(invite([.email])))

        sut.dismiss()
        sut.userChanged(makeUser(invite([.email])))

        XCTAssertFalse(sut.isPresented)
    }

    func test_prove_email_passesTheAccountToDone() {
        let (sut, _) = makeSUT()
        sut.userChanged(makeUser(invite([.email, .phone])))

        sut.prove(.email)

        XCTAssertEqual(sut.activation?.phase, .done)
        XCTAssertEqual(sut.missing, [.phone])
        XCTAssertEqual(sut.proven, [.email])
        XCTAssertFalse(sut.isComplete)
        XCTAssertTrue(sut.isPresented)
    }

    func test_prove_lastChannel_isComplete() {
        let (sut, _) = makeSUT()
        sut.userChanged(makeUser(invite([.email])))

        sut.prove(.email)

        XCTAssertTrue(sut.isComplete)
    }

    func test_userChanged_whilePresented_absorbsAPhoneVerifiedElsewhere() {
        let (sut, _) = makeSUT()
        sut.userChanged(makeUser(invite([.phone])))

        sut.userChanged(makeUser(invite([.phone]), phoneNumber: "+33612345678", phoneVerifiedAt: "2026-09-27T10:00:00Z"))

        XCTAssertEqual(sut.missing, [])
        XCTAssertEqual(sut.proven, [.phone])
        XCTAssertTrue(sut.isPresented)
    }

    func test_userChanged_signedOut_closes() {
        let (sut, _) = makeSUT()
        sut.userChanged(makeUser(invite([.email])))

        sut.userChanged(nil)

        XCTAssertFalse(sut.isPresented)
    }

    func test_dayStore_rememberedDayIsTheLocalCalendarDay() {
        let defaults = UserDefaults(suiteName: "ActivationInviteDayStoreTests.\(UUID().uuidString)")!
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "Europe/Paris")!
        let store = UserDefaultsActivationInviteDayStore(defaults: defaults, calendar: calendar)

        XCTAssertFalse(store.wasShownToday(now: now))
        store.markShown(now: now)

        XCTAssertTrue(store.wasShownToday(now: now))
        XCTAssertFalse(store.wasShownToday(now: now.addingTimeInterval(86_400)))
    }
}
