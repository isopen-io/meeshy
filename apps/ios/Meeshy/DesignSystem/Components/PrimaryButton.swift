//
//  PrimaryButton.swift
//  Meeshy
//
//  Reusable primary button component
//  iOS 16+
//

import SwiftUI

struct PrimaryButton: View {
    // MARK: - Properties

    let title: String
    let action: () -> Void
    var isLoading: Bool = false
    var isDisabled: Bool = false
    var style: ButtonStyle = .primary

    // MARK: - Button Style

    enum ButtonStyle {
        case primary
        case secondary
        case destructive

        var backgroundColor: Color {
            switch self {
            case .primary: return .meeshyPrimary
            case .secondary: return .meeshySecondary
            case .destructive: return .meeshyError
            }
        }

        var foregroundColor: Color {
            switch self {
            case .primary, .destructive: return .white
            case .secondary: return .meeshyPrimary
            }
        }
    }

    // MARK: - Body

    var body: some View {
        Button(action: action) {
            HStack(spacing: 8) {
                if isLoading {
                    ProgressView()
                        .tint(style.foregroundColor)
                }

                Text(title)
                    .font(.headline)
                    .foregroundColor(style.foregroundColor)
            }
            .frame(maxWidth: .infinity)
            .frame(height: 50)
            .background(
                isDisabled ? Color.gray.opacity(0.3) : style.backgroundColor
            )
            .cornerRadius(12)
        }
        .disabled(isLoading || isDisabled)
    }
}

// MARK: - Preview

struct PrimaryButton_Previews: PreviewProvider {
    static var previews: some View {
        VStack(spacing: 20) {
            PrimaryButton(title: "Login", action: {})

            PrimaryButton(title: "Loading", action: {}, isLoading: true)

            PrimaryButton(title: "Disabled", action: {}, isDisabled: true)

            PrimaryButton(title: "Delete", action: {}, style: .destructive)
        }
        .padding()
    }
}
