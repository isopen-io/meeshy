//
//  AppearanceSettingsView.swift
//  Meeshy
//
//  Appearance settings view
//  iOS 16+ compatible
//

import SwiftUI

// MARK: - Theme Mode

enum ThemeMode: String, CaseIterable {
    case system = "system"
    case light = "light"
    case dark = "dark"

    var displayName: String {
        switch self {
        case .system: return "Système"
        case .light: return "Clair"
        case .dark: return "Sombre"
        }
    }

    var icon: String {
        switch self {
        case .system: return "circle.lefthalf.filled"
        case .light: return "sun.max.fill"
        case .dark: return "moon.fill"
        }
    }

    var colorScheme: ColorScheme? {
        switch self {
        case .system: return nil
        case .light: return .light
        case .dark: return .dark
        }
    }
}

// MARK: - Appearance Settings View

@MainActor
struct AppearanceSettingsView: View {
    @AppStorage("themeMode") private var themeMode: String = ThemeMode.system.rawValue
    @AppStorage("accentColorHex") private var accentColorHex: String = "#007AFF"
    @AppStorage("fontSize") private var fontSize: Double = 16

    @Environment(\.colorScheme) private var systemColorScheme

    private var selectedTheme: ThemeMode {
        ThemeMode(rawValue: themeMode) ?? .system
    }

    var body: some View {
        List {
            // Theme section with visual preview
            Section {
                ForEach(ThemeMode.allCases, id: \.self) { mode in
                    Button {
                        withAnimation(.easeInOut(duration: 0.2)) {
                            themeMode = mode.rawValue
                        }
                    } label: {
                        HStack(spacing: 12) {
                            Image(systemName: mode.icon)
                                .font(.system(size: 20))
                                .foregroundColor(mode == selectedTheme ? .blue : .secondary)
                                .frame(width: 28)

                            Text(mode.displayName)
                                .foregroundColor(.primary)

                            Spacer()

                            if mode == selectedTheme {
                                Image(systemName: "checkmark")
                                    .foregroundColor(.blue)
                                    .fontWeight(.semibold)
                            }
                        }
                        .padding(.vertical, 4)
                    }
                }
            } header: {
                Text("Thème")
            } footer: {
                Text("Le thème Système suit les réglages de votre appareil")
            }

            // Font size section
            Section {
                VStack(alignment: .leading, spacing: 12) {
                    HStack {
                        Text("Taille de police")
                        Spacer()
                        Text("\(Int(fontSize)) pt")
                            .foregroundColor(.secondary)
                            .monospacedDigit()
                    }

                    HStack(spacing: 12) {
                        Text("A")
                            .font(.system(size: 12))
                            .foregroundColor(.secondary)

                        Slider(value: $fontSize, in: 12...24, step: 1)

                        Text("A")
                            .font(.system(size: 20, weight: .medium))
                            .foregroundColor(.secondary)
                    }

                    // Preview
                    Text("Aperçu du texte")
                        .font(.system(size: fontSize))
                        .padding(.top, 4)
                }
                .padding(.vertical, 4)
            } header: {
                Text("Police")
            }

            // Preview section
            Section {
                VStack(spacing: 12) {
                    // Simulated message preview
                    HStack {
                        Text("Salut! Comment ça va?")
                            .font(.system(size: fontSize))
                            .padding(.horizontal, 14)
                            .padding(.vertical, 10)
                            .background(Color.blue.opacity(0.15))
                            .clipShape(RoundedRectangle(cornerRadius: 18))
                        Spacer()
                    }

                    HStack {
                        Spacer()
                        Text("Très bien merci!")
                            .font(.system(size: fontSize))
                            .padding(.horizontal, 14)
                            .padding(.vertical, 10)
                            .background(Color.blue.opacity(0.8))
                            .foregroundColor(.white)
                            .clipShape(RoundedRectangle(cornerRadius: 18))
                    }
                }
                .padding(.vertical, 8)
            } header: {
                Text("Aperçu")
            }
        }
        .navigationTitle("Apparence")
        .navigationBarTitleDisplayMode(.inline)
    }
}

// MARK: - Theme Modifier

struct ThemeModifier: ViewModifier {
    @AppStorage("themeMode") private var themeMode: String = ThemeMode.system.rawValue

    func body(content: Content) -> some View {
        content
            .preferredColorScheme(ThemeMode(rawValue: themeMode)?.colorScheme)
    }
}

extension View {
    func applyTheme() -> some View {
        modifier(ThemeModifier())
    }
}

#Preview {
    NavigationStack {
        AppearanceSettingsView()
    }
}
