import Foundation
import Combine
import UIKit
import MeeshySDK
import MeeshyUI

@MainActor
final class FeedbackToastManager: ObservableObject {
    static let shared = FeedbackToastManager()
    static let showToastNotification = Notification.Name("meeshy.showToast")

    @Published var currentToast: FeedbackToast?
    var onTapAction: (() -> Void)?

    private var dismissTask: Task<Void, Never>?
    private var cancellables = Set<AnyCancellable>()

    private init() {
        observeSDKToasts()
        wireAuthLogoutHook()
    }

    // MARK: - Session quiesce (P1, Q1 — logout)

    /// Q1 — un toast triggé pour user A juste avant `logout()` ne doit pas
    /// continuer à s'afficher après que la session A soit terminée. Pattern
    /// calqué sur `ConversationAudioCoordinator.wireAuthLogoutHook`.
    private func wireAuthLogoutHook() {
        AuthManager.shared.$isAuthenticated
            .removeDuplicates()
            .dropFirst()
            .filter { !$0 }
            .receive(on: DispatchQueue.main)
            .sink { [weak self] _ in self?.clearAll() }
            .store(in: &cancellables)
    }

    /// Q1 — purge tout toast pending + son tap handler. Plus large que
    /// `dismiss()` qui ne touche pas `onTapAction`.
    func clearAll() {
        dismissTask?.cancel()
        currentToast = nil
        onTapAction = nil
    }

    func show(_ message: String, type: FeedbackToastType = .success) {
        HapticFeedback.light()
        present(FeedbackToast(message: message, type: type))
    }

    func show(_ message: String, type: FeedbackToastType = .success, tapAction: @escaping () -> Void) {
        HapticFeedback.light()
        present(FeedbackToast(message: message, type: type, isTappable: true), tapAction: tapAction)
    }

    func showError(_ message: String) {
        HapticFeedback.error()
        present(FeedbackToast(message: message, type: .error))
    }

    func showError(_ message: String, tapAction: @escaping () -> Void) {
        HapticFeedback.error()
        present(FeedbackToast(message: message, type: .error, isTappable: true), tapAction: tapAction)
    }

    func showSuccess(_ message: String) {
        HapticFeedback.success()
        present(FeedbackToast(message: message, type: .success))
    }

    func dismiss() {
        dismissTask?.cancel()
        currentToast = nil
    }

    /// Single funnel for surfacing a toast: cancels any pending dismiss, stores
    /// the tap handler, posts a VoiceOver announcement, and schedules a
    /// VoiceOver-aware auto-dismiss. Haptics stay at each entry point because
    /// they differ by toast type.
    private func present(_ toast: FeedbackToast, tapAction: (() -> Void)? = nil) {
        dismissTask?.cancel()
        onTapAction = tapAction
        currentToast = toast
        let priority: AdaptiveAccessibility.AnnouncementPriority = toast.type == .error ? .high : .normal
        AdaptiveAccessibility.announce(toast.message, priority: priority)
        scheduleDismiss(duration: Self.dismissDelay(
            isTappable: toast.isTappable,
            voiceOverRunning: UIAccessibility.isVoiceOverRunning
        ))
    }

    /// Auto-dismiss delay (nanoseconds). Tappable toasts linger longer; with
    /// VoiceOver on, every toast stays at least 6s so the user can hear the
    /// announcement and read the message before it disappears.
    static func dismissDelay(isTappable: Bool, voiceOverRunning: Bool) -> UInt64 {
        let base: UInt64 = isTappable ? 6_000_000_000 : 3_000_000_000
        return voiceOverRunning ? max(base, 6_000_000_000) : base
    }

    private func scheduleDismiss(duration: UInt64 = 3_000_000_000) {
        dismissTask = Task { @MainActor in
            try? await Task.sleep(nanoseconds: duration)
            guard !Task.isCancelled else { return }
            currentToast = nil
            onTapAction = nil
        }
    }

    nonisolated private func observeSDKToasts() {
        NotificationCenter.default.addObserver(
            forName: Notification.Name("meeshy.showToast"),
            object: nil,
            queue: .main
        ) { [weak self] notification in
            guard let self else { return }

            let message = notification.userInfo?["message"] as? String ?? "Unknown"
            let isSuccess = notification.userInfo?["isSuccess"] as? Bool ?? false

            Task { @MainActor in
                if isSuccess {
                    self.showSuccess(message)
                } else {
                    self.showError(message)
                }
            }
        }
    }
}
