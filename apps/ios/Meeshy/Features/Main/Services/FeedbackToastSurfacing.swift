import Foundation

@MainActor
protocol FeedbackToastSurfacing: AnyObject {
    func showSuccess(_ message: String)
    func showError(_ message: String)
}

extension FeedbackToastManager: FeedbackToastSurfacing {}
