//
//  ConfettiView.swift
//  Meeshy
//
//  Celebratory confetti animation for registration completion
//  Features colorful particles with physics-based animation
//

import SwiftUI

struct ConfettiView: View {
    @Binding var isActive: Bool

    @State private var confettiPieces: [ConfettiPiece] = []
    @State private var timer: Timer?

    private let colors: [Color] = [
        .red, .orange, .yellow, .green, .blue, .purple, .pink,
        Color(hex: "007AFF") ?? .blue, Color(hex: "34C759") ?? .green, Color(hex: "FF9500") ?? .orange
    ]

    var body: some View {
        GeometryReader { geometry in
            ZStack {
                ForEach(confettiPieces) { piece in
                    ConfettiPieceView(piece: piece)
                }
            }
            .onChange(of: isActive) { active in
                if active {
                    startConfetti(in: geometry.size)
                } else {
                    stopConfetti()
                }
            }
            .onDisappear {
                stopConfetti()
            }
        }
        .allowsHitTesting(false)
    }

    private func startConfetti(in size: CGSize) {
        // Initial burst
        for i in 0..<50 {
            DispatchQueue.main.asyncAfter(deadline: .now() + Double(i) * 0.02) {
                addConfettiPiece(in: size, fromCenter: true)
            }
        }

        // Continuous rain from top
        timer = Timer.scheduledTimer(withTimeInterval: 0.05, repeats: true) { _ in
            if confettiPieces.count < 100 {
                addConfettiPiece(in: size, fromCenter: false)
            }
        }

        // Auto-stop after 3 seconds
        DispatchQueue.main.asyncAfter(deadline: .now() + 3) {
            withAnimation {
                isActive = false
            }
        }
    }

    private func stopConfetti() {
        timer?.invalidate()
        timer = nil

        // Fade out existing pieces
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) {
            confettiPieces.removeAll()
        }
    }

    private func addConfettiPiece(in size: CGSize, fromCenter: Bool) {
        let piece = ConfettiPiece(
            id: UUID(),
            position: fromCenter
                ? CGPoint(x: size.width / 2, y: size.height / 2)
                : CGPoint(x: CGFloat.random(in: 0...size.width), y: -20),
            velocity: fromCenter
                ? CGPoint(
                    x: CGFloat.random(in: -200...200),
                    y: CGFloat.random(in: -400...(-100))
                )
                : CGPoint(
                    x: CGFloat.random(in: -50...50),
                    y: CGFloat.random(in: 100...300)
                ),
            color: colors.randomElement() ?? .blue,
            rotation: CGFloat.random(in: 0...360),
            rotationSpeed: CGFloat.random(in: -360...360),
            scale: CGFloat.random(in: 0.5...1.2),
            shape: ConfettiShape.allCases.randomElement() ?? .rectangle
        )

        confettiPieces.append(piece)

        // Remove after animation completes
        DispatchQueue.main.asyncAfter(deadline: .now() + 3) {
            confettiPieces.removeAll { $0.id == piece.id }
        }
    }
}

// MARK: - Confetti Piece Model

struct ConfettiPiece: Identifiable {
    let id: UUID
    var position: CGPoint
    var velocity: CGPoint
    let color: Color
    var rotation: CGFloat
    let rotationSpeed: CGFloat
    let scale: CGFloat
    let shape: ConfettiShape
}

enum ConfettiShape: CaseIterable {
    case rectangle
    case circle
    case triangle
    case star
}

// MARK: - Confetti Piece View

struct ConfettiPieceView: View {
    let piece: ConfettiPiece

    @State private var animatedPosition: CGPoint = .zero
    @State private var animatedRotation: CGFloat = 0
    @State private var opacity: Double = 1

    var body: some View {
        Group {
            switch piece.shape {
            case .rectangle:
                Rectangle()
                    .fill(piece.color)
                    .frame(width: 8 * piece.scale, height: 12 * piece.scale)

            case .circle:
                Circle()
                    .fill(piece.color)
                    .frame(width: 10 * piece.scale, height: 10 * piece.scale)

            case .triangle:
                OnboardingTriangle()
                    .fill(piece.color)
                    .frame(width: 10 * piece.scale, height: 10 * piece.scale)

            case .star:
                Image(systemName: "star.fill")
                    .font(.system(size: 10 * piece.scale))
                    .foregroundColor(piece.color)
            }
        }
        .rotationEffect(.degrees(animatedRotation))
        .position(animatedPosition)
        .opacity(opacity)
        .onAppear {
            animatedPosition = piece.position
            animatedRotation = piece.rotation

            // Animate falling with gravity
            withAnimation(.easeIn(duration: 2.5)) {
                animatedPosition = CGPoint(
                    x: piece.position.x + piece.velocity.x,
                    y: piece.position.y + piece.velocity.y + 500 // gravity
                )
            }

            // Continuous rotation
            withAnimation(.linear(duration: 2.5)) {
                animatedRotation = piece.rotation + piece.rotationSpeed * 3
            }

            // Fade out
            withAnimation(.easeIn(duration: 2.5).delay(0.5)) {
                opacity = 0
            }
        }
    }
}

// MARK: - Success Checkmark Animation

struct SuccessCheckmarkView: View {
    @State private var isAnimating = false
    @State private var checkmarkProgress: CGFloat = 0

    var body: some View {
        ZStack {
            // Background circle
            Circle()
                .fill(Color.green.opacity(0.15))
                .frame(width: 120, height: 120)
                .scaleEffect(isAnimating ? 1 : 0)

            // Checkmark circle
            Circle()
                .stroke(Color.green, lineWidth: 4)
                .frame(width: 80, height: 80)
                .scaleEffect(isAnimating ? 1 : 0)

            // Checkmark
            CheckmarkShape()
                .trim(from: 0, to: checkmarkProgress)
                .stroke(Color.green, style: StrokeStyle(lineWidth: 4, lineCap: .round, lineJoin: .round))
                .frame(width: 40, height: 30)
        }
        .onAppear {
            withAnimation(.spring(response: 0.5, dampingFraction: 0.6)) {
                isAnimating = true
            }

            withAnimation(.easeInOut(duration: 0.4).delay(0.3)) {
                checkmarkProgress = 1
            }
        }
    }
}

struct CheckmarkShape: Shape {
    func path(in rect: CGRect) -> Path {
        var path = Path()
        path.move(to: CGPoint(x: rect.minX, y: rect.midY))
        path.addLine(to: CGPoint(x: rect.width * 0.35, y: rect.maxY))
        path.addLine(to: CGPoint(x: rect.maxX, y: rect.minY))
        return path
    }
}

struct OnboardingTriangle: Shape {
    func path(in rect: CGRect) -> Path {
        var path = Path()
        path.move(to: CGPoint(x: rect.midX, y: rect.minY))
        path.addLine(to: CGPoint(x: rect.maxX, y: rect.maxY))
        path.addLine(to: CGPoint(x: rect.minX, y: rect.maxY))
        path.closeSubpath()
        return path
    }
}

// MARK: - Celebration Header

struct CelebrationHeader: View {
    let title: String
    let subtitle: String

    @State private var emojiScale: CGFloat = 0
    @State private var textOpacity: Double = 0

    var body: some View {
        VStack(spacing: 16) {
            Text("🎉")
                .font(.system(size: 80))
                .scaleEffect(emojiScale)

            VStack(spacing: 8) {
                Text(title)
                    .font(.system(size: 28, weight: .bold))
                    .foregroundColor(.primary)

                Text(subtitle)
                    .font(.system(size: 16))
                    .foregroundColor(.secondary)
                    .multilineTextAlignment(.center)
            }
            .opacity(textOpacity)
        }
        .onAppear {
            withAnimation(.spring(response: 0.6, dampingFraction: 0.5)) {
                emojiScale = 1
            }

            withAnimation(.easeOut(duration: 0.4).delay(0.3)) {
                textOpacity = 1
            }
        }
    }
}

// MARK: - Preview

#Preview {
    ZStack {
        Color(.systemBackground)
            .ignoresSafeArea()

        VStack(spacing: 40) {
            SuccessCheckmarkView()

            CelebrationHeader(
                title: "Bienvenue sur Meeshy!",
                subtitle: "Ton compte a été créé avec succès"
            )
        }

        ConfettiView(isActive: .constant(true))
    }
}
