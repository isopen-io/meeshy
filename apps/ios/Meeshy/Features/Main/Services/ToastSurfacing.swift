import Foundation

@MainActor
protocol ToastSurfacing: AnyObject {
    func showSuccess(_ message: String)
    func showError(_ message: String)
}

extension ToastManager: ToastSurfacing {}
