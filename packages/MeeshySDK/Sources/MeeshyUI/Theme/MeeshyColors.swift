import SwiftUI

public struct MeeshyColors {

    // MARK: - Primary Colors (brand — identical in dark & light)

    public static let pink = Color(hex: "FF2E63")
    public static let coral = Color(hex: "FF6B6B")
    public static let cyan = Color(hex: "08D9D6")
    public static let purple = Color(hex: "A855F7")
    public static let deepPurple = Color(hex: "302B63")
    public static let darkBlue = Color(hex: "0F0C29")
    public static let green = Color(hex: "4ADE80")
    public static let orange = Color(hex: "F59E0B")

    // MARK: - Theme-Aware Gradients

    public static func mainBackgroundGradient(isDark: Bool) -> LinearGradient {
        isDark ?
            LinearGradient(
                colors: [Color(hex: "0F0C29"), Color(hex: "302B63"), Color(hex: "24243E")],
                startPoint: .topLeading, endPoint: .bottomTrailing
            ) :
            LinearGradient(
                colors: [Color(hex: "FAF8F5"), Color(hex: "F5F0EA"), Color(hex: "F8F6F2")],
                startPoint: .topLeading, endPoint: .bottomTrailing
            )
    }

    public static func secondaryGradient(isDark: Bool) -> LinearGradient {
        isDark ?
            LinearGradient(
                colors: [Color(hex: "08D9D6"), Color(hex: "252A34")],
                startPoint: .topLeading, endPoint: .bottomTrailing
            ) :
            LinearGradient(
                colors: [Color(hex: "08D9D6"), Color(hex: "F5F0EA")],
                startPoint: .topLeading, endPoint: .bottomTrailing
            )
    }

    public static func glassBorderGradient(isDark: Bool) -> LinearGradient {
        isDark ?
            LinearGradient(
                colors: [Color.white.opacity(0.3), Color.white.opacity(0.1)],
                startPoint: .topLeading, endPoint: .bottomTrailing
            ) :
            LinearGradient(
                colors: [Color.black.opacity(0.08), Color.black.opacity(0.03)],
                startPoint: .topLeading, endPoint: .bottomTrailing
            )
    }

    // MARK: - Static Gradients (brand — identical in both modes)

    public static let primaryGradient = LinearGradient(
        colors: [Color(hex: "FF2E63"), Color(hex: "FF6B6B")],
        startPoint: .topLeading, endPoint: .bottomTrailing
    )

    public static let accentGradient = LinearGradient(
        colors: [Color(hex: "8A2387"), Color(hex: "E94057"), Color(hex: "F27121")],
        startPoint: .topLeading, endPoint: .bottomTrailing
    )

    public static let avatarRingGradient = LinearGradient(
        colors: [Color(hex: "FF2E63"), Color(hex: "08D9D6")],
        startPoint: .topLeading, endPoint: .bottomTrailing
    )

    // MARK: - Material

    public static let glassFill = Material.ultraThin
}
