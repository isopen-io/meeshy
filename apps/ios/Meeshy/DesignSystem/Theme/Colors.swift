//
//  Colors.swift
//  Meeshy
//
//  App color palette
//  iOS 16+
//

import SwiftUI

extension Color {
    // MARK: - Primary Colors

    static let meeshyPrimary = Color(red: 0.0, green: 0.48, blue: 1.0) // Bleu iOS
    static let meeshySecondary = Color(red: 0.35, green: 0.34, blue: 0.84) // Violet
    static let meeshyAccent = Color(red: 1.0, green: 0.23, blue: 0.19) // Rouge/Orange

    // MARK: - Background Colors

    static let meeshyBackground = Color(uiColor: .systemBackground)
    static let meeshySecondaryBackground = Color(uiColor: .secondarySystemBackground)
    static let meeshyTertiaryBackground = Color(uiColor: .tertiarySystemBackground)

    // MARK: - Text Colors

    static let meeshyTextPrimary = Color(uiColor: .label)
    static let meeshyTextSecondary = Color(uiColor: .secondaryLabel)
    static let meeshyTextTertiary = Color(uiColor: .tertiaryLabel)

    // MARK: - Message Bubble Colors

    static let meeshySentBubble = Color(red: 0.0, green: 0.48, blue: 1.0) // Bleu
    static let meeshyReceivedBubble = Color(uiColor: .secondarySystemFill)

    // MARK: - Status Colors

    static let meeshySuccess = Color.green
    static let meeshyError = Color.red
    static let meeshyWarning = Color.orange
    static let meeshyInfo = Color.blue

    // MARK: - Border Colors

    static let meeshyBorder = Color(uiColor: .separator)

    // MARK: - System Overrides

    static let meeshySeparator = Color(uiColor: .separator)
}

// MARK: - Theme @MainActor
final class ThemeManager: ObservableObject, @unchecked Sendable  {
    
    // MARK: - Singleton
    
    nonisolated(unsafe) static let shared = ThemeManager()

    private init() {}

    func configureAppearance() {
        // Configure navigation bar appearance
        let navBarAppearance = UINavigationBarAppearance()
        navBarAppearance.configureWithOpaqueBackground()
        navBarAppearance.backgroundColor = UIColor(Color.meeshyBackground)
        navBarAppearance.titleTextAttributes = [.foregroundColor: UIColor(Color.meeshyTextPrimary)]

        UINavigationBar.appearance().standardAppearance = navBarAppearance
        UINavigationBar.appearance().scrollEdgeAppearance = navBarAppearance
        UINavigationBar.appearance().compactAppearance = navBarAppearance

        // Configure tab bar appearance
        let tabBarAppearance = UITabBarAppearance()
        tabBarAppearance.configureWithOpaqueBackground()
        tabBarAppearance.backgroundColor = UIColor(Color.meeshyBackground)

        UITabBar.appearance().standardAppearance = tabBarAppearance
        UITabBar.appearance().scrollEdgeAppearance = tabBarAppearance
    }
}
