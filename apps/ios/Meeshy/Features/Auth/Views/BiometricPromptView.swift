//
//  BiometricPromptView.swift
//  Meeshy
//
//  Biometric authentication setup prompt
//  Minimum iOS 16+, with iOS 17+ Optic ID support
//

import SwiftUI

// MARK: - Biometric Kind Enum

enum BiometricKind {
    case faceID
    case opticID
    case touchID
    case none

    var displayName: String {
        switch self {
        case .faceID:
            return "Face ID"
        case .opticID:
            return "Optic ID"
        case .touchID:
            return "Touch ID"
        case .none:
            return "Biometric"
        }
    }
}

struct BiometricPromptView: View {
    // MARK: - Properties

    @Environment(\.dismiss) private var dismiss: DismissAction
    let biometricType: BiometricKind
    let onEnable: () async -> Void
    let onSkip: () -> Void

    @State private var isLoading = false

    // MARK: - Body

    var body: some View {
        VStack(spacing: 32) {
            Spacer()

            // Icon
            iconSection

            // Content
            contentSection

            Spacer()

            // Buttons
            buttonsSection
        }
        .padding(.horizontal, 24)
        .padding(.bottom, 40)
        .background(Color(UIColor.systemBackground))
    }

    // MARK: - View Components

    private var iconSection: some View {
        ZStack {
            Circle()
                .fill(Color(red: 0, green: 122/255, blue: 1).opacity(0.1))
                .frame(width: 120, height: 120)

            Image(systemName: biometricIcon)
                .font(.system(size: 56))
                .foregroundColor(Color(red: 0, green: 122/255, blue: 1))
        }
        .accessibilityHidden(true)
    }

    private var contentSection: some View {
        VStack(spacing: 16) {
            // Title
            Text("Enable Quick Sign-In")
                .font(.system(size: 28, weight: .bold))
                .foregroundColor(.primary)
                .multilineTextAlignment(.center)

            // Description
            Text("Use \(biometricType.displayName) for fast and secure access to your account")
                .font(.system(size: 17))
                .foregroundColor(.secondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 16)

            // Benefits
            benefitsSection
        }
    }

    private var benefitsSection: some View {
        VStack(alignment: .leading, spacing: 16) {
            BenefitRow(
                icon: "bolt.fill",
                title: "Instant Access",
                description: "Sign in instantly without typing"
            )

            BenefitRow(
                icon: "lock.shield.fill",
                title: "Enhanced Security",
                description: "Biometric data never leaves your device"
            )

            BenefitRow(
                icon: "star.fill",
                title: "Better Experience",
                description: "Seamless authentication every time"
            )
        }
        .padding(.top, 16)
    }

    private var buttonsSection: some View {
        VStack(spacing: 12) {
            AuthButton(
                title: "Enable \(biometricType.displayName)",
                isLoading: isLoading,
                style: .primary
            ) {
                isLoading = true
                Task {
                    await onEnable()
                    isLoading = false
                    dismiss()
                }
            }

            Button(action: {
                onSkip()
                dismiss()
            }) {
                Text("Skip for Now")
                    .font(.system(size: 17, weight: .medium))
                    .foregroundColor(.secondary)
                    .frame(maxWidth: .infinity)
                    .frame(height: 44)
            }
            .disabled(isLoading)
        }
    }

    // MARK: - Computed Properties

    private var biometricIcon: String {
        switch biometricType {
        case .faceID, .opticID:
            return "faceid"
        case .touchID:
            return "touchid"
        case .none:
            return "lock.fill"
        }
    }
}

// MARK: - Benefit Row

private struct BenefitRow: View {
    let icon: String
    let title: String
    let description: String

    var body: some View {
        HStack(alignment: .top, spacing: 16) {
            Image(systemName: icon)
                .font(.system(size: 20))
                .foregroundColor(Color(red: 0, green: 122/255, blue: 1))
                .frame(width: 24)
                .accessibilityHidden(true)

            VStack(alignment: .leading, spacing: 4) {
                Text(title)
                    .font(.system(size: 17, weight: .semibold))
                    .foregroundColor(.primary)

                Text(description)
                    .font(.system(size: 15))
                    .foregroundColor(.secondary)
            }
        }
        .accessibilityElement(children: .combine)
    }
}

// MARK: - Preview

#Preview {
    BiometricPromptView(
        biometricType: .faceID,
        onEnable: {
            try? await Task.sleep(nanoseconds: 1_000_000_000)
        },
        onSkip: {}
    )
}

#Preview("Touch ID") {
    BiometricPromptView(
        biometricType: .touchID,
        onEnable: {
            try? await Task.sleep(nanoseconds: 1_000_000_000)
        },
        onSkip: {}
    )
}
