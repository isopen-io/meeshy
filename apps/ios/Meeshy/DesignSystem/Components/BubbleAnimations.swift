//
//  BubbleAnimations.swift
//  Meeshy
//
//  Premium animations for message bubbles
//  Spring animations, particle effects, haptic feedback
//  iOS 16+
//

import SwiftUI

// MARK: - Animation Configurations

struct BubbleAnimationConfig {
    /// Spring animation for bubble entrance
    static let entrance = Animation.spring(
        response: 0.5,
        dampingFraction: 0.7,
        blendDuration: 0.2
    )

    /// Smooth spring for interactions
    static let interaction = Animation.spring(
        response: 0.3,
        dampingFraction: 0.8
    )

    /// Quick bounce for reactions
    static let reaction = Animation.spring(
        response: 0.25,
        dampingFraction: 0.6
    )

    /// Gentle float animation
    static let float = Animation.easeInOut(duration: 2.0)
        .repeatForever(autoreverses: true)

    /// Pulse animation for sending state
    static let pulse = Animation.easeInOut(duration: 1.0)
        .repeatForever(autoreverses: true)
}

// MARK: - Bubble Entrance Animation

struct BubbleEntranceModifier: ViewModifier {
    let delay: Double
    let isOwnMessage: Bool
    @State private var appeared = false

    func body(content: Content) -> some View {
        content
            .offset(
                x: appeared ? 0 : (isOwnMessage ? 50 : -50),
                y: appeared ? 0 : 20
            )
            .opacity(appeared ? 1 : 0)
            .scaleEffect(appeared ? 1 : 0.85)
            .onAppear {
                withAnimation(
                    BubbleAnimationConfig.entrance
                        .delay(delay)
                ) {
                    appeared = true
                }
            }
    }
}

// MARK: - Floating Animation (for sending state)

struct FloatingModifier: ViewModifier {
    @State private var isFloating = false

    func body(content: Content) -> some View {
        content
            .offset(y: isFloating ? -3 : 3)
            .onAppear {
                withAnimation(BubbleAnimationConfig.float) {
                    isFloating.toggle()
                }
            }
    }
}

// MARK: - Pulse Animation (for loading/sending)

struct PulseModifier: ViewModifier {
    @State private var isPulsing = false

    func body(content: Content) -> some View {
        content
            .opacity(isPulsing ? 0.6 : 1.0)
            .scaleEffect(isPulsing ? 0.98 : 1.0)
            .onAppear {
                withAnimation(BubbleAnimationConfig.pulse) {
                    isPulsing.toggle()
                }
            }
    }
}

// MARK: - Bounce on Tap Animation

struct BounceOnTapModifier: ViewModifier {
    @State private var scale: CGFloat = 1.0

    func body(content: Content) -> some View {
        content
            .scaleEffect(scale)
            .simultaneousGesture(
                DragGesture(minimumDistance: 0)
                    .onChanged { _ in
                        withAnimation(BubbleAnimationConfig.interaction) {
                            scale = 0.95
                        }
                    }
                    .onEnded { _ in
                        withAnimation(BubbleAnimationConfig.interaction) {
                            scale = 1.0
                        }
                    }
            )
    }
}

// MARK: - Reaction Pop Animation

struct ReactionPopModifier: ViewModifier {
    @State private var scale: CGFloat = 0
    @State private var rotation: Double = -10

    func body(content: Content) -> some View {
        content
            .scaleEffect(scale)
            .rotationEffect(.degrees(rotation))
            .onAppear {
                withAnimation(BubbleAnimationConfig.reaction) {
                    scale = 1.0
                    rotation = 0
                }
            }
    }
}

// MARK: - Wiggle Animation (for errors)

struct WiggleModifier: ViewModifier {
    @State private var offset: CGFloat = 0
    let shouldWiggle: Bool

    func body(content: Content) -> some View {
        content
            .offset(x: offset)
            .onChange(of: shouldWiggle) { newValue in
                if newValue {
                    performWiggle()
                }
            }
    }

    private func performWiggle() {
        let sequence = [0, -10, 10, -8, 8, -5, 5, 0]
        var delay = 0.0

        for value in sequence {
            DispatchQueue.main.asyncAfter(deadline: .now() + delay) {
                withAnimation(.easeInOut(duration: 0.1)) {
                    offset = CGFloat(value)
                }
            }
            delay += 0.1
        }
    }
}

// MARK: - Particle Effect for Reactions

struct ParticleEffect: View {
    let emoji: String
    @State private var particles: [Particle] = []

    struct Particle: Identifiable {
        let id = UUID()
        var offset: CGSize
        var opacity: Double
        var scale: CGFloat
        var rotation: Double
    }

    var body: some View {
        ZStack {
            ForEach(particles) { particle in
                Text(emoji)
                    .font(.system(size: 20))
                    .offset(particle.offset)
                    .opacity(particle.opacity)
                    .scaleEffect(particle.scale)
                    .rotationEffect(.degrees(particle.rotation))
            }
        }
        .onAppear {
            createParticles()
        }
    }

    private func createParticles() {
        // Create 5-8 particles
        let count = Int.random(in: 5...8)

        for i in 0..<count {
            let angle = Double(i) * (360.0 / Double(count))
            let distance: CGFloat = 40

            let particle = Particle(
                offset: .zero,
                opacity: 1.0,
                scale: 0.5,
                rotation: 0
            )

            particles.append(particle)

            // Animate particles
            let delay = Double(i) * 0.05

            DispatchQueue.main.asyncAfter(deadline: .now() + delay) {
                withAnimation(
                    .easeOut(duration: 0.6)
                ) {
                    particles[i].offset = CGSize(
                        width: cos(angle * .pi / 180) * distance,
                        height: sin(angle * .pi / 180) * distance
                    )
                    particles[i].opacity = 0
                    particles[i].scale = 1.2
                    particles[i].rotation = Double.random(in: -180...180)
                }
            }

            // Remove particle after animation
            DispatchQueue.main.asyncAfter(deadline: .now() + delay + 0.6) {
                particles.removeAll { $0.id == particle.id }
            }
        }
    }
}

// MARK: - Haptic Feedback Manager

enum HapticFeedback {
    case light
    case medium
    case heavy
    case success
    case warning
    case error
    case selection

    func trigger() {
        switch self {
        case .light:
            let generator = UIImpactFeedbackGenerator(style: .light)
            generator.impactOccurred()

        case .medium:
            let generator = UIImpactFeedbackGenerator(style: .medium)
            generator.impactOccurred()

        case .heavy:
            let generator = UIImpactFeedbackGenerator(style: .heavy)
            generator.impactOccurred()

        case .success:
            let generator = UINotificationFeedbackGenerator()
            generator.notificationOccurred(.success)

        case .warning:
            let generator = UINotificationFeedbackGenerator()
            generator.notificationOccurred(.warning)

        case .error:
            let generator = UINotificationFeedbackGenerator()
            generator.notificationOccurred(.error)

        case .selection:
            let generator = UISelectionFeedbackGenerator()
            generator.selectionChanged()
        }
    }
}

// MARK: - View Extensions

extension View {
    /// Animate bubble entrance with delay
    func bubbleEntrance(delay: Double = 0, isOwnMessage: Bool) -> some View {
        modifier(BubbleEntranceModifier(delay: delay, isOwnMessage: isOwnMessage))
    }

    /// Add floating animation
    func floatingEffect() -> some View {
        modifier(FloatingModifier())
    }

    /// Add pulse animation
    func pulseEffect() -> some View {
        modifier(PulseModifier())
    }

    /// Add bounce on tap
    func bounceOnTap() -> some View {
        modifier(BounceOnTapModifier())
    }

    /// Add reaction pop animation
    func reactionPop() -> some View {
        modifier(ReactionPopModifier())
    }

    /// Add wiggle animation
    func wiggle(shouldWiggle: Bool) -> some View {
        modifier(WiggleModifier(shouldWiggle: shouldWiggle))
    }
}

// MARK: - Advanced Spring Animations

extension Animation {
    /// Bouncy spring for playful interactions
    static let bouncySpring = Animation.spring(
        response: 0.4,
        dampingFraction: 0.6,
        blendDuration: 0.1
    )

    /// Smooth spring for elegant transitions
    static let smoothSpring = Animation.spring(
        response: 0.5,
        dampingFraction: 0.85,
        blendDuration: 0.2
    )

    /// Quick spring for immediate feedback
    static let quickSpring = Animation.spring(
        response: 0.2,
        dampingFraction: 0.75,
        blendDuration: 0.1
    )
}
