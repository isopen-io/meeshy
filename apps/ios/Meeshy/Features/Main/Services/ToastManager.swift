import Foundation
import Combine
import UIKit
import MeeshySDK
import MeeshyUI

@MainActor
final class ToastManager: ObservableObject {
    static let shared = ToastManager()
    static let showToastNotification = Notification.Name("meeshy.showToast")

    @Published var currentToast: Toast?
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

    func show(_ message: String, type: ToastType = .success) {
        HapticFeedback.light()
        present(Toast(message: message, type: type))
    }

    func show(_ message: String, type: ToastType = .success, tapAction: @escaping () -> Void) {
        HapticFeedback.light()
        present(Toast(message: message, type: type, isTappable: true), tapAction: tapAction)
    }

    func showError(_ message: String) {
        HapticFeedback.error()
        present(Toast(message: message, type: .error))
    }

    func showSuccess(_ message: String) {
        HapticFeedback.success()
        present(Toast(message: message, type: .success))
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

        HapticFeedback.light()
        if let tapAction {
            present(Toast(message: message, type: .info, isTappable: true), tapAction: tapAction)
        } else {
            present(Toast(message: message, type: .info))
        }
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

    /// Single funnel for surfacing a toast: cancels any pending dismiss, stores
    /// the tap handler, posts a VoiceOver announcement, and schedules a
    /// VoiceOver-aware auto-dismiss. Haptics stay at each entry point because
    /// they differ by toast type.
    private func present(_ toast: Toast, tapAction: (() -> Void)? = nil) {
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
