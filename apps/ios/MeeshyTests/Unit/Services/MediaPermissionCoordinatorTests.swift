import XCTest
import MeeshySDK
@testable import Meeshy

/// Behaviour of the single gate every device-content access goes through.
///
/// The TCC state itself cannot be forced from a unit test, so the coordinator
/// exposes a seam (`resolve(kind:state:requesting:toasts:)`) taking the current
/// state and the request closure. Everything that matters — do we prompt, do we
/// proceed, do we surface an actionable refusal — is decided there.
@MainActor
final class MediaPermissionCoordinatorTests: XCTestCase {

    // MARK: - SUT

    private final class ToastSpy: FeedbackToastSurfacing {
        private(set) var errors: [String] = []
        private(set) var successes: [String] = []
        private(set) var tapActions: [() -> Void] = []

        func showSuccess(_ message: String) { successes.append(message) }
        func showError(_ message: String) { errors.append(message) }
        func showError(_ message: String, tapAction: @escaping () -> Void) {
            errors.append(message)
            tapActions.append(tapAction)
        }
    }

    private func resolve(
        kind: MediaPermissionKind = .microphone,
        state: MediaPermissionState,
        requesting: () async -> MediaPermissionState = { .denied },
        toasts: ToastSpy
    ) async -> Bool {
        await MediaPermissionCoordinator.resolve(
            kind: kind,
            state: state,
            requesting: requesting,
            toasts: toasts
        )
    }

    // MARK: - Already granted: fast path, no prompt, no toast

    func test_resolve_whenGranted_proceedsWithoutPromptingOrToasting() async {
        let toasts = ToastSpy()
        var promptCount = 0
        let granted = await resolve(
            state: .granted,
            requesting: { promptCount += 1; return .granted },
            toasts: toasts
        )

        XCTAssertTrue(granted)
        XCTAssertEqual(promptCount, 0, "Un état déjà accordé ne doit jamais re-prompter")
        XCTAssertTrue(toasts.errors.isEmpty)
    }

    /// `.limited` (photothèque) est un accord — pas un refus.
    func test_resolve_whenLimited_proceedsWithoutPrompting() async {
        let toasts = ToastSpy()
        var promptCount = 0
        let granted = await resolve(
            kind: .photoLibraryRead,
            state: .limited,
            requesting: { promptCount += 1; return .limited },
            toasts: toasts
        )

        XCTAssertTrue(granted)
        XCTAssertEqual(promptCount, 0)
        XCTAssertTrue(toasts.errors.isEmpty)
    }

    // MARK: - Not determined: prompt exactly once

    func test_resolve_whenNotDetermined_promptsAndProceedsOnGrant() async {
        let toasts = ToastSpy()
        var promptCount = 0
        let granted = await resolve(
            state: .notDetermined,
            requesting: { promptCount += 1; return .granted },
            toasts: toasts
        )

        XCTAssertTrue(granted)
        XCTAssertEqual(promptCount, 1)
        XCTAssertTrue(toasts.errors.isEmpty, "Un accord ne produit aucun toast")
    }

    func test_resolve_whenNotDetermined_andUserRefuses_surfacesActionableToast() async {
        let toasts = ToastSpy()
        let granted = await resolve(
            state: .notDetermined,
            requesting: { .denied },
            toasts: toasts
        )

        XCTAssertFalse(granted)
        XCTAssertEqual(toasts.errors.count, 1)
        XCTAssertEqual(toasts.tapActions.count, 1, "Le refus doit proposer l'ouverture des Réglages")
    }

    // MARK: - Terminal refusal: never prompt again, always explain

    func test_resolve_whenDenied_doesNotPromptAndSurfacesActionableToast() async {
        let toasts = ToastSpy()
        var promptCount = 0
        let granted = await resolve(
            state: .denied,
            requesting: { promptCount += 1; return .granted },
            toasts: toasts
        )

        XCTAssertFalse(granted)
        XCTAssertEqual(promptCount, 0, "Re-prompter après un refus définitif n'affiche rien à l'utilisateur")
        XCTAssertEqual(toasts.errors.count, 1)
        XCTAssertEqual(toasts.tapActions.count, 1)
    }

    func test_resolve_whenRestricted_behavesLikeDenied() async {
        let toasts = ToastSpy()
        var promptCount = 0
        let granted = await resolve(state: .restricted, requesting: { promptCount += 1; return .granted }, toasts: toasts)

        XCTAssertFalse(granted)
        XCTAssertEqual(promptCount, 0)
        XCTAssertEqual(toasts.errors.count, 1)
    }

    // MARK: - Silent mode

    /// Les chemins qui gèrent eux-mêmes la dégradation (vidéo d'appel qui
    /// retombe en audio, sauvegarde photothèque optionnelle) demandent un refus
    /// silencieux pour ne pas empiler deux messages sur le même geste.
    func test_resolve_whenSilent_refusesWithoutToasting() async {
        let toasts = ToastSpy()
        let granted = await MediaPermissionCoordinator.resolve(
            kind: .camera,
            state: .denied,
            requesting: { .denied },
            toasts: toasts,
            announcesRefusal: false
        )

        XCTAssertFalse(granted)
        XCTAssertTrue(toasts.errors.isEmpty)
    }

    // MARK: - Messages

    /// Chaque permission a son propre libellé : un message générique
    /// (« accès refusé ») n'indique pas quoi autoriser dans les Réglages.
    func test_deniedMessage_isDistinctPerKind() {
        let messages = MediaPermissionKind.allCases.map(MediaPermissionCoordinator.deniedMessage(for:))
        XCTAssertEqual(Set(messages).count, MediaPermissionKind.allCases.count)
        XCTAssertFalse(messages.contains(where: \.isEmpty))
    }
}
