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

    private let logger = Logger(subsystem: "me.meeshy.app", category: "onboarding")

    private var isDark: Bool { theme.mode.isDark }

    private let pages: [OnboardingPage] = [
        OnboardingPage(
            id: 0,
            icon: "message.fill",
            title: "Bienvenue sur Meeshy",
            subtitle: "Le reseau social ou la langue n'est plus une barriere",
            accentColor: MeeshyColors.coral,
            gradientColors: (
                dark: [Color(hex: "2A0A0A"), Color(hex: "1A0533"), Color(hex: "0F0F14")],
                light: [Color(hex: "FFF0EE"), Color(hex: "F5EEFF"), Color(hex: "F8F6F2")]
            )
        ),
        OnboardingPage(
            id: 1,
            icon: "globe.badge.chevron.backward",
            title: "100+ langues, zero barriere",
            subtitle: "Discutez avec le monde entier dans votre langue — traduction instantanee et invisible",
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
            subtitle: "Envoyez un vocal en francais, vos amis l'ecoutent dans leur langue avec votre voix",
            accentColor: MeeshyColors.purple,
            gradientColors: (
                dark: [Color(hex: "1A0533"), Color(hex: "2D1B69"), Color(hex: "0F0F14")],
                light: [Color(hex: "F5EEFF"), Color(hex: "EDE0FF"), Color(hex: "F8F6F2")]
            )
        ),
        OnboardingPage(
            id: 3,
            icon: "lock.shield.fill",
            title: "Privee par nature",
            subtitle: "Chiffrement de bout en bout — vos conversations restent les votres",
            accentColor: MeeshyColors.green,
            gradientColors: (
                dark: [Color(hex: "0A1A0A"), Color(hex: "1A3A1A"), Color(hex: "0F0F14")],
                light: [Color(hex: "EFFFEF"), Color(hex: "DFFFDF"), Color(hex: "F8F6F2")]
            )
        ),
        OnboardingPage(
            id: 4,
            icon: "bubble.left.and.bubble.right.fill",
            title: "Meeshy en action",
            subtitle: "",
            accentColor: MeeshyColors.cyan,
            gradientColors: (
                dark: [Color(hex: "0A1020"), Color(hex: "1A0A2E"), Color(hex: "0F0F14")],
                light: [Color(hex: "F0F5FF"), Color(hex: "FFF5F0"), Color(hex: "F8F6F2")]
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
                .bounceOnTap(scale: 0.94)
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
        VStack(spacing: page.id == 4 ? MeeshySpacing.lg : MeeshySpacing.xxl) {
            Spacer()

            if page.id == 4 {
                mockConversationPreview
                    .scaleEffect(animateIcon && currentPage == page.id ? 1 : 0.85)
                    .opacity(animateIcon && currentPage == page.id ? 1 : 0)
            } else {
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
                        .frame(width: 120, height: 120)
                    } else {
                        Image(systemName: page.icon)
                            .font(.system(size: 80, weight: .light))
                            .foregroundStyle(iconGradient(for: page.id))
                    }
                }
                .scaleEffect(animateIcon && currentPage == page.id ? 1 : 0.3)
                .opacity(animateIcon && currentPage == page.id ? 1 : 0)
            }

            VStack(spacing: MeeshySpacing.md) {
                Text(page.title)
                    .font(.system(size: 28, weight: .bold, design: .rounded))
                    .foregroundColor(theme.textPrimary)
                    .multilineTextAlignment(.center)

                if !page.subtitle.isEmpty {
                    Text(page.subtitle)
                        .font(.system(size: 16, weight: .medium))
                        .foregroundColor(theme.textMuted)
                        .multilineTextAlignment(.center)
                        .lineSpacing(4)
                        .frame(maxWidth: 250)
                }
            }

            Spacer()
            if page.id != 4 { Spacer() }
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

    // MARK: - Demo Conversation Data

    private var demoBilingualMessage: Message {
        MeeshyMessage(
            id: "demo-bilingual",
            conversationId: "demo-conv",
            senderId: "user-carlos",
            content: "¡Hola! ¿Qué tal todo?",
            originalLanguage: "es",
            createdAt: Date(),
            senderName: "Carlos",
            senderColor: "FF6B35",
            deliveryStatus: .read
        )
    }

    private var demoBilingualTranslation: MessageTranslation {
        MessageTranslation(
            id: "trans-bilingual",
            messageId: "demo-bilingual",
            sourceLanguage: "es",
            targetLanguage: "fr",
            translatedContent: "Salut ! Comment ça va ?",
            translationModel: "NLLB-200",
            confidenceScore: 0.95
        )
    }

    private var demoAudioMessage: Message {
        MeeshyMessage(
            id: "demo-audio",
            conversationId: "demo-conv",
            content: "",
            messageType: .audio,
            createdAt: Date().addingTimeInterval(-30),
            attachments: [
                MeeshyMessageAttachment(
                    id: "att-audio",
                    originalName: "vocal.m4a",
                    mimeType: "audio/mp4",
                    fileSize: 98000,
                    fileUrl: "",
                    duration: 8500,
                    sampleRate: 44100,
                    codec: "AAC",
                    channels: 1,
                    uploadedBy: "me",
                    thumbnailColor: "A855F7"
                )
            ],
            senderName: "Vous",
            senderColor: "A855F7",
            deliveryStatus: .delivered,
            isMe: true
        )
    }

    private var demoTranscription: MessageTranscription {
        MessageTranscription(
            attachmentId: "att-audio",
            text: "Je suis vraiment content de vous rencontrer",
            language: "fr",
            confidence: 0.92,
            durationMs: 8500,
            segments: [
                MessageTranscriptionSegment(text: "Je", startTime: 0, endTime: 0.3),
                MessageTranscriptionSegment(text: "suis", startTime: 0.3, endTime: 0.7),
                MessageTranscriptionSegment(text: "vraiment", startTime: 0.7, endTime: 1.3),
                MessageTranscriptionSegment(text: "content", startTime: 1.3, endTime: 1.8),
                MessageTranscriptionSegment(text: "de", startTime: 1.8, endTime: 2.0),
                MessageTranscriptionSegment(text: "vous", startTime: 2.0, endTime: 2.4),
                MessageTranscriptionSegment(text: "rencontrer", startTime: 2.4, endTime: 3.2)
            ]
        )
    }

    private var demoBlurMessage: Message {
        MeeshyMessage(
            id: "demo-blur",
            conversationId: "demo-conv",
            senderId: "user-yuki",
            content: "明日の午後、カフェで会えますか？楽しみにしています",
            originalLanguage: "ja",
            isBlurred: true,
            createdAt: Date().addingTimeInterval(-60),
            senderName: "Yuki",
            senderColor: "A855F7"
        )
    }

    // MARK: - Mock Conversation Preview

    private var mockConversationPreview: some View {
        VStack(spacing: 4) {
            ThemedMessageBubble(
                message: demoBilingualMessage,
                contactColor: "FF6B35",
                textTranslations: [demoBilingualTranslation],
                preferredTranslation: demoBilingualTranslation,
                showAvatar: true
            )

            ThemedMessageBubble(
                message: demoAudioMessage,
                contactColor: "A855F7",
                transcription: demoTranscription,
                showAvatar: false
            )

            ThemedMessageBubble(
                message: demoBlurMessage,
                contactColor: "A855F7",
                showAvatar: true
            )
        }
        .padding(.horizontal, 8)
        .allowsHitTesting(false)
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
        case 3: return MeeshyColors.green
        default: return MeeshyColors.cyan
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
