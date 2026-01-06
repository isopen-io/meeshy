//
//  AuthButton.swift
//  Meeshy
//
//  Reusable authentication button component
//  Minimum iOS 16+
//

import SwiftUI

/// Primary authentication button with loading state and haptic feedback
struct AuthButton: View {
    // MARK: - Properties

    let title: String
    let isLoading: Bool
    let isEnabled: Bool
    let style: ButtonStyle
    let action: () -> Void

    // MARK: - Initialization

    init(
        title: String,
        isLoading: Bool = false,
        isEnabled: Bool = true,
        style: ButtonStyle = .primary,
        action: @escaping () -> Void
    ) {
        self.title = title
        self.isLoading = isLoading
        self.isEnabled = isEnabled
        self.style = style
        self.action = action
    }

    // MARK: - Body

    var body: some View {
        Button(action: {
            guard !isLoading, isEnabled else { return }

            // Medium haptic feedback
            let generator = UIImpactFeedbackGenerator(style: .medium)
            generator.impactOccurred()

            action()
        }) {
            HStack(spacing: 12) {
                if isLoading {
                    ProgressView()
                        .progressViewStyle(CircularProgressViewStyle(tint: style.foregroundColor))
                        .scaleEffect(0.9)
                }

                Text(title)
                    .font(.system(size: 17, weight: .semibold))
                    .foregroundColor(style.foregroundColor)
            }
            .frame(maxWidth: .infinity)
            .frame(height: style.height)
            .background(isEnabled ? style.backgroundColor : style.disabledBackgroundColor)
            .cornerRadius(14)
            .opacity(isEnabled ? 1.0 : 0.6)
        }
        .disabled(isLoading || !isEnabled)
        .scaleEffect(isLoading || !isEnabled ? 1.0 : 1.0)
        .animation(.easeInOut(duration: 0.2), value: isLoading)
        .accessibilityLabel(title)
        .accessibilityHint(isLoading ? "Loading" : "Double tap to \(title.lowercased())")
    }
}

// MARK: - Button Style

extension AuthButton {
    enum ButtonStyle {
        case primary
        case secondary
        case ghost
        case danger

        var height: CGFloat {
            switch self {
            case .primary: return 56
            case .secondary: return 50
            case .ghost: return 44
            case .danger: return 56
            }
        }

        var backgroundColor: Color {
            switch self {
            case .primary:
                return Color(red: 0, green: 122/255, blue: 1) // #007AFF
            case .secondary:
                return Color(UIColor.systemGray6)
            case .ghost:
                return Color.clear
            case .danger:
                return Color(red: 1, green: 59/255, blue: 48/255) // #FF3B30
            }
        }

        var disabledBackgroundColor: Color {
            switch self {
            case .primary, .danger:
                return backgroundColor.opacity(0.5)
            case .secondary:
                return Color(UIColor.systemGray5)
            case .ghost:
                return Color.clear
            }
        }

        var foregroundColor: Color {
            switch self {
            case .primary, .danger:
                return .white
            case .secondary:
                return .primary
            case .ghost:
                return Color(red: 0, green: 122/255, blue: 1)
            }
        }
    }
}

// MARK: - Preview

#Preview {
    VStack(spacing: 16) {
        AuthButton(title: "Sign In", style: .primary) {}
        AuthButton(title: "Sign In", isLoading: true, style: .primary) {}
        AuthButton(title: "Cancel", style: .secondary) {}
        AuthButton(title: "Skip", style: .ghost) {}
        AuthButton(title: "Delete Account", style: .danger) {}
        AuthButton(title: "Disabled", isEnabled: false, style: .primary) {}
    }
    .padding()
}
