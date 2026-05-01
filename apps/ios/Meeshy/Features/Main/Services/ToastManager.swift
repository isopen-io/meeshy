import Foundation
import Combine
import MeeshyUI

@MainActor
final class ToastManager: ObservableObject {
    static let shared = ToastManager()
    static let showToastNotification = Notification.Name("meeshy.showToast")

    @Published var currentToast: Toast?
    var onTapAction: (() -> Void)?

    private var dismissTask: Task<Void, Never>?

    private init() {
        observeSDKToasts()
    }

    func show(_ message: String, type: ToastType = .success) {
        dismissTask?.cancel()
        onTapAction = nil
        currentToast = Toast(message: message, type: type)
        HapticFeedback.light()
        scheduleDismiss()
    }

    func show(_ message: String, type: ToastType = .success, tapAction: @escaping () -> Void) {
        dismissTask?.cancel()
        onTapAction = tapAction
        currentToast = Toast(message: message, type: type, isTappable: true)
        HapticFeedback.light()
        scheduleDismiss(duration: 6_000_000_000)
    }

    func showError(_ message: String) {
        dismissTask?.cancel()
        currentToast = Toast(message: message, type: .error)
        HapticFeedback.error()
        scheduleDismiss()
    }

    func showSuccess(_ message: String) {
        dismissTask?.cancel()
        currentToast = Toast(message: message, type: .success)
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
