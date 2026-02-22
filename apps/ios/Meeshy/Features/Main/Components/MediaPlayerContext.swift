import Foundation

// MARK: - Clipboard Content Model (app-specific, not in MeeshyUI)

struct ClipboardContent: Identifiable, Equatable {
    let id: String
    let text: String
    let truncatedPreview: String
    let charCount: Int
    let createdAt: Date

    init(text: String) {
        self.id = "clipboard-\(Int(Date().timeIntervalSince1970 * 1000))"
        self.text = text
        self.charCount = text.count
        self.truncatedPreview = String(text.prefix(200)) + (text.count > 200 ? "..." : "")
        self.createdAt = Date()
    }

    static func == (lhs: Self, rhs: Self) -> Bool { lhs.id == rhs.id }
}
