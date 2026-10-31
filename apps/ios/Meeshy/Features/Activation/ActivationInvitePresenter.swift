import UIKit

enum ActivationInvitePresentation {
    static let windowLevel = UIWindow.Level.normal
    static func surface(isDark: Bool) -> UIColor { .clear }
}

@MainActor
protocol ActivationInviteWindowHosting: AnyObject {
    func show(_ model: ActivationInviteViewModel, onDismissedByUser: @escaping () -> Void) -> Bool
    func hide()
}

@MainActor
final class ActivationInvitePresenter {
    nonisolated deinit {}
    private let hosting: ActivationInviteWindowHosting
    private(set) var isShowing = false

    init(hosting: ActivationInviteWindowHosting) {
        self.hosting = hosting
    }

    func apply(model: ActivationInviteViewModel, isPresented: Bool) {}
    func retryPendingShow(model: ActivationInviteViewModel) {}
}
