import Foundation

// MARK: - Clipboard Content Model (app-specific, not in MeeshyUI)

struct ClipboardContent {
    let text: String
    let truncatedPreview: String
    let charCount: Int

    init(text: String) {
        self.text = text
        self.charCount = text.count
        self.truncatedPreview = String(text.prefix(200)) + (text.count > 200 ? "..." : "")
    }
}
