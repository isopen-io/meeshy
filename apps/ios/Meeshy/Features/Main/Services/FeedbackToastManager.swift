import Foundation
import Combine
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
        dismissTask?.cancel()
        onTapAction = nil
        currentToast = FeedbackToast(message: message, type: type)
        HapticFeedback.light()
        scheduleDismiss()
    }

    func show(_ message: String, type: FeedbackToastType = .success, tapAction: @escaping () -> Void) {
        dismissTask?.cancel()
        onTapAction = tapAction
        currentToast = FeedbackToast(message: message, type: type, isTappable: true)
        HapticFeedback.light()
        scheduleDismiss(duration: 6_000_000_000)
    }

    func showError(_ message: String) {
        dismissTask?.cancel()
        currentToast = FeedbackToast(message: message, type: .error)
        HapticFeedback.error()
        scheduleDismiss()
    }

    func showSuccess(_ message: String) {
        dismissTask?.cancel()
        currentToast = FeedbackToast(message: message, type: .success)
        HapticFeedback.success()
        scheduleDismiss()
    }

    func dismiss() {
        dismissTask?.cancel()
        currentToast = nil
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
