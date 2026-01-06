//
//  WelcomeView.swift
//  Meeshy
//
//  First-launch welcome screen
//  Minimum iOS 16+
//

import SwiftUI

struct WelcomeView: View {
    // MARK: - Properties

    @State private var showLoginView = false
    @State private var showRegisterView = false

    // MARK: - Body

    var body: some View {
        VStack(spacing: 0) {
            Spacer()

            // App Icon & Title
            headerSection

            // Feature Highlights
            featuresSection

            Spacer()

            // Action Buttons
            buttonsSection
        }
        .padding(.horizontal, 24)
        .padding(.vertical, 40)
        .background(
            LinearGradient(
                colors: [
                    Color(red: 0, green: 122/255, blue: 1).opacity(0.05),
                    Color(UIColor.systemBackground)
                ],
                startPoint: .top,
                endPoint: .bottom
            )
        )
        .fullScreenCover(isPresented: $showRegisterView) {
            RegisterView()
        }
        .fullScreenCover(isPresented: $showLoginView) {
            LoginView()
        }
    }

    // MARK: - View Components

    private var headerSection: some View {
        VStack(spacing: 20) {
            // App Icon
            ZStack {
                Circle()
                    .fill(
                        LinearGradient(
                            colors: [
                                Color(red: 0, green: 122/255, blue: 1),
                                Color(red: 0, green: 122/255, blue: 1).opacity(0.7)
                            ],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        )
                    )
                    .frame(width: 100, height: 100)
                    .shadow(color: Color(red: 0, green: 122/255, blue: 1).opacity(0.3),
                            radius: 20, x: 0, y: 10)

                Image(systemName: "message.circle.fill")
                    .font(.system(size: 50))
                    .foregroundColor(.white)
            }
            .accessibilityLabel("Meeshy app icon")

            // Title
            VStack(spacing: 8) {
                Text("Welcome to Meeshy")
                    .font(.system(size: 34, weight: .bold))
                    .foregroundColor(.primary)

                Text("Connect with anyone, anywhere")
                    .font(.system(size: 17))
                    .foregroundColor(.secondary)
            }
        }
        .padding(.top, 20)
    }

    private var featuresSection: some View {
        VStack(spacing: 24) {
            FeatureRow(
                icon: "bubble.left.and.bubble.right.fill",
                iconColor: Color(red: 0, green: 122/255, blue: 1),
                title: "Real-time Messaging",
                description: "Chat instantly with friends and family"
            )

            FeatureRow(
                icon: "globe",
                iconColor: Color(red: 52/255, green: 199/255, blue: 89/255),
                title: "Auto Translation",
                description: "Break language barriers with AI translation"
            )

            FeatureRow(
                icon: "video.fill",
                iconColor: Color(red: 175/255, green: 82/255, blue: 222/255),
                title: "Video & Voice Calls",
                description: "Crystal clear calls with anyone"
            )
        }
        .padding(.vertical, 40)
    }

    private var buttonsSection: some View {
        VStack(spacing: 12) {
            AuthButton(
                title: "Get Started",
                style: .primary
            ) {
                showRegisterView = true
            }

            Button(action: {
                showLoginView = true
            }) {
                Text("I have an account")
                    .font(.system(size: 17, weight: .medium))
                    .foregroundColor(.secondary)
                    .frame(maxWidth: .infinity)
                    .frame(height: 44)
            }
        }
    }
}

// MARK: - Feature Row

private struct FeatureRow: View {
    let icon: String
    let iconColor: Color
    let title: String
    let description: String

    var body: some View {
        HStack(alignment: .top, spacing: 16) {
            // Icon
            ZStack {
                Circle()
                    .fill(iconColor.opacity(0.15))
                    .frame(width: 56, height: 56)

                Image(systemName: icon)
                    .font(.system(size: 24))
                    .foregroundColor(iconColor)
            }
            .accessibilityHidden(true)

            // Content
            VStack(alignment: .leading, spacing: 4) {
                Text(title)
                    .font(.system(size: 18, weight: .semibold))
                    .foregroundColor(.primary)

                Text(description)
                    .font(.system(size: 15))
                    .foregroundColor(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }

            Spacer()
        }
        .accessibilityElement(children: .combine)
    }
}

// MARK: - Preview

#Preview {
    WelcomeView()
}
