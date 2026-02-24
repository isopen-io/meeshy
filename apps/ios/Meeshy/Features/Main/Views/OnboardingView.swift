import SwiftUI
import MeeshySDK
import MeeshyUI
import os
import UserNotifications

// MARK: - Onboarding Page Model

private struct OnboardingPage: Identifiable {
    let id: Int
    let icon: String
    let title: String
    let subtitle: String
    let accentColor: Color
    let gradientColors: (dark: [Color], light: [Color])
}

// MARK: - Onboarding View

struct OnboardingView: View {
    @ObservedObject private var theme = ThemeManager.shared
    @Binding var hasCompletedOnboarding: Bool

    @State private var currentPage = 0
    @State private var animateIcon = false

    private let logger = Logger(subsystem: "com.meeshy.app", category: "onboarding")

    private var isDark: Bool { theme.mode.isDark }

    private let pages: [OnboardingPage] = [
        OnboardingPage(
            id: 0,
            icon: "message.fill",
            title: "Bienvenue sur Meeshy",
            subtitle: "La messagerie nouvelle generation",
            accentColor: MeeshyColors.coral,
            gradientColors: (
                dark: [Color(hex: "2A0A0A"), Color(hex: "1A0533"), Color(hex: "0F0F14")],
                light: [Color(hex: "FFF0EE"), Color(hex: "F5EEFF"), Color(hex: "F8F6F2")]
            )
        ),
        OnboardingPage(
            id: 1,
            icon: "globe.badge.chevron.backward",
            title: "Traduction instantanee",
            subtitle: "Parlez dans votre langue, vos amis lisent dans la leur",
            accentColor: MeeshyColors.cyan,
            gradientColors: (
                dark: [Color(hex: "031A19"), Color(hex: "0A3D3A"), Color(hex: "0F0F14")],
                light: [Color(hex: "E8FFFE"), Color(hex: "D4FDFB"), Color(hex: "F8F6F2")]
            )
        ),
        OnboardingPage(
            id: 2,
            icon: "waveform.and.person.filled",
            title: "Votre voix, leurs langues",
            subtitle: "Le clonage vocal traduit vos messages audio avec votre propre voix",
            accentColor: MeeshyColors.purple,
            gradientColors: (
                dark: [Color(hex: "1A0533"), Color(hex: "2D1B69"), Color(hex: "0F0F14")],
                light: [Color(hex: "F5EEFF"), Color(hex: "EDE0FF"), Color(hex: "F8F6F2")]
            )
        ),
        OnboardingPage(
            id: 3,
            icon: "lock.shield.fill",
            title: "Pret a commencer ?",
            subtitle: "Vos conversations sont chiffrees de bout en bout",
            accentColor: MeeshyColors.green,
            gradientColors: (
                dark: [Color(hex: "0A1A0A"), Color(hex: "1A3A1A"), Color(hex: "0F0F14")],
                light: [Color(hex: "EFFFEF"), Color(hex: "DFFFDF"), Color(hex: "F8F6F2")]
            )
        )
    ]

    var body: some View {
        ZStack {
            animatedBackground
                .ignoresSafeArea()

            VStack(spacing: 0) {
                skipButton

                TabView(selection: $currentPage) {
                    ForEach(pages) { page in
                        pageContent(page)
                            .tag(page.id)
                    }
                }
                .tabViewStyle(.page(indexDisplayMode: .never))

                pageIndicators
                    .padding(.bottom, MeeshySpacing.lg)

                actionButton
                    .padding(.horizontal, MeeshySpacing.xxxl)
                    .padding(.bottom, MeeshySpacing.xxxl + MeeshySpacing.lg)
            }
        }
        .onChange(of: currentPage) { _, _ in
            HapticFeedback.light()
            animateIcon = false
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) {
                withAnimation(.spring(response: 0.6, dampingFraction: 0.7)) {
                    animateIcon = true
                }
            }
        }
        .onAppear {
            withAnimation(.spring(response: 0.6, dampingFraction: 0.7).delay(0.3)) {
                animateIcon = true
            }
        }
    }

    // MARK: - Animated Background

    private var animatedBackground: some View {
        let gradientColors = isDark
            ? pages[currentPage].gradientColors.dark
            : pages[currentPage].gradientColors.light

        return ZStack {
            LinearGradient(
                colors: gradientColors,
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
            .animation(.easeInOut(duration: 0.8), value: currentPage)

            ambientOrbs
        }
    }

    private var ambientOrbs: some View {
        let orbConfigs: [(color: String, size: CGFloat, offset: CGPoint)] = [
            ("A855F7", 200, CGPoint(x: -80, y: -200)),
            ("08D9D6", 160, CGPoint(x: 90, y: 180)),
            ("FF2E63", 120, CGPoint(x: 60, y: -80))
        ]

        return ForEach(Array(orbConfigs.enumerated()), id: \.offset) { _, orb in
            Circle()
                .fill(Color(hex: orb.color).opacity(isDark ? 0.12 : 0.08))
                .frame(width: orb.size, height: orb.size)
                .blur(radius: orb.size * 0.3)
                .offset(x: orb.offset.x, y: orb.offset.y)
                .floating(range: 12, duration: 5.0)
        }
    }

    // MARK: - Skip Button

    private var skipButton: some View {
        HStack {
            Spacer()
            if currentPage < pages.count - 1 {
                Button {
                    HapticFeedback.light()
                    completeOnboarding()
                } label: {
                    Text("Passer")
                        .font(.system(size: 15, weight: .medium))
                        .foregroundColor(theme.textMuted)
                        .padding(.horizontal, MeeshySpacing.lg)
                        .padding(.vertical, MeeshySpacing.sm)
                }
                .accessibilityLabel("Passer l'introduction")
                .transition(.opacity)
            }
        }
        .padding(.trailing, MeeshySpacing.lg)
        .padding(.top, MeeshySpacing.sm)
        .frame(height: 44)
        .animation(MeeshyAnimation.springDefault, value: currentPage)
    }

    // MARK: - Page Content

    private func pageContent(_ page: OnboardingPage) -> some View {
        VStack(spacing: MeeshySpacing.xxl) {
            Spacer()

            ZStack {
                Circle()
                    .fill(page.accentColor.opacity(0.15))
                    .frame(width: 140, height: 140)

                if page.id == 0 {
                    AnimatedLogoView(
                        color: isDark ? .white : Color(hex: "1C1917"),
                        lineWidth: 10,
                        continuous: false
                    )
                    .frame(width: 80, height: 80)
                } else {
                    Image(systemName: page.icon)
                        .font(.system(size: 80, weight: .light))
                        .foregroundStyle(iconGradient(for: page.id))
                }
            }
            .scaleEffect(animateIcon && currentPage == page.id ? 1 : 0.3)
            .opacity(animateIcon && currentPage == page.id ? 1 : 0)

            VStack(spacing: MeeshySpacing.md) {
                Text(page.title)
                    .font(.system(size: 28, weight: .bold, design: .rounded))
                    .foregroundColor(theme.textPrimary)
                    .multilineTextAlignment(.center)

                Text(page.subtitle)
                    .font(.system(size: 16, weight: .medium))
                    .foregroundColor(theme.textMuted)
                    .multilineTextAlignment(.center)
                    .lineSpacing(4)
                    .frame(maxWidth: 250)
            }

            Spacer()
            Spacer()
        }
        .accessibilityElement(children: .combine)
    }

    private func iconGradient(for pageId: Int) -> LinearGradient {
        switch pageId {
        case 0:
            return LinearGradient(
                colors: [MeeshyColors.coral, Color(hex: "FF8A80")],
                startPoint: .topLeading, endPoint: .bottomTrailing
            )
        case 1:
            return LinearGradient(
                colors: [MeeshyColors.cyan, MeeshyColors.teal],
                startPoint: .topLeading, endPoint: .bottomTrailing
            )
        case 2:
            return LinearGradient(
                colors: [MeeshyColors.purple, Color(hex: "8B5CF6")],
                startPoint: .topLeading, endPoint: .bottomTrailing
            )
        case 3:
            return LinearGradient(
                colors: [MeeshyColors.green, Color(hex: "22C55E")],
                startPoint: .topLeading, endPoint: .bottomTrailing
            )
        default:
            return LinearGradient(
                colors: [MeeshyColors.coral, MeeshyColors.cyan],
                startPoint: .topLeading, endPoint: .bottomTrailing
            )
        }
    }

    // MARK: - Page Indicators

    private var pageIndicators: some View {
        HStack(spacing: MeeshySpacing.sm) {
            ForEach(pages) { page in
                Capsule()
                    .fill(
                        currentPage == page.id
                            ? AnyShapeStyle(iconGradient(for: page.id))
                            : AnyShapeStyle(theme.textMuted.opacity(0.3))
                    )
                    .frame(
                        width: currentPage == page.id ? 24 : 8,
                        height: 8
                    )
                    .animation(MeeshyAnimation.springDefault, value: currentPage)
            }
        }
    }

    // MARK: - Action Button

    private var actionButton: some View {
        let isLastPage = currentPage == pages.count - 1

        return Button {
            HapticFeedback.medium()
            if isLastPage {
                completeOnboarding()
            } else {
                withAnimation(MeeshyAnimation.springDefault) {
                    currentPage += 1
                }
            }
        } label: {
            ZStack {
                RoundedRectangle(cornerRadius: MeeshyRadius.md)
                    .fill(
                        isLastPage
                            ? LinearGradient(
                                colors: [MeeshyColors.coral, MeeshyColors.cyan],
                                startPoint: .leading,
                                endPoint: .trailing
                            )
                            : buttonGradient
                    )
                    .frame(height: 52)
                    .shadow(
                        color: buttonShadowColor.opacity(isDark ? 0.4 : 0.2),
                        radius: 12,
                        y: 6
                    )

                HStack(spacing: MeeshySpacing.sm) {
                    Text(isLastPage ? "Commencer" : "Suivant")
                        .font(.system(size: MeeshyFont.headlineSize, weight: .bold))

                    Image(systemName: isLastPage ? "arrow.right" : "chevron.right")
                        .font(.system(size: MeeshyFont.subheadSize, weight: .semibold))
                }
                .foregroundColor(.white)
            }
        }
        .pressable()
        .animation(.easeInOut(duration: 0.5), value: currentPage)
        .accessibilityLabel(isLastPage ? "Commencer a utiliser Meeshy" : "Page suivante")
    }

    private var buttonGradient: LinearGradient {
        switch currentPage {
        case 0:
            return LinearGradient(
                colors: [MeeshyColors.coral, Color(hex: "E55555")],
                startPoint: .leading, endPoint: .trailing
            )
        case 1:
            return LinearGradient(
                colors: [MeeshyColors.cyan, Color(hex: "06B6B3")],
                startPoint: .leading, endPoint: .trailing
            )
        case 2:
            return LinearGradient(
                colors: [MeeshyColors.purple, Color(hex: "8B5CF6")],
                startPoint: .leading, endPoint: .trailing
            )
        default:
            return LinearGradient(
                colors: [MeeshyColors.green, Color(hex: "22C55E")],
                startPoint: .leading, endPoint: .trailing
            )
        }
    }

    private var buttonShadowColor: Color {
        switch currentPage {
        case 0: return MeeshyColors.coral
        case 1: return MeeshyColors.cyan
        case 2: return MeeshyColors.purple
        default: return MeeshyColors.green
        }
    }

    // MARK: - Completion

    private func completeOnboarding() {
        HapticFeedback.success()
        logger.info("Onboarding completed, requesting notification permission")
        requestNotificationPermission()
        withAnimation(MeeshyAnimation.springDefault) {
            hasCompletedOnboarding = true
        }
    }

    private func requestNotificationPermission() {
        UNUserNotificationCenter.current().requestAuthorization(
            options: [.alert, .badge, .sound]
        ) { [logger] granted, error in
            if let error {
                logger.error("Notification permission error: \(error.localizedDescription)")
            } else {
                logger.info("Notification permission granted: \(granted)")
            }
        }
    }
}
