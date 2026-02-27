//
//  ConversationAnimatedBackground.swift
//  Meeshy
//
//  Migrated from v1 to v2 design system.
//  Composable animated background for conversations:
//  - Base animation from conversation type (direct, group, community, global)
//  - Encryption overlay (server-side or E2EE)
//  - Multilingual overlay (orbiting flags)
//  - Floating particles + wave overlay
//

import SwiftUI
import MeeshySDK
import MeeshyUI

// MARK: - Configuration

struct ConversationBackgroundConfig {
    let conversationType: Conversation.ConversationType
    let isEncrypted: Bool
    let isE2EEncrypted: Bool
    let memberCount: Int
    let topLanguages: [String]
    let accentHex: String
    let secondaryHex: String
    let isDarkMode: Bool
    let groupEndHex: String
    let groupColorFadeDuration: Double

    var accentColor: Color { Color(hex: accentHex) }
    var secondaryColor: Color { Color(hex: secondaryHex) }
    var groupStartColor: Color { Color(hex: accentHex) }
    var groupEndColor: Color { Color(hex: groupEndHex) }

    init(
        conversationType: Conversation.ConversationType = .direct,
        isEncrypted: Bool = false,
        isE2EEncrypted: Bool = false,
        memberCount: Int = 2,
        topLanguages: [String] = [],
        accentHex: String = "FF2E63",
        secondaryHex: String = "08D9D6",
        isDarkMode: Bool = ThemeManager.shared.mode.isDark,
        groupEndHex: String? = nil,
        groupColorFadeDuration: Double = 10.0
    ) {
        self.conversationType = conversationType
        self.isEncrypted = isEncrypted
        self.isE2EEncrypted = isE2EEncrypted
        self.memberCount = memberCount
        self.topLanguages = topLanguages
        self.accentHex = accentHex
        self.secondaryHex = secondaryHex
        self.isDarkMode = isDarkMode
        self.groupEndHex = groupEndHex ?? "9933CC"
        self.groupColorFadeDuration = groupColorFadeDuration
    }

    /// Create config from a v2 Conversation model
    init(from conversation: Conversation, isDarkMode: Bool = ThemeManager.shared.mode.isDark, topLanguages: [String] = []) {
        self.conversationType = conversation.type
        self.isEncrypted = conversation.encryptionMode != nil
        self.isE2EEncrypted = conversation.encryptionMode == "e2ee"
        self.memberCount = conversation.memberCount
        self.topLanguages = topLanguages
        let palette = conversation.colorPalette
        self.accentHex = palette.primary
        self.secondaryHex = palette.secondary
        self.isDarkMode = isDarkMode
        self.groupEndHex = palette.accent
        self.groupColorFadeDuration = 10.0
    }

    // MARK: - Computed

    var baseAnimationStyle: BaseAnimationStyle {
        switch conversationType {
        case .direct:
            return .intimate
        case .group:
            return .group
        case .community:
            return .community
        case .public, .global, .channel:
            return .global
        case .bot:
            return .intimate
        }
    }

    var showEncryptionOverlay: Bool {
        isEncrypted || isE2EEncrypted
    }

    var showMultilingualOverlay: Bool {
        topLanguages.count >= 3
    }

    enum BaseAnimationStyle {
        case intimate
        case group
        case community
        case global
    }
}

// MARK: - Main View

struct ConversationAnimatedBackground: View {
    let config: ConversationBackgroundConfig

    @State private var animate = false
    @State private var wavePhase: CGFloat = 0
    @State private var orbitPhase: CGFloat = 0
    @State private var groupColorPhase: Bool = false

    private var currentGroupColor: Color {
        groupColorPhase ? config.groupEndColor : config.groupStartColor
    }

    var body: some View {
        GeometryReader { geo in
            ZStack {
                baseGradient

                baseAnimation(in: geo.size)
                    .opacity(0.12)

                if config.showEncryptionOverlay {
                    encryptionOverlay(in: geo.size)
                        .opacity(0.12)
                }

                if config.showMultilingualOverlay {
                    multilingualOverlay(in: geo.size)
                        .opacity(0.12)
                }

                floatingParticles(in: geo.size)
                    .opacity(0.12)

                wavesOverlay(in: geo.size)
                    .opacity(0.12)
            }
        }
        .ignoresSafeArea()
        .onAppear { startAnimations() }
    }

    // MARK: - Base Gradient

    private var baseGradient: some View {
        LinearGradient(
            colors: config.isDarkMode ? [
                Color(hex: "0F0C29"),
                config.accentColor.opacity(0.12),
                Color(hex: "24243E")
            ] : [
                config.accentColor.opacity(0.08),
                Color.white.opacity(0.92),
                config.accentColor.opacity(0.05)
            ],
            startPoint: .topLeading,
            endPoint: .bottomTrailing
        )
    }

    // MARK: - Animation Control

    private func startAnimations() {
        animate = false
        wavePhase = 0
        orbitPhase = 0
        groupColorPhase = false

        DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) {
            withAnimation(.easeInOut(duration: 2.5).repeatForever(autoreverses: true)) {
                animate = true
            }
            withAnimation(.linear(duration: 6).repeatForever(autoreverses: false)) {
                wavePhase = .pi * 2
            }
            withAnimation(.linear(duration: 20).repeatForever(autoreverses: false)) {
                orbitPhase = .pi * 2
            }
            withAnimation(.easeInOut(duration: config.groupColorFadeDuration).repeatForever(autoreverses: true)) {
                groupColorPhase = true
            }
        }
    }

    // MARK: - Base Animation (Layer 1)

    @ViewBuilder
    private func baseAnimation(in size: CGSize) -> some View {
        switch config.baseAnimationStyle {
        case .intimate:
            intimateAnimation(in: size)
        case .group:
            groupAnimation(in: size)
        case .community:
            communityAnimation(in: size)
        case .global:
            globalAnimation(in: size)
        }
    }

    // MARK: - Intimate Animation (1:1 Direct)

    private func intimateAnimation(in size: CGSize) -> some View {
        let centerY = size.height * 0.4
        let centerX = size.width * 0.5
        let circleSize: CGFloat = 100
        let circleSpacing: CGFloat = animate ? -15 : -5

        let leftColor = config.accentColor
        let rightColor = config.secondaryColor

        return ZStack {
            // Connection lines to viewport edges
            Rectangle()
                .fill(
                    LinearGradient(
                        colors: [
                            leftColor.opacity(0.05),
                            leftColor.opacity(animate ? 0.18 : 0.10)
                        ],
                        startPoint: .leading,
                        endPoint: .trailing
                    )
                )
                .frame(width: centerX - circleSize / 2 + 20, height: animate ? 6 : 4)
                .position(x: (centerX - circleSize / 2 + 20) / 2, y: centerY)

            Rectangle()
                .fill(
                    LinearGradient(
                        colors: [
                            rightColor.opacity(animate ? 0.18 : 0.10),
                            rightColor.opacity(0.05)
                        ],
                        startPoint: .leading,
                        endPoint: .trailing
                    )
                )
                .frame(width: size.width - centerX - circleSize / 2 + 20, height: animate ? 6 : 4)
                .position(x: centerX + circleSize / 2 - 20 + (size.width - centerX - circleSize / 2 + 20) / 2, y: centerY)

            // Outer glow rings
            HStack(spacing: circleSpacing + 40) {
                Circle()
                    .fill(
                        RadialGradient(
                            colors: [leftColor.opacity(0.18), leftColor.opacity(0.08), Color.clear],
                            center: .center, startRadius: 35, endRadius: 80
                        )
                    )
                    .frame(width: 160, height: 160)
                    .scaleEffect(animate ? 1.12 : 0.95)

                Circle()
                    .fill(
                        RadialGradient(
                            colors: [rightColor.opacity(0.18), rightColor.opacity(0.08), Color.clear],
                            center: .center, startRadius: 35, endRadius: 80
                        )
                    )
                    .frame(width: 160, height: 160)
                    .scaleEffect(animate ? 0.95 : 1.12)
            }
            .position(x: centerX, y: centerY)

            // Two circles close together
            HStack(spacing: circleSpacing) {
                Circle()
                    .fill(leftColor.opacity(0.20))
                    .frame(width: circleSize, height: circleSize)
                    .overlay(Circle().stroke(leftColor.opacity(0.30), lineWidth: 3))
                    .scaleEffect(animate ? 1.10 : 0.94)

                Circle()
                    .fill(rightColor.opacity(0.20))
                    .frame(width: circleSize, height: circleSize)
                    .overlay(Circle().stroke(rightColor.opacity(0.30), lineWidth: 3))
                    .scaleEffect(animate ? 0.94 : 1.10)
            }
            .position(x: centerX, y: centerY)

            // Connection energy at union point
            Circle()
                .fill(
                    RadialGradient(
                        colors: [
                            Color.white.opacity(animate ? 0.25 : 0.12),
                            leftColor.opacity(0.15),
                            rightColor.opacity(0.15),
                            Color.clear
                        ],
                        center: .center, startRadius: 5, endRadius: animate ? 40 : 25
                    )
                )
                .frame(width: 80, height: 80)
                .position(x: centerX, y: centerY)

            // Floating hearts
            ForEach(0..<6, id: \.self) { i in
                Image(systemName: "heart.fill")
                    .font(.system(size: 12 + CGFloat(i % 3) * 4))
                    .foregroundColor(
                        i % 2 == 0 ? leftColor.opacity(0.20) : rightColor.opacity(0.20)
                    )
                    .offset(
                        x: cos(CGFloat(i) * .pi * 2 / 6 + (animate ? 0.5 : 0)) * (60 + CGFloat(i % 2) * 30),
                        y: sin(CGFloat(i) * .pi * 2 / 6 + (animate ? 0.5 : 0)) * (40 + CGFloat(i % 2) * 20)
                    )
            }
            .position(x: centerX, y: centerY)

            // User icons inside circles
            HStack(spacing: circleSpacing) {
                Image(systemName: "person.fill")
                    .font(.system(size: 36))
                    .foregroundColor(leftColor.opacity(0.35))

                Image(systemName: "person.fill")
                    .font(.system(size: 36))
                    .foregroundColor(rightColor.opacity(0.35))
            }
            .position(x: centerX, y: centerY)
        }
        .animation(.easeInOut(duration: 3).repeatForever(autoreverses: true), value: animate)
    }

    // MARK: - Group Animation

    private func groupAnimation(in size: CGSize) -> some View {
        ZStack {
            // Pulse rings from center
            ForEach(0..<3, id: \.self) { i in
                ConvBgPulseRing(index: i, color: currentGroupColor)
            }
            .offset(x: animate ? 8 : -8, y: animate ? 5 : -5)
            .animation(.easeInOut(duration: 3.5).repeatForever(autoreverses: true), value: animate)

            // Central pulsing circle
            groupCentralCircle
                .offset(x: animate ? 8 : -8, y: animate ? 5 : -5)
                .animation(.easeInOut(duration: 3.5).repeatForever(autoreverses: true), value: animate)

            // Fixed placeholder avatars in orbit
            groupFixedAvatars

            // Members badge
            groupMembersBadge
        }
        .position(x: size.width / 2, y: size.height * 0.4)
    }

    private var groupCentralCircle: some View {
        ZStack {
            Circle()
                .fill(
                    RadialGradient(
                        colors: [
                            currentGroupColor.opacity(animate ? 0.20 : 0.10),
                            currentGroupColor.opacity(animate ? 0.08 : 0.03),
                            Color.clear
                        ],
                        center: .center, startRadius: 25, endRadius: animate ? 80 : 65
                    )
                )
                .frame(width: 160, height: 160)
                .animation(.easeInOut(duration: 2.5).repeatForever(autoreverses: true), value: animate)

            Circle()
                .stroke(currentGroupColor.opacity(animate ? 0.35 : 0.20), lineWidth: 3)
                .frame(width: 75, height: 75)
                .scaleEffect(animate ? 1.12 : 0.92)
                .animation(.easeInOut(duration: 2.0).repeatForever(autoreverses: true), value: animate)

            Circle()
                .fill(currentGroupColor.opacity(animate ? 0.12 : 0.06))
                .frame(width: 65, height: 65)
                .scaleEffect(animate ? 1.08 : 0.94)
                .animation(.easeInOut(duration: 2.2).repeatForever(autoreverses: true), value: animate)

            Image(systemName: "person.3.fill")
                .font(.system(size: 24))
                .foregroundColor(currentGroupColor.opacity(0.40))
        }
    }

    private var groupFixedAvatars: some View {
        let avatarCount = min(max(2, Int(Double(config.memberCount) * 0.5)), 8)
        return ZStack {
            ForEach(0..<avatarCount, id: \.self) { i in
                ConvBgFixedAvatar(
                    index: i,
                    totalCount: avatarCount,
                    color: currentGroupColor
                )
            }
        }
    }

    private var groupMembersBadge: some View {
        let avatarCount = min(max(2, Int(Double(config.memberCount) * 0.5)), 8)
        return Group {
            if config.memberCount > avatarCount {
                Text("+\(config.memberCount - avatarCount)")
                    .font(.system(size: 14, weight: .bold))
                    .foregroundColor(currentGroupColor.opacity(0.50))
                    .padding(.horizontal, 10)
                    .padding(.vertical, 5)
                    .background(Capsule().fill(currentGroupColor.opacity(0.12)))
                    .offset(y: 60)
            }
        }
    }

    // MARK: - Community Animation

    private func communityAnimation(in size: CGSize) -> some View {
        ZStack {
            ForEach(0..<4, id: \.self) { i in
                Circle()
                    .stroke(config.accentColor.opacity(0.20 - Double(i) * 0.03), lineWidth: 2)
                    .frame(width: 70 + CGFloat(i) * 50, height: 70 + CGFloat(i) * 50)
                    .scaleEffect(animate ? 1.15 : 0.9)
                    .animation(
                        .easeOut(duration: 2.5)
                        .repeatForever(autoreverses: false)
                        .delay(Double(i) * 0.25),
                        value: animate
                    )
            }

            Image(systemName: "person.3.fill")
                .font(.system(size: 35))
                .foregroundColor(config.accentColor.opacity(0.25))
                .scaleEffect(animate ? 1.1 : 0.9)
        }
        .position(x: size.width * 0.5, y: size.height * 0.35)
    }

    // MARK: - Global Animation

    private func globalAnimation(in size: CGSize) -> some View {
        ZStack {
            ForEach(0..<4, id: \.self) { i in
                ConvBgGlobePulseRing(index: i, color: config.accentColor)
            }

            globeCore

            ForEach(0..<6, id: \.self) { i in
                ConvBgSatellite(index: i, color: config.accentColor)
            }
        }
        .position(x: size.width / 2, y: size.height * 0.4)
    }

    private var globeCore: some View {
        ZStack {
            Circle()
                .fill(
                    RadialGradient(
                        colors: [
                            config.accentColor.opacity(animate ? 0.18 : 0.08),
                            config.accentColor.opacity(animate ? 0.06 : 0.02),
                            Color.clear
                        ],
                        center: .center, startRadius: 35, endRadius: animate ? 90 : 75
                    )
                )
                .frame(width: 180, height: 180)
                .animation(.easeInOut(duration: 2.5).repeatForever(autoreverses: true), value: animate)

            Circle()
                .stroke(config.accentColor.opacity(animate ? 0.22 : 0.12), lineWidth: 2)
                .frame(width: 110, height: 110)
                .scaleEffect(animate ? 1.05 : 0.95)
                .animation(.easeInOut(duration: 2).repeatForever(autoreverses: true), value: animate)

            Image(systemName: "globe.europe.africa.fill")
                .font(.system(size: 90))
                .foregroundColor(config.accentColor.opacity(0.30))
                .rotationEffect(.degrees(animate ? 5 : -5))
                .animation(.easeInOut(duration: 4).repeatForever(autoreverses: true), value: animate)
        }
    }

    // MARK: - Encryption Overlay (Layer 2)

    private func encryptionOverlay(in size: CGSize) -> some View {
        let isE2EE = config.isE2EEncrypted

        return ZStack {
            ForEach(0..<6, id: \.self) { i in
                Image(systemName: isE2EE ? "lock.shield.fill" : "lock.fill")
                    .font(.system(size: 14))
                    .foregroundColor(config.accentColor.opacity(0.35))
                    .offset(
                        x: cos(CGFloat(i) * .pi / 3 + orbitPhase * 0.2) * (animate ? 110 : 90),
                        y: sin(CGFloat(i) * .pi / 3 + orbitPhase * 0.2) * (animate ? 80 : 65)
                    )
            }

            if isE2EE {
                VStack {
                    HStack {
                        Spacer()
                        Image(systemName: "shield.checkered")
                            .font(.system(size: 40))
                            .foregroundColor(config.accentColor.opacity(0.18))
                            .scaleEffect(animate ? 1.1 : 0.95)
                    }
                    Spacer()
                }
                .padding(40)
            }

            if !isE2EE {
                ForEach(0..<4, id: \.self) { i in
                    ZStack {
                        Image(systemName: "envelope.fill")
                            .font(.system(size: 16))
                            .foregroundColor(config.accentColor.opacity(0.20))
                        Circle()
                            .fill(config.accentColor.opacity(0.30))
                            .frame(width: 6, height: 6)
                            .offset(y: 5)
                    }
                    .offset(
                        x: CGFloat([-100, 80, -60, 110][i]),
                        y: animate ? CGFloat([30, -50, 80, -30][i]) : CGFloat([50, -30, 100, -10][i])
                    )
                    .rotationEffect(.degrees(Double([-8, 12, -5, 15][i])))
                }
            }
        }
        .position(x: size.width * 0.5, y: size.height * 0.35)
        .animation(.easeInOut(duration: 3.5).repeatForever(autoreverses: true), value: animate)
    }

    // MARK: - Multilingual Overlay (Layer 4)

    private func multilingualOverlay(in size: CGSize) -> some View {
        let flags = config.topLanguages.prefix(10).map { languageToFlag($0) }
        let flagCount = flags.count

        return ZStack {
            ForEach(0..<flagCount, id: \.self) { i in
                Text(flags[i])
                    .font(.system(size: 24))
                    .shadow(color: .black.opacity(0.15), radius: 2)
                    .offset(
                        x: cos(CGFloat(i) * .pi * 2 / CGFloat(flagCount) + orbitPhase) * (size.width * 0.35),
                        y: sin(CGFloat(i) * .pi * 2 / CGFloat(flagCount) + orbitPhase) * (size.height * 0.25)
                    )
                    .opacity(0.75)
            }

            VStack {
                Spacer()
                HStack {
                    Spacer()
                    Image(systemName: "character.bubble")
                        .font(.system(size: 25))
                        .foregroundColor(config.accentColor.opacity(0.25))
                        .scaleEffect(animate ? 1.1 : 0.9)
                }
            }
            .padding(30)
        }
        .position(x: size.width * 0.5, y: size.height * 0.5)
        .animation(.easeInOut(duration: 3).repeatForever(autoreverses: true), value: animate)
    }

    // MARK: - Floating Particles (Layer 5)

    private func floatingParticles(in size: CGSize) -> some View {
        ZStack {
            ForEach(0..<10, id: \.self) { i in
                Circle()
                    .fill(config.accentColor.opacity(0.08))
                    .frame(width: 15 + CGFloat(i % 4) * 12)
                    .blur(radius: 8)
                    .offset(
                        x: CGFloat(i % 4) * size.width / 4 - size.width / 2 + 60,
                        y: animate
                            ? CGFloat(i / 4) * size.height / 3 - 25
                            : CGFloat(i / 4) * size.height / 3 + 25
                    )
                    .animation(
                        .easeInOut(duration: 4 + Double(i % 3))
                        .repeatForever(autoreverses: true)
                        .delay(Double(i) * 0.1),
                        value: animate
                    )
            }
        }
    }

    // MARK: - Waves Overlay (Layer 6)

    private func wavesOverlay(in size: CGSize) -> some View {
        VStack {
            Spacer()
            ZStack {
                ConvBgWaveShape(phase: wavePhase, amplitude: 10, frequency: 1.5)
                    .fill(config.accentColor.opacity(0.08))
                    .frame(height: 60)

                ConvBgWaveShape(phase: wavePhase + .pi, amplitude: 7, frequency: 2)
                    .fill(config.accentColor.opacity(0.05))
                    .frame(height: 45)
                    .offset(y: 10)
            }
        }
    }

    // MARK: - Helpers

    private func languageToFlag(_ code: String) -> String {
        let flagMap: [String: String] = [
            "fr": "\u{1F1EB}\u{1F1F7}", "en": "\u{1F1EC}\u{1F1E7}", "es": "\u{1F1EA}\u{1F1F8}", "de": "\u{1F1E9}\u{1F1EA}",
            "pt": "\u{1F1F5}\u{1F1F9}", "it": "\u{1F1EE}\u{1F1F9}", "zh": "\u{1F1E8}\u{1F1F3}", "ja": "\u{1F1EF}\u{1F1F5}",
            "ko": "\u{1F1F0}\u{1F1F7}", "ar": "\u{1F1F8}\u{1F1E6}", "ru": "\u{1F1F7}\u{1F1FA}", "hi": "\u{1F1EE}\u{1F1F3}",
            "bn": "\u{1F1E7}\u{1F1E9}", "sw": "\u{1F1F9}\u{1F1FF}", "tr": "\u{1F1F9}\u{1F1F7}", "vi": "\u{1F1FB}\u{1F1F3}",
            "th": "\u{1F1F9}\u{1F1ED}", "nl": "\u{1F1F3}\u{1F1F1}", "pl": "\u{1F1F5}\u{1F1F1}", "uk": "\u{1F1FA}\u{1F1E6}",
            "he": "\u{1F1EE}\u{1F1F1}", "el": "\u{1F1EC}\u{1F1F7}", "cs": "\u{1F1E8}\u{1F1FF}", "ro": "\u{1F1F7}\u{1F1F4}",
            "hu": "\u{1F1ED}\u{1F1FA}", "sv": "\u{1F1F8}\u{1F1EA}", "da": "\u{1F1E9}\u{1F1F0}", "fi": "\u{1F1EB}\u{1F1EE}",
            "no": "\u{1F1F3}\u{1F1F4}", "id": "\u{1F1EE}\u{1F1E9}", "ms": "\u{1F1F2}\u{1F1FE}", "tl": "\u{1F1F5}\u{1F1ED}"
        ]
        return flagMap[code.lowercased()] ?? "\u{1F3F3}\u{FE0F}"
    }
}

// MARK: - Components & Previews (see ConversationBackgroundComponents.swift)
