//
//  PermissionsView.swift
//  Meeshy
//
//  Permissions request screen for notifications
//  Minimum iOS 16+
//

import SwiftUI

struct PermissionsView: View {
    // MARK: - Properties

    @ObservedObject var viewModel: OnboardingViewModel

    // MARK: - Body

    var body: some View {
        GeometryReader { geometry in
            let isCompact = geometry.size.height < 700
            let mainSpacing: CGFloat = isCompact ? 16 : 32
            let horizontalPadding: CGFloat = isCompact ? 16 : 24
            let verticalPadding: CGFloat = isCompact ? 20 : 40

            ScrollView(showsIndicators: false) {
                VStack(spacing: mainSpacing) {
                    // Icon
                    iconSection(compact: isCompact)

                    // Content
                    contentSection(compact: isCompact)

                    // Buttons
                    buttonsSection(compact: isCompact)
                }
                .padding(.horizontal, horizontalPadding)
                .padding(.vertical, verticalPadding)
                .frame(minHeight: geometry.size.height)
            }
        }
    }

    // MARK: - View Components

    private func iconSection(compact: Bool) -> some View {
        let circleSize: CGFloat = compact ? 100 : 140
        let iconSize: CGFloat = compact ? 44 : 64

        return ZStack {
            Circle()
                .fill(
                    LinearGradient(
                        colors: [
                            Color(red: 0, green: 122/255, blue: 1).opacity(0.15),
                            Color(red: 0, green: 122/255, blue: 1).opacity(0.05)
                        ],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    )
                )
                .frame(width: circleSize, height: circleSize)

            Image(systemName: "bell.badge.fill")
                .font(.system(size: iconSize))
                .foregroundColor(Color(red: 0, green: 122/255, blue: 1))
                .symbolRenderingMode(.hierarchical)
        }
        .accessibilityLabel("Notifications icon")
    }

    private func contentSection(compact: Bool) -> some View {
        let titleSize: CGFloat = compact ? 26 : 32
        let descSize: CGFloat = compact ? 15 : 17
        let sectionSpacing: CGFloat = compact ? 12 : 20

        return VStack(spacing: sectionSpacing) {
            // Title
            Text("Stay Connected")
                .font(.system(size: titleSize, weight: .bold))
                .foregroundColor(.primary)
                .multilineTextAlignment(.center)

            // Description
            Text("Enable notifications to never miss important messages from your contacts")
                .font(.system(size: descSize))
                .foregroundColor(.secondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal, compact ? 8 : 16)

            // Benefits
            VStack(alignment: .leading, spacing: compact ? 10 : 16) {
                BenefitRow(
                    icon: "message.fill",
                    title: "New Messages",
                    description: "Get notified of new messages instantly",
                    compact: compact
                )

                BenefitRow(
                    icon: "phone.fill",
                    title: "Incoming Calls",
                    description: "Never miss a call from friends",
                    compact: compact
                )

                BenefitRow(
                    icon: "person.2.fill",
                    title: "Group Updates",
                    description: "Stay updated on group conversations",
                    compact: compact
                )
            }
            .padding(.top, compact ? 8 : 16)
        }
    }

    private func buttonsSection(compact: Bool) -> some View {
        VStack(spacing: compact ? 8 : 12) {
            AuthButton(
                title: "Enable Notifications",
                style: .primary
            ) {
                Task {
                    await viewModel.requestNotificationPermission()
                    completeWalkthrough()
                }
            }

            Button(action: {
                completeWalkthrough()
            }) {
                Text("Not Now")
                    .font(.system(size: compact ? 15 : 17, weight: .medium))
                    .foregroundColor(.secondary)
                    .frame(maxWidth: .infinity)
                    .frame(height: compact ? 38 : 44)
            }
        }
    }

    /// Complete the walkthrough and transition to login
    private func completeWalkthrough() {
        // Mark walkthrough as complete in UserDefaults
        UserDefaults.standard.set(true, forKey: "hasCompletedOnboarding")

        // Haptic feedback
        let generator = UINotificationFeedbackGenerator()
        generator.notificationOccurred(.success)

        // Transition to login screen
        AppLaunchCoordinator.shared.walkthroughCompleted()
    }
}

// MARK: - Benefit Row

private struct BenefitRow: View {
    let icon: String
    let title: String
    let description: String
    var compact: Bool = false

    var body: some View {
        HStack(alignment: .top, spacing: compact ? 12 : 16) {
            Image(systemName: icon)
                .font(.system(size: compact ? 16 : 20))
                .foregroundColor(Color(red: 0, green: 122/255, blue: 1))
                .frame(width: compact ? 20 : 24)
                .accessibilityHidden(true)

            VStack(alignment: .leading, spacing: compact ? 2 : 4) {
                Text(title)
                    .font(.system(size: compact ? 15 : 17, weight: .semibold))
                    .foregroundColor(.primary)

                Text(description)
                    .font(.system(size: compact ? 13 : 15))
                    .foregroundColor(.secondary)
            }

            Spacer()
        }
        .accessibilityElement(children: .combine)
    }
}

// MARK: - Preview

#Preview {
    PermissionsView(viewModel: OnboardingViewModel())
}
