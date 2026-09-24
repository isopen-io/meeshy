import SwiftUI
import MeeshySDK
import MeeshyUI

/// Les illustrations des cartes. Toutes DÉCORATIVES (masquées à VoiceOver par
/// le gabarit) et toutes soumises à Reduce Motion : sous ce réglage, chacune
/// est POSÉE dans son état le plus parlant — aucune rotation, aucun anneau qui
/// se remplit. Une animation « plus lente » reste une animation.
private struct OnboardingMotion: ViewModifier {
    @Environment(\.accessibilityReduceMotion) private var systemReduce
    @Environment(\.meeshyForceReduceMotion) private var userForced
    let perform: (Bool) -> Void

    func body(content: Content) -> some View {
        content.onAppear { perform(MeeshyMotion.shouldReduce(system: systemReduce, userForced: userForced)) }
    }
}

private extension View {
    func onboardingMotion(_ perform: @escaping (Bool) -> Void) -> some View {
        modifier(OnboardingMotion(perform: perform))
    }
}

// MARK: - 1. Le Prisme, montré en deux secondes

/// Une bulle « Hola, ¿qué tal? » qui se retourne et devient « Salut, ça va ? ».
/// L'original est un TEXTE (verbatim), jamais une clé : traduit par le
/// catalogue, il deviendrait la traduction de lui-même (#4313).
struct OnboardingPrismIllustration: View {
    let isDark: Bool

    @Environment(\.accessibilityReduceMotion) private var systemReduce
    @Environment(\.meeshyForceReduceMotion) private var userForced
    @State private var flipped = false

    private var interfaceLanguage: String { OnboardingGreeting.contentLanguage }
    private var originalLanguage: String { interfaceLanguage == "es" ? "en" : "es" }
    private var originalText: String { originalLanguage == "es" ? "Hola, ¿qué tal?" : "Hi, how are you?" }
    private var translatedText: String { String(localized: "onboarding.languages.demo.translated", bundle: .main) }

    private var reduce: Bool { MeeshyMotion.shouldReduce(system: systemReduce, userForced: userForced) }

    var body: some View {
        ZStack {
            orbit
            if reduce {
                VStack(spacing: MeeshySpacing.sm) {
                    bubble(text: originalText, language: originalLanguage, translated: false).opacity(0.55).scaleEffect(0.9)
                    Image(systemName: "arrow.down")
                        .font(MeeshyFont.relative(MeeshyFont.headlineSize, weight: .bold))
                        .foregroundStyle(MeeshyColors.indigo400)
                    bubble(text: translatedText, language: interfaceLanguage, translated: true)
                }
            } else {
                ZStack {
                    bubble(text: originalText, language: originalLanguage, translated: false)
                        .opacity(flipped ? 0 : 1)
                    bubble(text: translatedText, language: interfaceLanguage, translated: true)
                        .rotation3DEffect(.degrees(180), axis: (x: 0, y: 1, z: 0))
                        .opacity(flipped ? 1 : 0)
                }
                .rotation3DEffect(.degrees(flipped ? 180 : 0), axis: (x: 0, y: 1, z: 0), perspective: 0.5)
            }
        }
        .task {
            guard !reduce else { return }
            while !Task.isCancelled {
                do { try await Task.sleep(nanoseconds: 1_800_000_000) } catch { return }
                withAnimation(.spring(response: 0.7, dampingFraction: 0.75)) { flipped.toggle() }
            }
        }
    }

    private var orbit: some View {
        ZStack {
            Circle()
                .stroke(MeeshyColors.indigo300.opacity(isDark ? 0.25 : 0.4), style: StrokeStyle(lineWidth: 1, dash: [4, 6]))
                .frame(width: 210, height: 210)
            ForEach(Self.orbitFlags, id: \.flag) { item in
                Text(verbatim: item.flag)
                    .font(MeeshyFont.relative(MeeshyFont.titleSize))
                    .padding(6)
                    .background(Circle().fill(isDark ? MeeshyColors.indigo950 : Color.white))
                    .shadow(color: MeeshyColors.indigo700.opacity(0.18), radius: 6, y: 2)
                    .offset(item.offset)
            }
        }
    }

    /// Quatre drapeaux posés sur l'orbite, aux diagonales.
    private static let orbitFlags: [(flag: String, offset: CGSize)] = [
        ("🇯🇵", CGSize(width: 74, height: 74)),
        ("🇧🇷", CGSize(width: -74, height: 74)),
        ("🇩🇪", CGSize(width: -74, height: -74)),
        ("🇸🇳", CGSize(width: 74, height: -74)),
    ]

    private func bubble(text: String, language: String, translated: Bool) -> some View {
        HStack(spacing: MeeshySpacing.sm) {
            Text(verbatim: LanguageFlagChip.flag(for: language))
            Text(verbatim: text)
                .font(MeeshyFont.relative(MeeshyFont.headlineSize, weight: .semibold, design: .rounded))
                .foregroundStyle(translated ? Color.white : MeeshyColors.textPrimary(isDark: isDark))
            if translated {
                Image(systemName: "translate")
                    .font(MeeshyFont.relative(MeeshyFont.subheadSize, weight: .bold))
                    .foregroundStyle(.white.opacity(0.85))
            }
        }
        .padding(.horizontal, MeeshySpacing.lg)
        .padding(.vertical, MeeshySpacing.md)
        .background(
            RoundedRectangle(cornerRadius: 22, style: .continuous)
                .fill(translated
                      ? AnyShapeStyle(MeeshyColors.brandGradient)
                      : AnyShapeStyle(isDark ? Color.white.opacity(0.10) : Color.white))
        )
        .shadow(color: MeeshyColors.indigo700.opacity(0.2), radius: 12, y: 6)
    }
}

// MARK: - 2. Le salon Meeshy Global

struct OnboardingGlobalIllustration: View {
    let isDark: Bool

    @ScaledMetric(relativeTo: .largeTitle) private var globeSize: CGFloat = 60

    @State private var appeared = false

    private var samples: [(flag: String, text: String)] {
        [
            ("🇧🇷", String(localized: "onboarding.global.sample.1", bundle: .main)),
            ("🇯🇵", String(localized: "onboarding.global.sample.2", bundle: .main)),
            ("🇩🇪", String(localized: "onboarding.global.sample.3", bundle: .main)),
        ]
    }

    var body: some View {
        ZStack {
            Circle()
                .fill(MeeshyColors.brandGradient)
                .frame(width: 118, height: 118)
                .shadow(color: MeeshyColors.indigo500.opacity(0.45), radius: 24, y: 10)
            Image(systemName: "globe.europe.africa.fill")
                .resizable()
                .scaledToFit()
                .frame(width: min(globeSize, 84), height: min(globeSize, 84))
                .foregroundStyle(.white)
            VStack(spacing: 70) {
                sampleBubble(samples[0]).offset(x: -60)
                sampleBubble(samples[1]).offset(x: 70)
            }
            sampleBubble(samples[2]).offset(x: -40, y: 88)
        }
        .frame(height: 210)
        .scaleEffect(appeared ? 1 : 0.92)
        .opacity(appeared ? 1 : 0)
        .onboardingMotion { reduce in
            guard !reduce else { appeared = true; return }
            withAnimation(.spring(response: 0.6, dampingFraction: 0.7)) { appeared = true }
        }
    }

    private func sampleBubble(_ sample: (flag: String, text: String)) -> some View {
        HStack(spacing: 6) {
            Text(verbatim: sample.flag)
            Text(sample.text)
                .font(MeeshyFont.relative(MeeshyFont.subheadSize, weight: .medium, design: .rounded))
                .foregroundStyle(MeeshyColors.textPrimary(isDark: isDark))
                .lineLimit(1)
        }
        .padding(.horizontal, MeeshySpacing.md)
        .padding(.vertical, MeeshySpacing.sm)
        .background(Capsule().fill(isDark ? MeeshyColors.indigo950.opacity(0.9) : Color.white))
        .overlay(Capsule().stroke(MeeshyColors.indigo200.opacity(isDark ? 0.2 : 0.8), lineWidth: 1))
        .shadow(color: MeeshyColors.indigo700.opacity(0.15), radius: 8, y: 3)
    }
}

// MARK: - 3. L'anneau de story

struct OnboardingStoryIllustration: View {
    let name: String
    let isDark: Bool

    @State private var ring: CGFloat = 0

    var body: some View {
        ZStack {
            Circle()
                .stroke(isDark ? Color.white.opacity(0.10) : MeeshyColors.indigo100, lineWidth: 7)
                .frame(width: 140, height: 140)
            Circle()
                .trim(from: 0, to: ring)
                .stroke(MeeshyColors.avatarRingGradient, style: StrokeStyle(lineWidth: 7, lineCap: .round))
                .rotationEffect(.degrees(-90))
                .frame(width: 140, height: 140)
            MeeshyAvatar(name: name, context: .profileBanner, isDark: isDark)
                .allowsHitTesting(false)
            Image(systemName: "plus.circle.fill")
                .symbolRenderingMode(.palette)
                .foregroundStyle(.white, MeeshyColors.indigo500)
                .font(MeeshyFont.relative(MeeshyFont.largeTitleSize - 4))
                .offset(x: 50, y: 50)
            Text(String(localized: "onboarding.story.badge", bundle: .main))
                .font(MeeshyFont.relative(MeeshyFont.footnoteSize, weight: .bold, design: .rounded))
                .foregroundStyle(.white)
                .padding(.horizontal, MeeshySpacing.sm)
                .padding(.vertical, 4)
                .background(Capsule().fill(MeeshyColors.warning))
                .offset(x: -58, y: -52)
        }
        .frame(height: 170)
        .onboardingMotion { reduce in
            guard !reduce else { ring = 1; return }
            withAnimation(.easeInOut(duration: 1.6).delay(0.2)) { ring = 1 }
        }
    }
}

// MARK: - 4. La bande

struct OnboardingFriendsIllustration: View {
    let names: [String]
    let isDark: Bool

    var body: some View {
        ZStack {
            HStack(spacing: -18) {
                ForEach(Array(names.prefix(3).enumerated()), id: \.offset) { _, name in
                    MeeshyAvatar(name: name, context: .conversationList, isDark: isDark)
                        .overlay(Circle().stroke(isDark ? MeeshyColors.indigo950 : Color.white, lineWidth: 3))
                        .allowsHitTesting(false)
                }
            }
            Text(String.localizedStringWithFormat(String(localized: "onboarding.friends.badge", bundle: .main), OnboardingRewards.friendship))
                .font(MeeshyFont.relative(MeeshyFont.subheadSize, weight: .heavy, design: .rounded))
                .foregroundStyle(.white)
                .padding(.horizontal, MeeshySpacing.md)
                .padding(.vertical, 6)
                .background(Capsule().fill(MeeshyColors.success))
                .offset(x: 64, y: -40)
        }
        .frame(height: 110)
    }
}

// MARK: - 5. La cloche

struct OnboardingNotificationIllustration: View {
    let isDark: Bool

    @ScaledMetric(relativeTo: .largeTitle) private var bellSize: CGFloat = 72

    @State private var ring = false

    var body: some View {
        VStack(spacing: MeeshySpacing.lg) {
            ZStack(alignment: .topTrailing) {
                Image(systemName: "bell.fill")
                    .resizable()
                    .scaledToFit()
                    .frame(width: min(bellSize, 110), height: min(bellSize, 110))
                    .foregroundStyle(MeeshyColors.brandGradient)
                    .rotationEffect(.degrees(ring ? 12 : 0), anchor: .top)
                Circle()
                    .fill(MeeshyColors.error)
                    .frame(width: 22, height: 22)
                    .overlay(Circle().stroke(Color.white, lineWidth: 3))
                    .offset(x: 6, y: -4)
            }
            HStack(spacing: MeeshySpacing.md) {
                RoundedRectangle(cornerRadius: 9, style: .continuous)
                    .fill(MeeshyColors.brandGradient)
                    .frame(width: 34, height: 34)
                    .overlay(Image(systemName: "bubble.left.and.bubble.right.fill").foregroundStyle(.white).font(.caption))
                Text(String(localized: "onboarding.notifications.sample", bundle: .main))
                    .font(MeeshyFont.relative(MeeshyFont.subheadSize, weight: .medium))
                    .foregroundStyle(MeeshyColors.textPrimary(isDark: isDark))
                    .fixedSize(horizontal: false, vertical: true)
                Spacer(minLength: 0)
            }
            .padding(MeeshySpacing.md)
            .background(RoundedRectangle(cornerRadius: 18, style: .continuous).fill(.regularMaterial))
            .shadow(color: MeeshyColors.indigo700.opacity(0.15), radius: 10, y: 4)
        }
        .onboardingMotion { reduce in
            guard !reduce else { return }
            withAnimation(.spring(response: 0.25, dampingFraction: 0.25).delay(0.3)) { ring = true }
            withAnimation(.spring(response: 0.4, dampingFraction: 0.5).delay(0.7)) { ring = false }
        }
    }
}

// MARK: - Récapitulatif

struct OnboardingTrophyIllustration: View {
    @State private var appeared = false
    @ScaledMetric(relativeTo: .largeTitle) private var trophySize: CGFloat = 56

    var body: some View {
        ZStack {
            Circle()
                .fill(MeeshyColors.brandGradient)
                .frame(width: 124, height: 124)
                .shadow(color: MeeshyColors.indigo500.opacity(0.5), radius: 28, y: 12)
            Image(systemName: "trophy.fill")
                .resizable()
                .scaledToFit()
                .frame(width: min(trophySize, 80), height: min(trophySize, 80))
                .foregroundStyle(MeeshyColors.warning)
            Image(systemName: "sparkles")
                .font(MeeshyFont.relative(MeeshyFont.largeTitleSize))
                .foregroundStyle(MeeshyColors.warning)
                .offset(x: 72, y: -54)
            Image(systemName: "sparkle")
                .font(MeeshyFont.relative(MeeshyFont.titleSize))
                .foregroundStyle(MeeshyColors.indigo300)
                .offset(x: -74, y: 40)
        }
        .frame(height: 160)
        .scaleEffect(appeared ? 1 : 0.6)
        .onboardingMotion { reduce in
            guard !reduce else { appeared = true; return }
            withAnimation(.spring(response: 0.55, dampingFraction: 0.55)) { appeared = true }
        }
    }
}
