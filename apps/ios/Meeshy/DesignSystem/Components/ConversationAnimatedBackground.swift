//
//  ConversationAnimatedBackground.swift
//  Meeshy
//
//  Highly configurable animated background for conversations
//  Features:
//  - COMPOSABLE animations that layer based on configuration
//  - Base animation from conversation type (direct, group, public, global)
//  - Encryption overlay (server-side or E2EE)
//  - Announcement overlay (broadcast waves)
//  - Multilingual overlay (orbiting flags)
//  - Customizable by user with background images (future)
//
//  iOS 16+
//

import SwiftUI

// MARK: - Configuration

/// Gender type for 1:1 conversation participants
enum ParticipantGender: Equatable {
    case male
    case female
    case unknown

    /// Color associated with this gender (for intimate animation)
    var color: Color {
        switch self {
        case .male:
            return Color(red: 0.3, green: 0.5, blue: 0.9) // Blue
        case .female:
            return Color(red: 0.9, green: 0.4, blue: 0.6) // Pink/Rose
        case .unknown:
            return .meeshyPrimary
        }
    }
}

/// Configuration for conversation animated background
struct ConversationBackgroundConfig: Equatable {
    /// Type of conversation (direct, oneOnOne, group, community, public, global)
    /// Note: There is no "announcement" type - it's derived from isAnnouncement flag
    let conversationType: ConversationType

    /// Whether conversation uses any form of encryption
    let isEncrypted: Bool

    /// Whether it's E2EE specifically (stronger visual)
    let isE2EEncrypted: Bool

    /// Whether it's an announcement-only channel (derived from isAnnouncementChannel)
    /// This is independent of conversation type - any public/global can be announcement
    let isAnnouncement: Bool

    /// Number of members in the conversation
    let memberCount: Int

    /// Avatar URLs of random members (for group animation)
    /// Should contain min 2, max 10 or 30% of members
    let memberAvatarURLs: [String]

    /// Top languages spoken in this conversation (ISO codes)
    /// Example: ["fr", "en", "es", "ar", "zh"]
    let topLanguages: [String]

    /// Custom background image URL (optional - future feature)
    let customBackgroundURL: String?

    /// Accent color for the conversation (can be customized per conversation)
    let accentColor: Color

    /// Animation intensity (0.0 to 1.0)
    let animationIntensity: CGFloat

    /// Whether to show the background animation
    let isEnabled: Bool

    // MARK: - 1:1 Conversation Properties

    /// Gender of the current user (for intimate animation color)
    let currentUserGender: ParticipantGender

    /// Gender of the other user in 1:1 conversation (for intimate animation color)
    let otherUserGender: ParticipantGender

    // MARK: - Group Color Fade Properties

    /// Start color for group animation fade (defaults to accent color)
    let groupStartColor: Color

    /// End color for group animation fade (defaults to a complementary color)
    let groupEndColor: Color

    /// Duration of one color fade cycle in seconds (default: 10 seconds each way = 20 seconds total)
    let groupColorFadeDuration: Double

    // MARK: - Initializers

    init(
        conversationType: ConversationType = .direct,
        isEncrypted: Bool = false,
        isE2EEncrypted: Bool = false,
        isAnnouncement: Bool = false,
        memberCount: Int = 2,
        memberAvatarURLs: [String] = [],
        topLanguages: [String] = [],
        customBackgroundURL: String? = nil,
        accentColor: Color = .meeshyPrimary,
        animationIntensity: CGFloat = 1.0,
        isEnabled: Bool = true,
        currentUserGender: ParticipantGender = .unknown,
        otherUserGender: ParticipantGender = .unknown,
        groupStartColor: Color? = nil,
        groupEndColor: Color? = nil,
        groupColorFadeDuration: Double = 10.0
    ) {
        self.conversationType = conversationType
        self.isEncrypted = isEncrypted
        self.isE2EEncrypted = isE2EEncrypted
        self.isAnnouncement = isAnnouncement
        self.memberCount = memberCount
        self.memberAvatarURLs = memberAvatarURLs
        self.topLanguages = topLanguages
        self.customBackgroundURL = customBackgroundURL
        self.accentColor = accentColor
        self.animationIntensity = animationIntensity
        self.isEnabled = isEnabled
        self.currentUserGender = currentUserGender
        self.otherUserGender = otherUserGender
        // Default group colors: start with accent, fade to a purple/violet
        self.groupStartColor = groupStartColor ?? accentColor
        self.groupEndColor = groupEndColor ?? Color(red: 0.6, green: 0.3, blue: 0.8) // Purple
        self.groupColorFadeDuration = groupColorFadeDuration
    }

    /// Create config from a Conversation model
    init(from conversation: Conversation, topLanguages: [String] = [], memberAvatarURLs: [String] = [], currentUserGender: ParticipantGender = .unknown, otherUserGender: ParticipantGender = .unknown, groupStartColor: Color? = nil, groupEndColor: Color? = nil) {
        self.conversationType = conversation.type
        self.isEncrypted = conversation.isEncrypted
        self.isE2EEncrypted = conversation.isE2EEncrypted
        self.isAnnouncement = conversation.isAnnouncementChannel ?? false
        self.memberCount = conversation.memberCount ?? conversation.totalMemberCount
        self.memberAvatarURLs = memberAvatarURLs
        self.topLanguages = topLanguages
        self.customBackgroundURL = conversation.banner
        self.accentColor = .meeshyPrimary
        self.animationIntensity = 1.0
        self.isEnabled = true
        self.currentUserGender = currentUserGender
        self.otherUserGender = otherUserGender
        self.groupStartColor = groupStartColor ?? .meeshyPrimary
        self.groupEndColor = groupEndColor ?? Color(red: 0.6, green: 0.3, blue: 0.8)
        self.groupColorFadeDuration = 10.0
    }

    // MARK: - Computed: Colors for 1:1 animation

    /// Left circle color (current user)
    var leftUserColor: Color {
        currentUserGender == .unknown ? accentColor : currentUserGender.color
    }

    /// Right circle color (other user)
    var rightUserColor: Color {
        otherUserGender == .unknown ? accentColor : otherUserGender.color
    }

    /// Computed: number of avatars to show in group animation
    /// Min 2, Max 10 with percentage based on member count:
    /// - <10 members: 70%
    /// - <20 members: 50%
    /// - <30 members: 40%
    /// - 30+ members: 30%
    var groupAvatarCount: Int {
        let percentage: Double
        if memberCount < 10 {
            percentage = 0.70
        } else if memberCount < 20 {
            percentage = 0.50
        } else if memberCount < 30 {
            percentage = 0.40
        } else {
            percentage = 0.30
        }

        let calculatedCount = Int(Double(memberCount) * percentage)
        let maxAvatars = min(10, calculatedCount)
        return max(2, min(maxAvatars, memberAvatarURLs.count))
    }

    // MARK: - Computed Properties (Animation Layers)

    /// Base animation style derived from conversation type
    var baseAnimationStyle: BaseAnimationStyle {
        switch conversationType {
        case .direct, .oneOnOne:
            return .intimate
        case .group:
            return .group
        case .community:
            return .community
        case .public, .global:
            return .global
        case .announcement:
            // Announcement type doesn't exist in model, but handle for safety
            return .global
        }
    }

    /// Whether to show encryption overlay
    var showEncryptionOverlay: Bool {
        isEncrypted || isE2EEncrypted
    }

    /// Whether to show announcement overlay (broadcast waves)
    var showAnnouncementOverlay: Bool {
        isAnnouncement
    }

    /// Whether to show multilingual overlay (orbiting flags)
    var showMultilingualOverlay: Bool {
        topLanguages.count >= 3
    }

    /// Whether to show custom image instead of animations
    var showCustomImage: Bool {
        customBackgroundURL != nil
    }

    // MARK: - Animation Styles

    enum BaseAnimationStyle {
        case intimate   // 1:1 - Two connected circles, hearts
        case group      // Group - Multiple avatars in circle
        case community  // Community - Large expanding pulses
        case global     // Public/Global - Globe with waves
    }
}

// MARK: - Main View

/// Animated background for conversations with COMPOSABLE layers
/// Layers stack: Base → Encryption → Announcement → Multilingual → Particles → Waves
struct ConversationAnimatedBackground: View {
    let config: ConversationBackgroundConfig

    @State private var animate = false
    @State private var wavePhase: CGFloat = 0
    @State private var orbitPhase: CGFloat = 0
    @State private var groupColorPhase: Bool = false // false = start color, true = end color

    /// Computed current group color based on phase (interpolated)
    private var currentGroupColor: Color {
        groupColorPhase ? config.groupEndColor : config.groupStartColor
    }

    var body: some View {
        GeometryReader { geo in
            ZStack {
                // Custom image takes precedence over all animations
                if config.showCustomImage {
                    customImageBackground(in: geo.size)
                } else if config.isEnabled {
                    // Layer 0: Base gradient
                    baseGradient

                    // Layer 1: Base animation (from conversation type)
                    baseAnimation(in: geo.size)
                        .opacity(config.animationIntensity)

                    // Layer 2: Encryption overlay (if encrypted)
                    if config.showEncryptionOverlay {
                        encryptionOverlay(in: geo.size)
                            .opacity(config.animationIntensity * 0.8)
                    }

                    // Layer 3: Announcement overlay (if announcement mode)
                    if config.showAnnouncementOverlay {
                        announcementOverlay(in: geo.size)
                            .opacity(config.animationIntensity * 0.7)
                    }

                    // Layer 4: Multilingual overlay (if 3+ languages)
                    if config.showMultilingualOverlay {
                        multilingualOverlay(in: geo.size)
                            .opacity(config.animationIntensity * 0.9)
                    }

                    // Layer 5: Floating particles (universal)
                    floatingParticles(in: geo.size)
                        .opacity(config.animationIntensity * 0.5)

                    // Layer 6: Wave overlay at bottom
                    wavesOverlay(in: geo.size)
                        .opacity(config.animationIntensity * 0.6)
                } else {
                    // Disabled - just show base gradient
                    baseGradient
                }
            }
        }
        .ignoresSafeArea()
        .onAppear { startAnimations() }
        .onChange(of: config) { _, _ in restartAnimations() }
    }

    // MARK: - Base Gradient

    private var baseGradient: some View {
        LinearGradient(
            colors: [
                config.accentColor.opacity(0.15),
                Color(.systemBackground).opacity(0.85),
                config.accentColor.opacity(0.10)
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
            // Group color fade: 10 seconds to end color, 10 seconds back (autoreverses)
            withAnimation(.easeInOut(duration: config.groupColorFadeDuration).repeatForever(autoreverses: true)) {
                groupColorPhase = true
            }
        }
    }

    private func restartAnimations() {
        animate = false
        wavePhase = 0
        orbitPhase = 0
        groupColorPhase = false

        DispatchQueue.main.asyncAfter(deadline: .now() + 0.15) {
            withAnimation(.easeInOut(duration: 2.5).repeatForever(autoreverses: true)) {
                animate = true
            }
            withAnimation(.linear(duration: 6).repeatForever(autoreverses: false)) {
                wavePhase = .pi * 2
            }
            withAnimation(.linear(duration: 20).repeatForever(autoreverses: false)) {
                orbitPhase = .pi * 2
            }
            // Group color fade: 10 seconds to end color, 10 seconds back (autoreverses)
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

    // MARK: - Intimate Animation (1:1 Direct) - Circles close together with line to edges

    private func intimateAnimation(in size: CGSize) -> some View {
        let centerY = size.height * 0.4
        let centerX = size.width * 0.5
        let circleSize: CGFloat = 100
        let circleSpacing: CGFloat = animate ? -15 : -5 // Overlapping/touching

        // Colors for each user (different based on gender)
        let leftColor = config.leftUserColor
        let rightColor = config.rightUserColor

        return ZStack {
            // LAYER 1: Connection line extending to viewport edges
            // Left side of line (from left edge to left circle)
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

            // Right side of line (from right circle to right edge)
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

            // LAYER 2: Outer glow rings for each user (closer together)
            HStack(spacing: circleSpacing + 40) {
                // Left user glow
                Circle()
                    .fill(
                        RadialGradient(
                            colors: [
                                leftColor.opacity(0.18),
                                leftColor.opacity(0.08),
                                Color.clear
                            ],
                            center: .center,
                            startRadius: 35,
                            endRadius: 80
                        )
                    )
                    .frame(width: 160, height: 160)
                    .scaleEffect(animate ? 1.12 : 0.95)

                // Right user glow
                Circle()
                    .fill(
                        RadialGradient(
                            colors: [
                                rightColor.opacity(0.18),
                                rightColor.opacity(0.08),
                                Color.clear
                            ],
                            center: .center,
                            startRadius: 35,
                            endRadius: 80
                        )
                    )
                    .frame(width: 160, height: 160)
                    .scaleEffect(animate ? 0.95 : 1.12)
            }
            .position(x: centerX, y: centerY)

            // LAYER 3: Two circles close together (almost touching/overlapping)
            HStack(spacing: circleSpacing) {
                // Left user circle
                Circle()
                    .fill(leftColor.opacity(0.20))
                    .frame(width: circleSize, height: circleSize)
                    .overlay(
                        Circle()
                            .stroke(leftColor.opacity(0.30), lineWidth: 3)
                    )
                    .scaleEffect(animate ? 1.10 : 0.94)

                // Right user circle
                Circle()
                    .fill(rightColor.opacity(0.20))
                    .frame(width: circleSize, height: circleSize)
                    .overlay(
                        Circle()
                            .stroke(rightColor.opacity(0.30), lineWidth: 3)
                    )
                    .scaleEffect(animate ? 0.94 : 1.10)
            }
            .position(x: centerX, y: centerY)

            // LAYER 4: Connection energy at the union point (where circles meet)
            Circle()
                .fill(
                    RadialGradient(
                        colors: [
                            Color.white.opacity(animate ? 0.25 : 0.12),
                            leftColor.opacity(0.15),
                            rightColor.opacity(0.15),
                            Color.clear
                        ],
                        center: .center,
                        startRadius: 5,
                        endRadius: animate ? 40 : 25
                    )
                )
                .frame(width: 80, height: 80)
                .position(x: centerX, y: centerY)

            // LAYER 5: Floating hearts around the union
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

            // LAYER 6: User icons inside circles
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

    // MARK: - Group Animation (Avatars fixed, central circle moves with delay, color fades)

    private func groupAnimation(in size: CGSize) -> some View {
        ZStack {
            // Layer 1: Pulse rings from center (smooth infinite) - uses fading color
            ForEach(0..<3, id: \.self) { i in
                AnimatedGroupPulseRing(
                    index: i,
                    color: currentGroupColor
                )
            }
            // Offset the pulse rings with the central circle movement
            .offset(x: animate ? 8 : -8, y: animate ? 5 : -5)
            .animation(.easeInOut(duration: 3.5).repeatForever(autoreverses: true), value: animate)

            // Layer 2: Central pulsing circle with animated glow (moves with slight offset)
            groupCentralCircleAnimated
                .offset(x: animate ? 8 : -8, y: animate ? 5 : -5)
                .animation(.easeInOut(duration: 3.5).repeatForever(autoreverses: true), value: animate)

            // Layer 3: Fixed member avatars (stay in place) - uses fading color
            groupFixedAvatars

            // Layer 4: Additional members badge
            groupMembersBadge
        }
        .position(x: size.width / 2, y: size.height * 0.4)
    }

    // Central pulsing circle with proper animation and color fade
    private var groupCentralCircleAnimated: some View {
        ZStack {
            // Animated glow effect (breathes) - uses fading color
            Circle()
                .fill(
                    RadialGradient(
                        colors: [
                            currentGroupColor.opacity(animate ? 0.20 : 0.10),
                            currentGroupColor.opacity(animate ? 0.08 : 0.03),
                            Color.clear
                        ],
                        center: .center,
                        startRadius: 25,
                        endRadius: animate ? 80 : 65
                    )
                )
                .frame(width: 160, height: 160)
                .animation(.easeInOut(duration: 2.5).repeatForever(autoreverses: true), value: animate)

            // Main circle ring - uses fading color
            Circle()
                .stroke(currentGroupColor.opacity(animate ? 0.35 : 0.20), lineWidth: 3)
                .frame(width: 75, height: 75)
                .scaleEffect(animate ? 1.12 : 0.92)
                .animation(.easeInOut(duration: 2.0).repeatForever(autoreverses: true), value: animate)

            // Inner fill - uses fading color
            Circle()
                .fill(currentGroupColor.opacity(animate ? 0.12 : 0.06))
                .frame(width: 65, height: 65)
                .scaleEffect(animate ? 1.08 : 0.94)
                .animation(.easeInOut(duration: 2.2).repeatForever(autoreverses: true), value: animate)

            // Group icon - uses fading color
            Image(systemName: "person.3.fill")
                .font(.system(size: 24))
                .foregroundColor(currentGroupColor.opacity(0.40))
        }
    }

    // Fixed member avatars (stay in place while central circle moves)
    private var groupFixedAvatars: some View {
        let avatarCount = config.groupAvatarCount
        let avatarURLs = config.memberAvatarURLs

        return ZStack {
            ForEach(0..<avatarCount, id: \.self) { i in
                FixedGroupAvatar(
                    index: i,
                    totalCount: avatarCount,
                    avatarURL: i < avatarURLs.count ? avatarURLs[i] : nil,
                    color: currentGroupColor
                )
            }
        }
    }

    // Badge showing additional members count - uses fading color
    private var groupMembersBadge: some View {
        Group {
            if config.memberCount > config.groupAvatarCount {
                Text("+\(config.memberCount - config.groupAvatarCount)")
                    .font(.system(size: 14, weight: .bold))
                    .foregroundColor(currentGroupColor.opacity(0.50))
                    .padding(.horizontal, 10)
                    .padding(.vertical, 5)
                    .background(
                        Capsule()
                            .fill(currentGroupColor.opacity(0.12))
                    )
                    .offset(y: 60)
            }
        }
    }

    // MARK: - Community Animation

    private func communityAnimation(in size: CGSize) -> some View {
        ZStack {
            // Expanding pulse rings
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

            // Community icon
            Image(systemName: "person.3.fill")
                .font(.system(size: 35))
                .foregroundColor(config.accentColor.opacity(0.25))
                .scaleEffect(animate ? 1.1 : 0.9)
        }
        .position(x: size.width * 0.5, y: size.height * 0.35)
    }

    // MARK: - Global Animation (Public/Global) - Fixed Center with Animated Pulses

    private func globalAnimation(in size: CGSize) -> some View {
        ZStack {
            // Layer 1: Outward broadcast waves FROM globe (4 rings pulsing outward)
            ForEach(0..<4, id: \.self) { i in
                AnimatedGlobePulseRing(
                    index: i,
                    color: config.accentColor
                )
            }

            // Layer 2: The Globe itself with animated glow
            globeCoreAnimated

            // Layer 3: Orbiting satellites with signal waves
            ForEach(0..<6, id: \.self) { i in
                AnimatedGlobeSatellite(
                    index: i,
                    color: config.accentColor
                )
            }
        }
        .position(x: size.width / 2, y: size.height * 0.4)
    }

    // Globe core with animated glow effect
    private var globeCoreAnimated: some View {
        ZStack {
            // Animated outer glow (breathes)
            Circle()
                .fill(
                    RadialGradient(
                        colors: [
                            config.accentColor.opacity(animate ? 0.18 : 0.08),
                            config.accentColor.opacity(animate ? 0.06 : 0.02),
                            Color.clear
                        ],
                        center: .center,
                        startRadius: 35,
                        endRadius: animate ? 90 : 75
                    )
                )
                .frame(width: 180, height: 180)
                .animation(.easeInOut(duration: 2.5).repeatForever(autoreverses: true), value: animate)

            // Inner glow ring
            Circle()
                .stroke(config.accentColor.opacity(animate ? 0.22 : 0.12), lineWidth: 2)
                .frame(width: 110, height: 110)
                .scaleEffect(animate ? 1.05 : 0.95)
                .animation(.easeInOut(duration: 2).repeatForever(autoreverses: true), value: animate)

            // Globe icon with slow rotation
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
            // Security particles orbiting
            ForEach(0..<6, id: \.self) { i in
                Image(systemName: isE2EE ? "lock.shield.fill" : "lock.fill")
                    .font(.system(size: 14))
                    .foregroundColor(config.accentColor.opacity(0.35))
                    .offset(
                        x: cos(CGFloat(i) * .pi / 3 + orbitPhase * 0.2) * (animate ? 110 : 90),
                        y: sin(CGFloat(i) * .pi / 3 + orbitPhase * 0.2) * (animate ? 80 : 65)
                    )
            }

            // E2EE specific: Shield in corner
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

            // Sealed envelopes floating (server encryption visual)
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

    // MARK: - Announcement Overlay (Layer 3)

    private func announcementOverlay(in size: CGSize) -> some View {
        ZStack {
            // Megaphone in corner
            VStack {
                HStack {
                    Image(systemName: "megaphone.fill")
                        .font(.system(size: 35))
                        .foregroundColor(config.accentColor.opacity(0.20))
                        .rotationEffect(.degrees(-15))
                        .scaleEffect(animate ? 1.1 : 0.95)
                    Spacer()
                }
                Spacer()
            }
            .padding(30)

            // Sound waves emanating
            ForEach(0..<3, id: \.self) { i in
                BroadcastWaveArc()
                    .stroke(config.accentColor.opacity(0.20 - Double(i) * 0.04), lineWidth: 3)
                    .frame(width: 40 + CGFloat(i) * 25, height: 40 + CGFloat(i) * 25)
                    .opacity(animate ? 0.5 : 1.0)
                    .animation(
                        .easeOut(duration: 1.5)
                        .repeatForever(autoreverses: false)
                        .delay(Double(i) * 0.2),
                        value: animate
                    )
            }
            .position(x: 80, y: 80)
        }
    }

    // MARK: - Multilingual Overlay (Layer 4)

    private func multilingualOverlay(in size: CGSize) -> some View {
        let flags = config.topLanguages.prefix(10).map { languageToFlag($0) }
        let flagCount = flags.count

        return ZStack {
            // Orbiting flags around the edges
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

            // Translation symbol in corner
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

    // MARK: - Custom Image Background

    private func customImageBackground(in size: CGSize) -> some View {
        Group {
            if let urlString = config.customBackgroundURL {
                CachedAsyncImage(urlString: urlString, cacheType: .attachment) { image in
                    image
                        .resizable()
                        .aspectRatio(contentMode: .fill)
                        .frame(width: size.width, height: size.height)
                        .clipped()
                        .opacity(0.15)
                } placeholder: {
                    baseGradient
                }
            }
        }
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
                ConversationWaveShape(phase: wavePhase, amplitude: 10, frequency: 1.5)
                    .fill(config.accentColor.opacity(0.08))
                    .frame(height: 60)

                ConversationWaveShape(phase: wavePhase + .pi, amplitude: 7, frequency: 2)
                    .fill(config.accentColor.opacity(0.05))
                    .frame(height: 45)
                    .offset(y: 10)
            }
        }
    }

    // MARK: - Helpers

    /// Convert language code to flag emoji
    private func languageToFlag(_ code: String) -> String {
        let flagMap: [String: String] = [
            "fr": "🇫🇷", "en": "🇬🇧", "es": "🇪🇸", "de": "🇩🇪",
            "pt": "🇵🇹", "it": "🇮🇹", "zh": "🇨🇳", "ja": "🇯🇵",
            "ko": "🇰🇷", "ar": "🇸🇦", "ru": "🇷🇺", "hi": "🇮🇳",
            "bn": "🇧🇩", "sw": "🇹🇿", "tr": "🇹🇷", "vi": "🇻🇳",
            "th": "🇹🇭", "nl": "🇳🇱", "pl": "🇵🇱", "uk": "🇺🇦",
            "he": "🇮🇱", "el": "🇬🇷", "cs": "🇨🇿", "ro": "🇷🇴",
            "hu": "🇭🇺", "sv": "🇸🇪", "da": "🇩🇰", "fi": "🇫🇮",
            "no": "🇳🇴", "id": "🇮🇩", "ms": "🇲🇾", "tl": "🇵🇭"
        ]
        return flagMap[code.lowercased()] ?? "🏳️"
    }
}

// MARK: - Animated Group Pulse Ring (smooth infinite pulse outward)

private struct AnimatedGroupPulseRing: View {
    let index: Int
    let color: Color

    @State private var scale: CGFloat = 1.0
    @State private var opacity: CGFloat = 0.22

    // Staggered delay for each ring
    private var delay: Double {
        Double(index) * 0.7
    }

    var body: some View {
        Circle()
            .stroke(color.opacity(opacity), lineWidth: 3)
            .frame(width: 55, height: 55)
            .scaleEffect(scale)
            .onAppear {
                DispatchQueue.main.asyncAfter(deadline: .now() + delay) {
                    withAnimation(
                        .easeOut(duration: 2.5)
                        .repeatForever(autoreverses: false)
                    ) {
                        scale = 3.2
                        opacity = 0.0
                    }
                }
            }
    }
}

// MARK: - Fixed Group Avatar (stays in place, central circle moves)

private struct FixedGroupAvatar: View {
    let index: Int
    let totalCount: Int
    let avatarURL: String?
    let color: Color

    @State private var glowPulse: Bool = false
    @State private var beamPhase: CGFloat = 0

    private let orbitRadius: CGFloat = 110

    // Fixed angle for this avatar (evenly distributed)
    private var fixedAngle: CGFloat {
        CGFloat(index) * .pi * 2 / CGFloat(max(1, totalCount))
    }

    var body: some View {
        ZStack {
            // Connection line to center (animated dashes)
            connectionBeam

            // The avatar with glow
            avatarWithGlow
        }
        .offset(
            x: cos(fixedAngle) * orbitRadius,
            y: sin(fixedAngle) * orbitRadius
        )
        .onAppear {
            startAnimations()
        }
    }

    private func startAnimations() {
        // Glow pulse with staggered timing
        withAnimation(
            .easeInOut(duration: 2.0)
            .repeatForever(autoreverses: true)
            .delay(Double(index) * 0.2)
        ) {
            glowPulse = true
        }

        // Beam dash animation - continuous
        withAnimation(
            .linear(duration: 2.0 * 100)
        ) {
            beamPhase = 30 * 100
        }
    }

    private var connectionBeam: some View {
        Path { path in
            path.move(to: .zero)
            // Line towards center
            let endX = -cos(fixedAngle) * (orbitRadius * 0.65)
            let endY = -sin(fixedAngle) * (orbitRadius * 0.65)
            path.addLine(to: CGPoint(x: endX, y: endY))
        }
        .stroke(
            color.opacity(glowPulse ? 0.22 : 0.10),
            style: StrokeStyle(lineWidth: 2, dash: [4, 4], dashPhase: beamPhase)
        )
    }

    private var avatarWithGlow: some View {
        ZStack {
            // Outer glow
            Circle()
                .fill(color.opacity(glowPulse ? 0.20 : 0.08))
                .frame(width: 52, height: 52)
                .blur(radius: 6)

            // Avatar background
            Circle()
                .fill(color.opacity(0.25))
                .frame(width: 40, height: 40)

            // Avatar image or placeholder
            if let urlString = avatarURL, !urlString.isEmpty {
                CachedAsyncImage(urlString: urlString, cacheType: .avatar) { image in
                    image
                        .resizable()
                        .aspectRatio(contentMode: .fill)
                        .frame(width: 36, height: 36)
                        .clipShape(Circle())
                } placeholder: {
                    avatarPlaceholder
                }
            } else {
                avatarPlaceholder
            }

            // Border ring
            Circle()
                .stroke(color.opacity(glowPulse ? 0.45 : 0.30), lineWidth: 2)
                .frame(width: 40, height: 40)
        }
    }

    private var avatarPlaceholder: some View {
        Image(systemName: "person.fill")
            .font(.system(size: 16))
            .foregroundColor(color.opacity(0.50))
    }
}

// MARK: - Animated Group Orbiting Avatar (smooth infinite orbit and pulse) - Legacy

private struct AnimatedGroupOrbitingAvatar: View {
    let index: Int
    let totalCount: Int
    let avatarURL: String?
    let color: Color

    @State private var orbitAngle: CGFloat = 0
    @State private var pulseInward: Bool = false
    @State private var beamPhase: CGFloat = 0
    @State private var glowPulse: Bool = false

    private let baseOrbitRadius: CGFloat = 110

    // Base angle for this avatar (evenly distributed)
    private var baseAngle: CGFloat {
        CGFloat(index) * .pi * 2 / CGFloat(max(1, totalCount))
    }

    // Current angle with smooth infinite orbit
    private var currentAngle: CGFloat {
        baseAngle + orbitAngle
    }

    // Current radius with pulse effect
    private var currentRadius: CGFloat {
        pulseInward ? baseOrbitRadius - 25 : baseOrbitRadius + 10
    }

    var body: some View {
        ZStack {
            // Connection line to center (animated dashes)
            connectionBeam

            // The avatar with glow
            avatarWithGlow
        }
        .offset(
            x: cos(currentAngle) * currentRadius,
            y: sin(currentAngle) * currentRadius
        )
        .onAppear {
            startAnimations()
        }
    }

    private func startAnimations() {
        // Continuous orbit - animate to many rotations so it never "resets" during session
        // 30 seconds per rotation, 100 rotations = 3000 seconds before any potential reset
        withAnimation(
            .linear(duration: 30 * 100)
        ) {
            orbitAngle = .pi * 2 * 100
        }

        // Pulse inward/outward with staggered timing per avatar
        withAnimation(
            .easeInOut(duration: 2.0)
            .repeatForever(autoreverses: true)
            .delay(Double(index) * 0.3)
        ) {
            pulseInward = true
        }

        // Glow pulse
        withAnimation(
            .easeInOut(duration: 1.5)
            .repeatForever(autoreverses: true)
            .delay(Double(index) * 0.2)
        ) {
            glowPulse = true
        }

        // Beam dash animation - continuous without reset
        withAnimation(
            .linear(duration: 2.0 * 100)
        ) {
            beamPhase = 30 * 100
        }
    }

    private var connectionBeam: some View {
        Path { path in
            path.move(to: .zero)
            // Line towards center
            let endX = -cos(currentAngle) * (currentRadius * 0.65)
            let endY = -sin(currentAngle) * (currentRadius * 0.65)
            path.addLine(to: CGPoint(x: endX, y: endY))
        }
        .stroke(
            color.opacity(pulseInward ? 0.22 : 0.08),
            style: StrokeStyle(lineWidth: 2, dash: [4, 4], dashPhase: beamPhase)
        )
    }

    private var avatarWithGlow: some View {
        ZStack {
            // Outer glow (pulses when avatar moves inward)
            Circle()
                .fill(color.opacity(glowPulse ? 0.18 : 0.07))
                .frame(width: 52, height: 52)
                .blur(radius: 6)

            // Avatar background
            Circle()
                .fill(color.opacity(0.25))
                .frame(width: 40, height: 40)

            // Avatar image or placeholder
            if let urlString = avatarURL, !urlString.isEmpty {
                CachedAsyncImage(urlString: urlString, cacheType: .avatar) { image in
                    image
                        .resizable()
                        .aspectRatio(contentMode: .fill)
                        .frame(width: 36, height: 36)
                        .clipShape(Circle())
                } placeholder: {
                    avatarPlaceholder
                }
            } else {
                avatarPlaceholder
            }

            // Border ring
            Circle()
                .stroke(color.opacity(glowPulse ? 0.45 : 0.30), lineWidth: 2)
                .frame(width: 40, height: 40)
        }
    }

    private var avatarPlaceholder: some View {
        Image(systemName: "person.fill")
            .font(.system(size: 16))
            .foregroundColor(color.opacity(0.50))
    }
}

// MARK: - Animated Globe Pulse Ring (outward broadcast wave with proper animation)

private struct AnimatedGlobePulseRing: View {
    let index: Int
    let color: Color

    @State private var scale: CGFloat = 1.0
    @State private var opacity: CGFloat = 0.25

    // Each ring has a different delay for staggered effect
    private var delay: Double {
        Double(index) * 0.6
    }

    var body: some View {
        Circle()
            .stroke(color.opacity(opacity), lineWidth: 3)
            .frame(width: 90, height: 90)
            .scaleEffect(scale)
            .onAppear {
                // Start the infinite pulse animation with delay
                DispatchQueue.main.asyncAfter(deadline: .now() + delay) {
                    withAnimation(
                        .easeOut(duration: 2.4)
                        .repeatForever(autoreverses: false)
                    ) {
                        scale = 2.8
                        opacity = 0.0
                    }
                }
            }
    }
}

// MARK: - Animated Globe Satellite (orbiting with signal waves towards center)

private struct AnimatedGlobeSatellite: View {
    let index: Int
    let color: Color

    @State private var orbitAngle: CGFloat = 0
    @State private var signalPulse: Bool = false
    @State private var beamPhase: CGFloat = 0

    private let orbitRadius: CGFloat = 140

    // Base angle for this satellite (evenly distributed)
    private var baseAngle: CGFloat {
        CGFloat(index) * .pi * 2 / 6
    }

    // Current angle including slow orbit rotation
    private var currentAngle: CGFloat {
        baseAngle + orbitAngle
    }

    var body: some View {
        ZStack {
            // Signal waves traveling FROM satellite TOWARDS center
            signalWavesToCenter

            // Connection beam (animated dashed line)
            connectionBeam

            // The satellite icon with pulsing indicator
            satelliteWithPulse
        }
        .offset(
            x: cos(currentAngle) * orbitRadius,
            y: sin(currentAngle) * orbitRadius
        )
        .onAppear {
            startAnimations()
        }
    }

    private func startAnimations() {
        // Continuous orbit - 60 seconds per rotation, 100 rotations = never resets
        withAnimation(
            .linear(duration: 60 * 100)
        ) {
            orbitAngle = .pi * 2 * 100
        }

        // Signal pulse animation
        withAnimation(
            .easeInOut(duration: 1.2)
            .repeatForever(autoreverses: true)
            .delay(Double(index) * 0.2)
        ) {
            signalPulse = true
        }

        // Beam phase animation - continuous without reset
        withAnimation(
            .linear(duration: 1.5 * 100)
        ) {
            beamPhase = 20 * 100
        }
    }

    // Signal waves that travel from satellite towards the globe center
    private var signalWavesToCenter: some View {
        ForEach(0..<3, id: \.self) { waveIndex in
            SignalWaveToCenter(
                waveIndex: waveIndex,
                satelliteIndex: index,
                angle: currentAngle,
                color: color
            )
        }
    }

    // Animated dashed line from satellite towards center
    private var connectionBeam: some View {
        Path { path in
            path.move(to: .zero)
            // Line towards center (but not all the way)
            let endX = -cos(currentAngle) * orbitRadius * 0.55
            let endY = -sin(currentAngle) * orbitRadius * 0.55
            path.addLine(to: CGPoint(x: endX, y: endY))
        }
        .stroke(
            color.opacity(0.12),
            style: StrokeStyle(lineWidth: 2, dash: [5, 5], dashPhase: beamPhase)
        )
    }

    // Satellite icon with pulsing indicator light
    private var satelliteWithPulse: some View {
        ZStack {
            // Glow behind satellite when pulsing
            Circle()
                .fill(color.opacity(signalPulse ? 0.22 : 0.07))
                .frame(width: 35, height: 35)
                .blur(radius: 8)

            // Satellite/antenna icon
            Image(systemName: "antenna.radiowaves.left.and.right")
                .font(.system(size: 16, weight: .medium))
                .foregroundColor(color.opacity(0.50))

            // Pulsing indicator dot
            Circle()
                .fill(color.opacity(signalPulse ? 0.60 : 0.22))
                .frame(width: signalPulse ? 7 : 5, height: signalPulse ? 7 : 5)
                .offset(y: -12)
        }
    }
}

// MARK: - Signal Wave traveling towards center

private struct SignalWaveToCenter: View {
    let waveIndex: Int
    let satelliteIndex: Int
    let angle: CGFloat
    let color: Color

    @State private var progress: CGFloat = 0

    // Stagger waves based on both satellite and wave index
    private var delay: Double {
        Double(waveIndex) * 0.5 + Double(satelliteIndex) * 0.15
    }

    var body: some View {
        Circle()
            .stroke(color.opacity(0.22 * (1 - progress)), lineWidth: 2)
            .frame(width: 12 + progress * 15, height: 12 + progress * 15)
            // Move from satellite position towards center
            .offset(
                x: -cos(angle) * progress * 60,
                y: -sin(angle) * progress * 60
            )
            .onAppear {
                DispatchQueue.main.asyncAfter(deadline: .now() + delay) {
                    withAnimation(
                        .easeIn(duration: 1.8)
                        .repeatForever(autoreverses: false)
                    ) {
                        progress = 1.0
                    }
                }
            }
    }
}

// MARK: - Broadcast Wave Arc Shape

private struct BroadcastWaveArc: Shape {
    func path(in rect: CGRect) -> Path {
        var path = Path()
        let center = CGPoint(x: rect.midX, y: rect.midY)
        let radius = min(rect.width, rect.height) / 2

        path.addArc(
            center: center,
            radius: radius,
            startAngle: .degrees(-40),
            endAngle: .degrees(40),
            clockwise: false
        )

        return path
    }
}

// MARK: - Conversation Wave Shape

private struct ConversationWaveShape: Shape {
    var phase: CGFloat
    var amplitude: CGFloat
    var frequency: CGFloat

    var animatableData: CGFloat {
        get { phase }
        set { phase = newValue }
    }

    func path(in rect: CGRect) -> Path {
        var path = Path()
        path.move(to: CGPoint(x: 0, y: rect.midY))

        for x in stride(from: 0, through: rect.width, by: 1) {
            let relativeX = x / rect.width
            let y = sin(relativeX * .pi * 2 * frequency + phase) * amplitude + rect.midY
            path.addLine(to: CGPoint(x: x, y: y))
        }

        path.addLine(to: CGPoint(x: rect.width, y: rect.height))
        path.addLine(to: CGPoint(x: 0, y: rect.height))
        path.closeSubpath()

        return path
    }
}

// MARK: - Previews

#Preview("Direct Chat (1:1)") {
    ConversationAnimatedBackground(
        config: ConversationBackgroundConfig(
            conversationType: .direct,
            memberCount: 2
        )
    )
}

#Preview("Group Chat") {
    ConversationAnimatedBackground(
        config: ConversationBackgroundConfig(
            conversationType: .group,
            memberCount: 8
        )
    )
}

#Preview("Group + Encrypted (Server)") {
    ConversationAnimatedBackground(
        config: ConversationBackgroundConfig(
            conversationType: .group,
            isEncrypted: true,
            memberCount: 5
        )
    )
}

#Preview("Group + E2EE + Multilingual") {
    ConversationAnimatedBackground(
        config: ConversationBackgroundConfig(
            conversationType: .group,
            isEncrypted: true,
            isE2EEncrypted: true,
            memberCount: 6,
            topLanguages: ["fr", "en", "es", "ar", "zh", "pt"]
        )
    )
}

#Preview("Public + Announcement") {
    ConversationAnimatedBackground(
        config: ConversationBackgroundConfig(
            conversationType: .public,
            isAnnouncement: true,
            memberCount: 1500
        )
    )
}

#Preview("Global + E2EE + Announcement + Multilingual") {
    ConversationAnimatedBackground(
        config: ConversationBackgroundConfig(
            conversationType: .global,
            isEncrypted: true,
            isE2EEncrypted: true,
            isAnnouncement: true,
            memberCount: 5000,
            topLanguages: ["en", "fr", "es", "de", "pt", "ar", "zh", "ja"]
        )
    )
}
