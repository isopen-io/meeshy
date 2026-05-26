import Foundation
import Combine
import MeeshySDK
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

    /// Surface an in-app toast for a Socket.IO `notification:new` event.
    ///
    /// Builds a 2-line message: `"<title> · <subtitle>\n<body>"` (or
    /// `"<title>\n<body>"` for direct messages without subtitle). The
    /// `title`/`subtitle`/`content` are exactly what the gateway already
    /// produced for the APN push payload, so push and toast stay in sync.
    ///
    /// Suppresses the toast when the user is already viewing the target
    /// conversation (`currentConversationId == notification.context?.conversationId`),
    /// since the message itself is already visible in the conversation view.
    ///
    /// Returns `true` if a toast was shown, `false` if suppressed or unrenderable.
    @discardableResult
    func showInAppNotification(
        _ notification: APINotification,
        currentConversationId: String? = nil,
        tapAction: (() -> Void)? = nil
    ) -> Bool {
        if let targetId = notification.context?.conversationId,
           let currentId = currentConversationId,
           !currentId.isEmpty,
           targetId == currentId {
            return false
        }

        guard let message = Self.formatInAppNotificationMessage(notification) else {
            return false
        }

        dismissTask?.cancel()
        if let tapAction {
            onTapAction = tapAction
            currentToast = Toast(message: message, type: .info, isTappable: true)
            scheduleDismiss(duration: 6_000_000_000)
        } else {
            onTapAction = nil
            currentToast = Toast(message: message, type: .info)
            scheduleDismiss()
        }
        HapticFeedback.light()
        return true
    }

    /// Pure formatter — exposed for testability.
    static func formatInAppNotificationMessage(_ notification: APINotification) -> String? {
        let title = notification.title?.trimmingCharacters(in: .whitespacesAndNewlines)
        let subtitle = notification.subtitle?.trimmingCharacters(in: .whitespacesAndNewlines)
        let body = notification.content?.trimmingCharacters(in: .whitespacesAndNewlines)

        let header: String? = {
            switch (title?.isEmpty == false ? title : nil, subtitle?.isEmpty == false ? subtitle : nil) {
            case let (.some(t), .some(s)): return "\(t) · \(s)"
            case let (.some(t), .none):    return t
            case (.none, _):               return nil
            }
        }()

        switch (header, body?.isEmpty == false ? body : nil) {
        case let (.some(h), .some(b)): return "\(h)\n\(b)"
        case let (.some(h), .none):    return h
        case let (.none, .some(b)):    return b
        case (.none, .none):           return nil
        }
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
