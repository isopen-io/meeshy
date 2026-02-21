import SwiftUI
import MeeshySDK

// MARK: - Extracted from ConversationAnimatedBackground.swift

// MARK: - Pulse Ring (group/globe reusable)

struct ConvBgPulseRing: View {
    let index: Int
    let color: Color

    @State private var scale: CGFloat = 1.0
    @State private var opacity: CGFloat = 0.22

    private var delay: Double { Double(index) * 0.7 }

    var body: some View {
        Circle()
            .stroke(color.opacity(opacity), lineWidth: 3)
            .frame(width: 55, height: 55)
            .scaleEffect(scale)
            .onAppear {
                DispatchQueue.main.asyncAfter(deadline: .now() + delay) {
                    withAnimation(.easeOut(duration: 2.5).repeatForever(autoreverses: false)) {
                        scale = 3.2
                        opacity = 0.0
                    }
                }
            }
    }
}

// MARK: - Fixed Group Avatar (placeholder-based, no remote images)

struct ConvBgFixedAvatar: View {
    let index: Int
    let totalCount: Int
    let color: Color

    @State private var glowPulse: Bool = false
    @State private var beamPhase: CGFloat = 0

    private let orbitRadius: CGFloat = 110

    private var fixedAngle: CGFloat {
        CGFloat(index) * .pi * 2 / CGFloat(max(1, totalCount))
    }

    var body: some View {
        ZStack {
            connectionBeam
            avatarWithGlow
        }
        .offset(
            x: cos(fixedAngle) * orbitRadius,
            y: sin(fixedAngle) * orbitRadius
        )
        .onAppear { startAnimations() }
    }

    private func startAnimations() {
        withAnimation(.easeInOut(duration: 2.0).repeatForever(autoreverses: true).delay(Double(index) * 0.2)) {
            glowPulse = true
        }
        withAnimation(.linear(duration: 2.0 * 100)) {
            beamPhase = 30 * 100
        }
    }

    private var connectionBeam: some View {
        Path { path in
            path.move(to: .zero)
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
            Circle()
                .fill(color.opacity(glowPulse ? 0.20 : 0.08))
                .frame(width: 52, height: 52)
                .blur(radius: 6)

            Circle()
                .fill(color.opacity(0.25))
                .frame(width: 40, height: 40)

            Image(systemName: "person.fill")
                .font(.system(size: 16))
                .foregroundColor(color.opacity(0.50))

            Circle()
                .stroke(color.opacity(glowPulse ? 0.45 : 0.30), lineWidth: 2)
                .frame(width: 40, height: 40)
        }
    }
}

// MARK: - Globe Pulse Ring

struct ConvBgGlobePulseRing: View {
    let index: Int
    let color: Color

    @State private var scale: CGFloat = 1.0
    @State private var opacity: CGFloat = 0.25

    private var delay: Double { Double(index) * 0.6 }

    var body: some View {
        Circle()
            .stroke(color.opacity(opacity), lineWidth: 3)
            .frame(width: 90, height: 90)
            .scaleEffect(scale)
            .onAppear {
                DispatchQueue.main.asyncAfter(deadline: .now() + delay) {
                    withAnimation(.easeOut(duration: 2.4).repeatForever(autoreverses: false)) {
                        scale = 2.8
                        opacity = 0.0
                    }
                }
            }
    }
}

// MARK: - Globe Satellite

struct ConvBgSatellite: View {
    let index: Int
    let color: Color

    @State private var orbitAngle: CGFloat = 0
    @State private var signalPulse: Bool = false
    @State private var beamPhase: CGFloat = 0

    private let orbitRadius: CGFloat = 140

    private var baseAngle: CGFloat {
        CGFloat(index) * .pi * 2 / 6
    }

    private var currentAngle: CGFloat {
        baseAngle + orbitAngle
    }

    var body: some View {
        ZStack {
            signalWaves
            connectionBeam
            satelliteWithPulse
        }
        .offset(
            x: cos(currentAngle) * orbitRadius,
            y: sin(currentAngle) * orbitRadius
        )
        .onAppear { startAnimations() }
    }

    private func startAnimations() {
        withAnimation(.linear(duration: 60 * 100)) {
            orbitAngle = .pi * 2 * 100
        }
        withAnimation(.easeInOut(duration: 1.2).repeatForever(autoreverses: true).delay(Double(index) * 0.2)) {
            signalPulse = true
        }
        withAnimation(.linear(duration: 1.5 * 100)) {
            beamPhase = 20 * 100
        }
    }

    private var signalWaves: some View {
        ForEach(0..<3, id: \.self) { waveIndex in
            ConvBgSignalWave(
                waveIndex: waveIndex,
                satelliteIndex: index,
                angle: currentAngle,
                color: color
            )
        }
    }

    private var connectionBeam: some View {
        Path { path in
            path.move(to: .zero)
            let endX = -cos(currentAngle) * orbitRadius * 0.55
            let endY = -sin(currentAngle) * orbitRadius * 0.55
            path.addLine(to: CGPoint(x: endX, y: endY))
        }
        .stroke(color.opacity(0.12), style: StrokeStyle(lineWidth: 2, dash: [5, 5], dashPhase: beamPhase))
    }

    private var satelliteWithPulse: some View {
        ZStack {
            Circle()
                .fill(color.opacity(signalPulse ? 0.22 : 0.07))
                .frame(width: 35, height: 35)
                .blur(radius: 8)

            Image(systemName: "antenna.radiowaves.left.and.right")
                .font(.system(size: 16, weight: .medium))
                .foregroundColor(color.opacity(0.50))

            Circle()
                .fill(color.opacity(signalPulse ? 0.60 : 0.22))
                .frame(width: signalPulse ? 7 : 5, height: signalPulse ? 7 : 5)
                .offset(y: -12)
        }
    }
}

// MARK: - Signal Wave towards center

struct ConvBgSignalWave: View {
    let waveIndex: Int
    let satelliteIndex: Int
    let angle: CGFloat
    let color: Color

    @State private var progress: CGFloat = 0

    private var delay: Double {
        Double(waveIndex) * 0.5 + Double(satelliteIndex) * 0.15
    }

    var body: some View {
        Circle()
            .stroke(color.opacity(0.22 * (1 - progress)), lineWidth: 2)
            .frame(width: 12 + progress * 15, height: 12 + progress * 15)
            .offset(
                x: -cos(angle) * progress * 60,
                y: -sin(angle) * progress * 60
            )
            .onAppear {
                DispatchQueue.main.asyncAfter(deadline: .now() + delay) {
                    withAnimation(.easeIn(duration: 1.8).repeatForever(autoreverses: false)) {
                        progress = 1.0
                    }
                }
            }
    }
}

// MARK: - Wave Shape

struct ConvBgWaveShape: Shape {
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
        config: ConversationBackgroundConfig(conversationType: Conversation.ConversationType.direct, memberCount: 2)
    )
}

#Preview("Group Chat") {
    ConversationAnimatedBackground(
        config: ConversationBackgroundConfig(conversationType: Conversation.ConversationType.group, memberCount: 8)
    )
}

#Preview("Group + Encrypted") {
    ConversationAnimatedBackground(
        config: ConversationBackgroundConfig(conversationType: Conversation.ConversationType.group, isEncrypted: true, memberCount: 5)
    )
}

#Preview("Community") {
    ConversationAnimatedBackground(
        config: ConversationBackgroundConfig(conversationType: Conversation.ConversationType.community, memberCount: 50)
    )
}

#Preview("Global + E2EE + Multilingual") {
    ConversationAnimatedBackground(
        config: ConversationBackgroundConfig(
            conversationType: Conversation.ConversationType.global,
            isEncrypted: true,
            isE2EEncrypted: true,
            memberCount: 5000,
            topLanguages: ["en", "fr", "es", "de", "pt", "ar", "zh", "ja"]
        )
    )
}
