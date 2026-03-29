import SwiftUI
import MeeshySDK

// MARK: - Appearance Effects (one-shot, play once on appear)

struct ShakeEffect: ViewModifier {
    let active: Bool
    @State private var phase: CGFloat = 0

    func body(content: Content) -> some View {
        content
            .offset(x: active ? sin(phase * .pi * 4) * 8 : 0)
            .onAppear {
                guard active else { return }
                withAnimation(.easeOut(duration: 0.6)) { phase = 1 }
            }
    }
}

struct ZoomEffect: ViewModifier {
    let active: Bool
    @State private var scale: CGFloat = 0.3

    func body(content: Content) -> some View {
        content
            .scaleEffect(active ? scale : 1)
            .onAppear {
                guard active else { return }
                withAnimation(.spring(response: 0.5, dampingFraction: 0.6)) { scale = 1 }
            }
    }
}

struct ExplodeEffect: ViewModifier {
    let active: Bool
    @State private var opacity: Double = 0
    @State private var scale: CGFloat = 0.1

    func body(content: Content) -> some View {
        content
            .scaleEffect(active ? scale : 1)
            .opacity(active ? opacity : 1)
            .onAppear {
                guard active else { return }
                withAnimation(.spring(response: 0.3, dampingFraction: 0.5)) {
                    scale = 1.15
                    opacity = 1
                }
                withAnimation(.easeOut(duration: 0.2).delay(0.3)) {
                    scale = 1
                }
            }
    }
}

struct WaooEffect: ViewModifier {
    let active: Bool
    @State private var scale: CGFloat = 0.5
    @State private var glowOpacity: Double = 0

    func body(content: Content) -> some View {
        content
            .scaleEffect(active ? scale : 1)
            .shadow(color: .yellow.opacity(active ? glowOpacity : 0), radius: 20)
            .onAppear {
                guard active else { return }
                withAnimation(.spring(response: 0.4, dampingFraction: 0.4)) {
                    scale = 1.1
                    glowOpacity = 0.6
                }
                withAnimation(.easeOut(duration: 0.3).delay(0.4)) {
                    scale = 1
                    glowOpacity = 0
                }
            }
    }
}

// MARK: - Particle Overlay Effects (one-shot)

struct ConfettiOverlay: View {
    @State private var particles: [ConfettiParticle] = []
    @State private var isAnimating = false

    struct ConfettiParticle: Identifiable {
        let id = UUID()
        var x: CGFloat
        var y: CGFloat
        let color: Color
        let size: CGFloat
        let rotation: Double
    }

    var body: some View {
        GeometryReader { geo in
            ZStack {
                ForEach(particles) { p in
                    RoundedRectangle(cornerRadius: 1)
                        .fill(p.color)
                        .frame(width: p.size, height: p.size * 0.6)
                        .rotationEffect(.degrees(p.rotation))
                        .position(x: p.x, y: p.y)
                }
            }
            .allowsHitTesting(false)
            .onAppear { spawnConfetti(in: geo.size) }
        }
        .opacity(isAnimating ? 0 : 1)
    }

    private func spawnConfetti(in size: CGSize) {
        let colors: [Color] = [.red, .blue, .green, .yellow, .purple, .orange, .pink]
        particles = (0..<30).map { _ in
            ConfettiParticle(
                x: CGFloat.random(in: 0...size.width),
                y: -10,
                color: colors.randomElement() ?? .blue,
                size: CGFloat.random(in: 4...8),
                rotation: Double.random(in: 0...360)
            )
        }
        withAnimation(.easeIn(duration: 1.5)) {
            for i in particles.indices {
                particles[i].y = size.height + 20
                particles[i].x += CGFloat.random(in: -30...30)
            }
        }
        withAnimation(.easeIn(duration: 0.5).delay(1.2)) { isAnimating = true }
    }
}

struct FireworksOverlay: View {
    @State private var sparks: [Spark] = []
    @State private var opacity: Double = 1

    struct Spark: Identifiable {
        let id = UUID()
        var x: CGFloat
        var y: CGFloat
        let color: Color
        let angle: Double
        let distance: CGFloat
    }

    var body: some View {
        GeometryReader { geo in
            let center = CGPoint(x: geo.size.width / 2, y: geo.size.height / 2)
            ZStack {
                ForEach(sparks) { spark in
                    Circle()
                        .fill(spark.color)
                        .frame(width: 4, height: 4)
                        .position(x: spark.x, y: spark.y)
                }
            }
            .allowsHitTesting(false)
            .onAppear { spawnFireworks(center: center) }
        }
        .opacity(opacity)
    }

    private func spawnFireworks(center: CGPoint) {
        let colors: [Color] = [Color(hex: "#6366F1"), Color(hex: "#818CF8"), .yellow, .orange, .white]
        sparks = (0..<20).map { i in
            let angle = Double(i) * (360.0 / 20.0)
            return Spark(x: center.x, y: center.y, color: colors.randomElement() ?? .white, angle: angle, distance: CGFloat.random(in: 40...80))
        }
        withAnimation(.easeOut(duration: 0.8)) {
            for i in sparks.indices {
                let rad = sparks[i].angle * .pi / 180
                sparks[i].x += cos(rad) * sparks[i].distance
                sparks[i].y += sin(rad) * sparks[i].distance
            }
        }
        withAnimation(.easeIn(duration: 0.4).delay(0.6)) { opacity = 0 }
    }
}

struct ExplodeOverlay: View {
    @State private var scale: CGFloat = 0.3
    @State private var opacity: Double = 1

    var body: some View {
        Circle()
            .fill(
                RadialGradient(colors: [Color(hex: "#6366F1").opacity(0.4), .clear], center: .center, startRadius: 0, endRadius: 60)
            )
            .scaleEffect(scale)
            .opacity(opacity)
            .allowsHitTesting(false)
            .onAppear {
                withAnimation(.easeOut(duration: 0.5)) { scale = 2.5 }
                withAnimation(.easeIn(duration: 0.3).delay(0.3)) { opacity = 0 }
            }
    }
}

struct WaooOverlay: View {
    @State private var scale: CGFloat = 0.5
    @State private var opacity: Double = 1

    var body: some View {
        Image(systemName: "star.fill")
            .font(.system(size: 30))
            .foregroundStyle(
                LinearGradient(colors: [.yellow, .orange], startPoint: .top, endPoint: .bottom)
            )
            .scaleEffect(scale)
            .opacity(opacity)
            .allowsHitTesting(false)
            .onAppear {
                withAnimation(.spring(response: 0.3, dampingFraction: 0.4)) { scale = 1.5 }
                withAnimation(.easeOut(duration: 0.3).delay(0.5)) {
                    scale = 0
                    opacity = 0
                }
            }
    }
}

// MARK: - Persistent Effects (continuous looping)

struct GlowEffect: ViewModifier {
    let active: Bool
    let intensity: Double
    @State private var glowing = false

    func body(content: Content) -> some View {
        content
            .shadow(
                color: Color(hex: "#6366F1").opacity(active ? (glowing ? intensity : intensity * 0.3) : 0),
                radius: active ? (glowing ? 12 : 4) : 0
            )
            .onAppear {
                guard active else { return }
                withAnimation(.easeInOut(duration: 1.5).repeatForever(autoreverses: true)) {
                    glowing = true
                }
            }
    }
}

struct PulseEffect: ViewModifier {
    let active: Bool
    @State private var pulsing = false

    func body(content: Content) -> some View {
        content
            .scaleEffect(active ? (pulsing ? 1.02 : 1.0) : 1.0)
            .onAppear {
                guard active else { return }
                withAnimation(.easeInOut(duration: 1.0).repeatForever(autoreverses: true)) {
                    pulsing = true
                }
            }
    }
}

struct RainbowEffect: ViewModifier {
    let active: Bool
    @State private var hueRotation: Double = 0

    func body(content: Content) -> some View {
        content
            .overlay {
                if active {
                    RoundedRectangle(cornerRadius: 16)
                        .stroke(
                            AngularGradient(colors: [.red, .orange, .yellow, .green, .blue, .purple, .red], center: .center),
                            lineWidth: 2
                        )
                        .hueRotation(.degrees(hueRotation))
                        .opacity(0.6)
                }
            }
            .onAppear {
                guard active else { return }
                withAnimation(.linear(duration: 3).repeatForever(autoreverses: false)) {
                    hueRotation = 360
                }
            }
    }
}

struct SparkleEffect: ViewModifier {
    let active: Bool

    func body(content: Content) -> some View {
        content
            .overlay {
                if active {
                    TimelineView(.animation(minimumInterval: 0.1)) { timeline in
                        Canvas { context, size in
                            let time = timeline.date.timeIntervalSinceReferenceDate
                            for i in 0..<8 {
                                let phase = time + Double(i) * 0.5
                                let x = (sin(phase * 1.3 + Double(i)) * 0.4 + 0.5) * size.width
                                let y = (cos(phase * 0.9 + Double(i) * 0.7) * 0.4 + 0.5) * size.height
                                let sparkleSize = (sin(phase * 2 + Double(i)) * 0.5 + 0.5) * 6 + 2
                                let sparkleOpacity = sin(phase * 2 + Double(i)) * 0.3 + 0.4

                                context.opacity = sparkleOpacity
                                let rect = CGRect(x: x - sparkleSize / 2, y: y - sparkleSize / 2, width: sparkleSize, height: sparkleSize)
                                context.fill(Path(ellipseIn: rect), with: .color(.white))
                            }
                        }
                    }
                    .allowsHitTesting(false)
                }
            }
    }
}

// MARK: - Convenience Extension

extension View {
    func messageEffects(_ effects: MessageEffects, hasPlayedAppearance: Bool) -> some View {
        self
            .modifier(ShakeEffect(active: effects.flags.contains(.shake) && !hasPlayedAppearance))
            .modifier(ZoomEffect(active: effects.flags.contains(.zoom) && !hasPlayedAppearance))
            .modifier(ExplodeEffect(active: effects.flags.contains(.explode) && !hasPlayedAppearance))
            .modifier(WaooEffect(active: effects.flags.contains(.waoo) && !hasPlayedAppearance))
            .modifier(GlowEffect(active: effects.flags.contains(.glow), intensity: effects.glowIntensity ?? 0.5))
            .modifier(PulseEffect(active: effects.flags.contains(.pulse)))
            .modifier(RainbowEffect(active: effects.flags.contains(.rainbow)))
            .modifier(SparkleEffect(active: effects.flags.contains(.sparkle)))
            .overlay {
                if effects.flags.contains(.confetti) && !hasPlayedAppearance { ConfettiOverlay() }
                if effects.flags.contains(.fireworks) && !hasPlayedAppearance { FireworksOverlay() }
            }
    }
}
