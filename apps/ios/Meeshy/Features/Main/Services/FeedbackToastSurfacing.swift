import Foundation

@MainActor
protocol FeedbackToastSurfacing: AnyObject {
    func showSuccess(_ message: String)
    func showError(_ message: String)
    /// Erreur actionnable — le tap exécute `tapAction` (typiquement l'ouverture
    /// des Réglages après un refus de permission).
    func showError(_ message: String, tapAction: @escaping () -> Void)
}

extension FeedbackToastManager: FeedbackToastSurfacing {}
