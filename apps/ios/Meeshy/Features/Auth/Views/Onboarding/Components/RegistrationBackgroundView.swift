//
//  RegistrationBackgroundView.swift
//  Meeshy
//
//  Arrière-plans animés pour les 8 étapes d'inscription
//  Chaque étape a une scène unique avec des animations fluides
//

import SwiftUI

// MARK: - Registration Background View

struct RegistrationBackgroundView: View {
    let step: NewRegistrationStep
    @State private var animationPhase: CGFloat = 0

    var body: some View {
        GeometryReader { geometry in
            ZStack {
                // Gradient de base
                backgroundGradient

                // Éléments décoratifs animés selon l'étape
                decorativeElements(in: geometry.size)

                // Overlay pour assurer la lisibilité
                Color.black.opacity(0.15)
            }
        }
        .ignoresSafeArea()
        .onAppear {
            withAnimation(.linear(duration: 20).repeatForever(autoreverses: false)) {
                animationPhase = 1
            }
        }
    }

    // MARK: - Background Gradient

    private var backgroundGradient: some View {
        LinearGradient(
            colors: gradientColors,
            startPoint: .topLeading,
            endPoint: .bottomTrailing
        )
    }

    private var gradientColors: [Color] {
        switch step {
        case .pseudo:
            return [
                Color(red: 0.1, green: 0.15, blue: 0.35),
                Color(red: 0.2, green: 0.3, blue: 0.6),
                Color(red: 0.15, green: 0.2, blue: 0.45)
            ]
        case .phone:
            return [
                Color(red: 0.1, green: 0.25, blue: 0.35),
                Color(red: 0.15, green: 0.4, blue: 0.5),
                Color(red: 0.1, green: 0.3, blue: 0.4)
            ]
        case .email:
            return [
                Color(red: 0.35, green: 0.15, blue: 0.1),
                Color(red: 0.5, green: 0.25, blue: 0.1),
                Color(red: 0.4, green: 0.2, blue: 0.1)
            ]
        case .identity:
            return [
                Color(red: 0.35, green: 0.1, blue: 0.25),
                Color(red: 0.5, green: 0.15, blue: 0.35),
                Color(red: 0.4, green: 0.1, blue: 0.3)
            ]
        case .password:
            return [
                Color(red: 0.25, green: 0.1, blue: 0.4),
                Color(red: 0.35, green: 0.2, blue: 0.55),
                Color(red: 0.3, green: 0.15, blue: 0.5)
            ]
        case .language:
            return [
                Color(red: 0.05, green: 0.3, blue: 0.2),
                Color(red: 0.1, green: 0.45, blue: 0.3),
                Color(red: 0.08, green: 0.35, blue: 0.25)
            ]
        case .profile:
            return [
                Color(red: 0.4, green: 0.25, blue: 0.05),
                Color(red: 0.55, green: 0.35, blue: 0.1),
                Color(red: 0.45, green: 0.3, blue: 0.08)
            ]
        case .complete:
            return [
                Color(red: 0.0, green: 0.3, blue: 0.15),
                Color(red: 0.0, green: 0.45, blue: 0.2),
                Color(red: 0.0, green: 0.35, blue: 0.18)
            ]
        }
    }

    // MARK: - Decorative Elements

    @ViewBuilder
    private func decorativeElements(in size: CGSize) -> some View {
        switch step {
        case .pseudo:
            PseudoSceneView(size: size, phase: animationPhase)
        case .phone:
            PhoneSceneView(size: size, phase: animationPhase)
        case .email:
            EmailSceneView(size: size, phase: animationPhase)
        case .identity:
            IdentitySceneView(size: size, phase: animationPhase)
        case .password:
            PasswordSceneView(size: size, phase: animationPhase)
        case .language:
            LanguageSceneView(size: size, phase: animationPhase)
        case .profile:
            ProfileSceneView(size: size, phase: animationPhase)
        case .complete:
            CompleteSceneView(size: size, phase: animationPhase)
        }
    }
}

// MARK: - Scene Views for Each Step

// Step 1: Pseudo - Avatars flottants et badges
struct PseudoSceneView: View {
    let size: CGSize
    let phase: CGFloat

    private let accentColor = Color(red: 0.4, green: 0.6, blue: 1.0)

    var body: some View {
        ZStack {
            concentricCircles
            floatingProfiles
            animatedBadge
        }
    }

    private var concentricCircles: some View {
        ForEach(0..<5, id: \.self) { i in
            let opacity = 0.1 - Double(i) * 0.015
            let frameSize = 100 + CGFloat(i) * 80
            let scale = 1 + sin(phase * .pi * 2 + Double(i) * 0.5) * 0.05

            Circle()
                .stroke(accentColor.opacity(opacity), lineWidth: 1)
                .frame(width: frameSize, height: frameSize)
                .position(x: size.width * 0.7, y: size.height * 0.3)
                .scaleEffect(scale)
        }
    }

    private var floatingProfiles: some View {
        ForEach(0..<6, id: \.self) { i in
            let fontSize = 20 + CGFloat(i) * 5
            let xPos = size.width * (0.1 + CGFloat(i) * 0.15)
            let yOffset = sin(phase * .pi * 2 + Double(i)) * 0.1
            let yPos = size.height * (0.7 + yOffset)
            let rotation = sin(phase * .pi * 2 + Double(i)) * 10

            Image(systemName: "person.crop.circle")
                .font(.system(size: fontSize))
                .foregroundColor(accentColor.opacity(0.2))
                .position(x: xPos, y: yPos)
                .rotationEffect(.degrees(rotation))
        }
    }

    private var animatedBadge: some View {
        let scale = 1 + sin(phase * .pi * 4) * 0.2

        return Image(systemName: "plus.circle.fill")
            .font(.system(size: 40))
            .foregroundColor(accentColor.opacity(0.3))
            .position(x: size.width * 0.85, y: size.height * 0.2)
            .scaleEffect(scale)
    }
}

// Step 2: Phone - Ondes de communication
struct PhoneSceneView: View {
    let size: CGSize
    let phase: CGFloat

    private let accentColor = Color(red: 0.3, green: 0.7, blue: 0.9)

    var body: some View {
        ZStack {
            signalWaves
            phoneIcon
            floatingMessages
        }
    }

    private var signalWaves: some View {
        ForEach(0..<4, id: \.self) { i in
            let opacity = 0.15 - Double(i) * 0.03
            let width = 60 + CGFloat(i) * 40
            let height = 80 + CGFloat(i) * 50
            let wavePhase = (phase + Double(i) * 0.25).truncatingRemainder(dividingBy: 1)
            let scale = 1 + wavePhase * 0.3
            let waveOpacity = 1 - wavePhase

            RoundedRectangle(cornerRadius: 20)
                .stroke(accentColor.opacity(opacity), lineWidth: 2)
                .frame(width: width, height: height)
                .position(x: size.width * 0.2, y: size.height * 0.25)
                .scaleEffect(scale)
                .opacity(waveOpacity)
        }
    }

    private var phoneIcon: some View {
        let rotation = sin(phase * .pi * 2) * 5

        return Image(systemName: "phone.fill")
            .font(.system(size: 50))
            .foregroundColor(accentColor.opacity(0.25))
            .position(x: size.width * 0.2, y: size.height * 0.25)
            .rotationEffect(.degrees(rotation))
    }

    private var floatingMessages: some View {
        ForEach(0..<3, id: \.self) { i in
            let xPos = size.width * (0.6 + CGFloat(i) * 0.15)
            let yOffset = sin(phase * .pi * 2 + Double(i)) * 0.15
            let yPos = size.height * (0.6 + yOffset)

            Image(systemName: "message.fill")
                .font(.system(size: 25))
                .foregroundColor(accentColor.opacity(0.15))
                .position(x: xPos, y: yPos)
        }
    }
}

// Step 3: Email - Enveloppes volantes
struct EmailSceneView: View {
    let size: CGSize
    let phase: CGFloat

    private let accentColor = Color(red: 0.95, green: 0.5, blue: 0.2)

    var body: some View {
        ZStack {
            flyingEnvelopes
            giantAt
            connectionDots
        }
    }

    private var flyingEnvelopes: some View {
        ForEach(0..<5, id: \.self) { i in
            let fontSize = 20 + CGFloat(i) * 8
            let opacity = 0.2 - Double(i) * 0.03
            let baseX = size.width * (0.1 + CGFloat(i) * 0.2)
            let xPos = (baseX + phase * size.width * 0.3).truncatingRemainder(dividingBy: size.width)
            let yOffset = sin(phase * .pi * 2 + Double(i)) * 0.15
            let yPos = size.height * (0.3 + yOffset)
            let rotation = -15 + sin(phase * .pi * 2 + Double(i)) * 10

            Image(systemName: "envelope.fill")
                .font(.system(size: fontSize))
                .foregroundColor(accentColor.opacity(opacity))
                .position(x: xPos, y: yPos)
                .rotationEffect(.degrees(rotation))
        }
    }

    private var giantAt: some View {
        let rotation = sin(phase * .pi) * 5

        return Text("@")
            .font(.system(size: 150, weight: .ultraLight))
            .foregroundColor(accentColor.opacity(0.1))
            .position(x: size.width * 0.75, y: size.height * 0.7)
            .rotationEffect(.degrees(rotation))
    }

    private var connectionDots: some View {
        ForEach(0..<8, id: \.self) { i in
            let angle = Double(i) * .pi / 4 + phase * .pi * 2
            let xPos = size.width * 0.5 + cos(angle) * 80
            let yPos = size.height * 0.5 + sin(angle) * 80

            Circle()
                .fill(accentColor.opacity(0.2))
                .frame(width: 6, height: 6)
                .position(x: xPos, y: yPos)
        }
    }
}

// Step 4: Identity - Cartes d'identité flottantes
struct IdentitySceneView: View {
    let size: CGSize
    let phase: CGFloat

    private let accentColor = Color(red: 0.8, green: 0.3, blue: 0.6)

    var body: some View {
        ZStack {
            idCards
            personSilhouettes
        }
    }

    private var idCards: some View {
        ForEach(0..<3, id: \.self) { i in
            let xPos = size.width * (0.2 + CGFloat(i) * 0.3)
            let yPos = size.height * (0.2 + CGFloat(i) * 0.1)
            let baseRotation = -10 + Double(i) * 10
            let animRotation = sin(phase * .pi * 2) * 3
            let rotation3D = sin(phase * .pi * 2 + Double(i)) * 15

            RoundedRectangle(cornerRadius: 12)
                .fill(accentColor.opacity(0.1))
                .frame(width: 120, height: 80)
                .overlay(
                    RoundedRectangle(cornerRadius: 12)
                        .stroke(accentColor.opacity(0.2), lineWidth: 1)
                )
                .position(x: xPos, y: yPos)
                .rotationEffect(.degrees(baseRotation + animRotation))
                .rotation3DEffect(.degrees(rotation3D), axis: (x: 0.5, y: 1, z: 0))
        }
    }

    private var personSilhouettes: some View {
        ForEach(0..<4, id: \.self) { i in
            let fontSize = 30 + CGFloat(i) * 10
            let xPos = size.width * (0.15 + CGFloat(i) * 0.25)
            let yOffset = sin(phase * .pi * 2 + Double(i) * 0.5) * 0.08
            let yPos = size.height * (0.7 + yOffset)

            Image(systemName: "person.fill")
                .font(.system(size: fontSize))
                .foregroundColor(accentColor.opacity(0.15))
                .position(x: xPos, y: yPos)
        }
    }
}

// Step 5: Password - Boucliers et verrous
struct PasswordSceneView: View {
    let size: CGSize
    let phase: CGFloat

    private let accentColor = Color(red: 0.6, green: 0.4, blue: 1.0)

    var body: some View {
        ZStack {
            centralShield
            orbitingLocks
            passwordDots
        }
    }

    private var centralShield: some View {
        let scale = 1 + sin(phase * .pi * 2) * 0.05

        return Image(systemName: "shield.fill")
            .font(.system(size: 120))
            .foregroundColor(accentColor.opacity(0.15))
            .position(x: size.width * 0.5, y: size.height * 0.4)
            .scaleEffect(scale)
    }

    private var orbitingLocks: some View {
        ForEach(0..<6, id: \.self) { i in
            let angle = Double(i) * .pi / 3 + phase * .pi * 2
            let xPos = size.width * 0.5 + cos(angle) * 100
            let yPos = size.height * 0.4 + sin(angle) * 100
            let rotation = phase * 360

            Image(systemName: "lock.fill")
                .font(.system(size: 20))
                .foregroundColor(accentColor.opacity(0.25))
                .position(x: xPos, y: yPos)
                .rotationEffect(.degrees(rotation))
        }
    }

    private var passwordDots: some View {
        ForEach(0..<8, id: \.self) { i in
            let xPos = size.width * (0.2 + CGFloat(i) * 0.08)
            let dotPhase = (phase * 8 + Double(i)).truncatingRemainder(dividingBy: 1)
            let scale: CGFloat = dotPhase > 0.5 ? 1.2 : 1.0

            Text("•")
                .font(.system(size: 30))
                .foregroundColor(accentColor.opacity(0.3))
                .position(x: xPos, y: size.height * 0.75)
                .scaleEffect(scale)
        }
    }
}

// Step 6: Language - Globe et drapeaux
struct LanguageSceneView: View {
    let size: CGSize
    let phase: CGFloat

    private let accentColor = Color(red: 0.2, green: 0.8, blue: 0.5)
    private let flags = ["🇫🇷", "🇬🇧", "🇪🇸", "🇩🇪", "🇨🇲", "🇳🇬", "🇸🇳", "🇨🇮"]

    var body: some View {
        ZStack {
            centralGlobe
            orbits
            orbitingFlags
            translationBubbles
        }
    }

    private var centralGlobe: some View {
        let rotation = phase * 360

        return Image(systemName: "globe.europe.africa.fill")
            .font(.system(size: 150))
            .foregroundColor(accentColor.opacity(0.2))
            .position(x: size.width * 0.5, y: size.height * 0.4)
            .rotationEffect(.degrees(rotation))
    }

    private var orbits: some View {
        ForEach(0..<3, id: \.self) { i in
            let width = 200 + CGFloat(i) * 60
            let height = 100 + CGFloat(i) * 30
            let rotation = Double(i) * 30

            Ellipse()
                .stroke(accentColor.opacity(0.15), lineWidth: 1)
                .frame(width: width, height: height)
                .position(x: size.width * 0.5, y: size.height * 0.4)
                .rotationEffect(.degrees(rotation))
        }
    }

    private var orbitingFlags: some View {
        ForEach(0..<8, id: \.self) { i in
            let angle = Double(i) * .pi / 4 + phase * .pi * 2
            let radius = 120 + CGFloat(i % 3) * 30
            let radiusY = 60 + CGFloat(i % 3) * 15
            let xPos = size.width * 0.5 + cos(angle) * radius
            let yPos = size.height * 0.4 + sin(angle) * radiusY

            Text(flags[i])
                .font(.system(size: 25))
                .position(x: xPos, y: yPos)
        }
    }

    private var translationBubbles: some View {
        ForEach(0..<4, id: \.self) { i in
            let xPos = size.width * (0.15 + CGFloat(i) * 0.25)
            let yOffset = sin(phase * .pi * 2 + Double(i)) * 0.05
            let yPos = size.height * (0.75 + yOffset)

            Image(systemName: "bubble.left.and.bubble.right.fill")
                .font(.system(size: 25))
                .foregroundColor(accentColor.opacity(0.2))
                .position(x: xPos, y: yPos)
        }
    }
}

// Step 7: Profile - Cadres photos et appareil
struct ProfileSceneView: View {
    let size: CGSize
    let phase: CGFloat

    private let accentColor = Color(red: 0.95, green: 0.6, blue: 0.1)

    var body: some View {
        ZStack {
            polaroids
            cameraIcon
            flashEffect
            editingIcons
        }
    }

    private var polaroids: some View {
        ForEach(0..<4, id: \.self) { i in
            let xPos = size.width * (0.2 + CGFloat(i) * 0.22)
            let yOffset = sin(phase * .pi * 2 + Double(i) * 0.5) * 0.08
            let yPos = size.height * (0.25 + yOffset)
            let baseRotation = -15 + Double(i) * 12
            let animRotation = sin(phase * .pi * 2) * 5

            PolaroidView(accentColor: accentColor)
                .position(x: xPos, y: yPos)
                .rotationEffect(.degrees(baseRotation + animRotation))
                .shadow(color: .black.opacity(0.2), radius: 5)
        }
    }

    private var cameraIcon: some View {
        let scale = 1 + sin(phase * .pi * 4) * 0.1

        return Image(systemName: "camera.fill")
            .font(.system(size: 60))
            .foregroundColor(accentColor.opacity(0.3))
            .position(x: size.width * 0.5, y: size.height * 0.55)
            .scaleEffect(scale)
    }

    private var flashEffect: some View {
        let isFlashing = sin(phase * .pi * 8) > 0.9

        return Circle()
            .fill(Color.white.opacity(isFlashing ? 0.3 : 0))
            .frame(width: 200, height: 200)
            .position(x: size.width * 0.5, y: size.height * 0.55)
    }

    private var editingIcons: some View {
        let icons = ["wand.and.stars", "crop", "paintbrush.fill", "sparkles", "slider.horizontal.3"]

        return ForEach(0..<5, id: \.self) { i in
            let xPos = size.width * (0.1 + CGFloat(i) * 0.2)
            let rotation = sin(phase * .pi * 2 + Double(i)) * 15

            Image(systemName: icons[i])
                .font(.system(size: 20))
                .foregroundColor(accentColor.opacity(0.2))
                .position(x: xPos, y: size.height * 0.85)
                .rotationEffect(.degrees(rotation))
        }
    }
}

struct PolaroidView: View {
    let accentColor: Color

    var body: some View {
        RoundedRectangle(cornerRadius: 4)
            .fill(Color.white.opacity(0.1))
            .frame(width: 80, height: 100)
            .overlay(
                VStack(spacing: 0) {
                    Rectangle()
                        .fill(accentColor.opacity(0.2))
                        .frame(height: 70)
                    Spacer()
                }
            )
    }
}

// Step 8: Complete - Célébration avec confettis
struct CompleteSceneView: View {
    let size: CGSize
    let phase: CGFloat

    private let accentColor = Color(red: 0.0, green: 0.78, blue: 0.35)
    private let confettiColors: [Color] = [.red, .orange, .yellow, .green, .blue, .purple, .pink]

    var body: some View {
        ZStack {
            lightRays
            centralCheckmark
            confetti
            welcomeText
        }
    }

    private var lightRays: some View {
        ForEach(0..<12, id: \.self) { i in
            let rotation = Double(i) * 30 + phase * 30

            Rectangle()
                .fill(
                    LinearGradient(
                        colors: [accentColor.opacity(0.2), .clear],
                        startPoint: .center,
                        endPoint: .top
                    )
                )
                .frame(width: 4, height: size.height * 0.6)
                .position(x: size.width * 0.5, y: size.height * 0.4)
                .rotationEffect(.degrees(rotation))
        }
    }

    private var centralCheckmark: some View {
        let scale = 1 + sin(phase * .pi * 4) * 0.1

        return Image(systemName: "checkmark.seal.fill")
            .font(.system(size: 100))
            .foregroundColor(accentColor.opacity(0.3))
            .position(x: size.width * 0.5, y: size.height * 0.35)
            .scaleEffect(scale)
    }

    private var confetti: some View {
        ForEach(0..<20, id: \.self) { i in
            let xPos = CGFloat(i * 20).truncatingRemainder(dividingBy: size.width)
            let yPos = (CGFloat(i) * 50 - phase * size.height * 2).truncatingRemainder(dividingBy: size.height)
            let rotation = phase * 360 * (i % 2 == 0 ? 1 : -1)
            let color = confettiColors[i % confettiColors.count]

            RoundedRectangle(cornerRadius: 2)
                .fill(color.opacity(0.6))
                .frame(width: 8, height: 12)
                .position(x: xPos, y: yPos)
                .rotationEffect(.degrees(rotation))
        }
    }

    private var welcomeText: some View {
        let scale = 1 + sin(phase * .pi * 2) * 0.05

        return Text("BIENVENUE!")
            .font(.system(size: 40, weight: .black))
            .foregroundColor(accentColor.opacity(0.15))
            .position(x: size.width * 0.5, y: size.height * 0.75)
            .scaleEffect(scale)
    }
}

// MARK: - Preview

#Preview {
    TabView {
        ForEach(NewRegistrationStep.allCases) { step in
            RegistrationBackgroundView(step: step)
                .overlay(
                    VStack {
                        Text(step.title)
                            .font(.largeTitle.bold())
                            .foregroundColor(.white)
                        Text(step.funHeader)
                            .font(.headline)
                            .foregroundColor(.white.opacity(0.8))
                    }
                )
                .tag(step)
        }
    }
    .tabViewStyle(.page)
}
