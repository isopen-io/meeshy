import SwiftUI

// MARK: - App Group Constants

enum WidgetSharedKeys: Sendable {
    static let suiteName = "group.me.meeshy.apps"
    static let conversations = "recent_conversations"
    static let unreadCount = "unread_count"
    static let pendingMarkRead = "pending_mark_read"
}

// MARK: - Deep Link

struct WidgetLink<Content: View>: View {
    let url: URL?
    @ViewBuilder let content: Content

    var body: some View {
        if let url {
            Link(destination: url) { content }
        } else {
            content
        }
    }
}

// MARK: - Brand Colors (mirrors MeeshyColors from SDK — widget can't import MeeshyUI)

enum WidgetColors {
    static let brandPrimaryHex = "6366F1"
    static let brandDeepHex = "4338CA"
    static let indigo400Hex = "818CF8"
    static let successHex = "34D399"
    static let errorHex = "F87171"
    static let warningHex = "FBBF24"
    static let neutral400Hex = "9CA3AF"

    static var brandPrimary: Color { Color(hex: brandPrimaryHex) }
    static var brandDeep: Color { Color(hex: brandDeepHex) }
    static var brandGradient: LinearGradient {
        LinearGradient(colors: [brandPrimary, brandDeep], startPoint: .topLeading, endPoint: .bottomTrailing)
    }
}

// MARK: - Color(hex:) (minimal, widget-only)

extension Color {
    init(hex: String) {
        let h = hex.trimmingCharacters(in: CharacterSet(charactersIn: "#"))
        var rgb: UInt64 = 0
        Scanner(string: h).scanHexInt64(&rgb)
        self.init(
            red: Double((rgb >> 16) & 0xFF) / 255,
            green: Double((rgb >> 8) & 0xFF) / 255,
            blue: Double(rgb & 0xFF) / 255
        )
    }
}

// MARK: - InitialsAvatar

struct InitialsAvatar: View {
    let name: String
    let accentColor: String
    let size: CGFloat

    private var initials: String {
        let words = name.split(separator: " ").prefix(2)
        if words.isEmpty { return "?" }
        return words.map { String($0.prefix(1)).uppercased() }.joined()
    }

    var body: some View {
        ZStack {
            Circle()
                .fill(Color(hex: accentColor))
            Text(initials)
                .font(.system(size: size * 0.4, weight: .semibold, design: .rounded))
                .foregroundStyle(.white)
        }
        .frame(width: size, height: size)
    }
}
