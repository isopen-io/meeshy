import SwiftUI
import MeeshySDK
import MeeshyUI

// MARK: - Animated Step Background

/// Decorative animated backdrop behind the registration wizard. Every glyph here
/// (SF Symbols + flag emojis at ~0.04–0.12 opacity, absolutely positioned and
/// animated) is **pure decoration** — the wizard content carries all meaning.
/// Doctrine : the `.font(.system(size:))` sizes below stay **fixed on purpose**
/// (they compose a layered animation; scaling them with Dynamic Type would
/// distort the positioning), and the whole layer is `.accessibilityHidden(true)`
/// so VoiceOver never reads the ambient symbols/flags.
struct AnimatedStepBackground: View {
    let step: RegistrationStep

    // The whole backdrop is `.repeatForever` ambience — orbs breathing, waves
    // scrolling, particles drifting — and it is the FIRST screen of the app.
    // Sustained motion of that kind is what Reduce Motion exists to stop
    // (vestibular disorders), so nothing here may animate when it is on.
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    @State private var animate = false
    @State private var wavePhase: CGFloat = 0

    /// Every decorative animation in this view passes through here, so the
    /// setting cannot be honoured in one decoration and missed in the next.
    /// Returns `nil` — the animation is *removed*, not shortened: a repeating
    /// animation with a smaller duration still never stops, it only beats
    /// faster.
    private func ambient(_ animation: Animation) -> Animation? {
        reduceMotion ? nil : animation
    }

    var body: some View {
        GeometryReader { geo in
            ZStack {
                LinearGradient(
                    colors: [
                        step.accentColor.opacity(0.08),
                        Color(.systemBackground).opacity(0.92),
                        step.accentColor.opacity(0.04)
                    ],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                )

                stepSpecificAnimation(in: geo.size)
                floatingParticles(in: geo.size)
                wavesOverlay(in: geo.size)
            }
        }
        .ignoresSafeArea()
        .accessibilityHidden(true)
        .onAppear { startAnimations() }
        .onDisappear { stopAnimations() }
        .adaptiveOnChange(of: step) { _, _ in restartAnimations() }
        // Deliberately NOT gated: this is the 0.6 s crossfade between two
        // onboarding steps — a discrete, self-terminating transition, not the
        // sustained ambience Reduce Motion targets.
        .animation(.easeInOut(duration: 0.6), value: step)
    }

    // MARK: - Animation Control

    private func startAnimations() {
        animate = false
        wavePhase = 0
        guard !reduceMotion else { return settleWithoutMotion() }
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) {
            withAnimation(.easeInOut(duration: 2.5).repeatForever(autoreverses: true)) {
                animate = true
            }
            withAnimation(.linear(duration: 5).repeatForever(autoreverses: false)) {
                wavePhase = .pi * 2
            }
        }
    }

    private func restartAnimations() {
        animate = false
        wavePhase = 0
        guard !reduceMotion else { return settleWithoutMotion() }
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.15) {
            withAnimation(.easeInOut(duration: 2.5).repeatForever(autoreverses: true)) {
                animate = true
            }
            withAnimation(.linear(duration: 5).repeatForever(autoreverses: false)) {
                wavePhase = .pi * 2
            }
        }
    }

    /// Reduce Motion still gets the *composition* the animation converges on,
    /// just none of the travel: `animate = true` is the settled state every
    /// decoration is written against (`animate ? 1.1 : 0.9`, `animate ? -20 : 20`).
    /// Leaving it `false` would freeze the backdrop mid-gesture — smaller,
    /// dimmer, offset — which is a different design, not a calmer one.
    /// The transaction is what guarantees the jump is instant.
    private func settleWithoutMotion() {
        var t = Transaction()
        t.disablesAnimations = true
        withTransaction(t) {
            animate = true
            wavePhase = 0
        }
    }

    private func stopAnimations() {
        var t = Transaction()
        t.disablesAnimations = true
        withTransaction(t) {
            animate = false
            wavePhase = 0
        }
    }

    // MARK: - Step Specific Animations

    @ViewBuilder
    private func stepSpecificAnimation(in size: CGSize) -> some View {
        switch step {
        case .pseudo:
            pseudoAnimation(in: size)
        case .phone:
            phoneAnimation(in: size)
        case .email:
            emailAnimation(in: size)
        case .identity:
            identityAnimation(in: size)
        case .password:
            passwordAnimation(in: size)
        case .language:
            languageAnimation(in: size)
        case .profile:
            profileAnimation(in: size)
        case .recap:
            completeAnimation(in: size)
        }
    }

    // MARK: - Pseudo (Cercles concentriques)

    private func pseudoAnimation(in size: CGSize) -> some View {
        ZStack {
            ForEach(0..<5, id: \.self) { i in
                Circle()
                    .stroke(step.accentColor.opacity(0.12 - Double(i) * 0.02), lineWidth: 1.5)
                    .frame(width: 100 + CGFloat(i) * 80, height: 100 + CGFloat(i) * 80)
                    .scaleEffect(animate ? 1.1 : 0.9)
                    .animation(
                        ambient(.easeInOut(duration: 2.5).repeatForever(autoreverses: true).delay(Double(i) * 0.2)),
                        value: animate
                    )
            }
            Image(systemName: "at")
                .font(.system(size: 60, weight: .ultraLight))
                .foregroundColor(step.accentColor.opacity(0.08))
                .offset(y: animate ? -20 : 20)
                .animation(ambient(.easeInOut(duration: 2.5).repeatForever(autoreverses: true)), value: animate)
        }
        .position(x: size.width * 0.7, y: size.height * 0.3)
    }

    // MARK: - Phone (Ondes de signal)

    private func phoneAnimation(in size: CGSize) -> some View {
        ZStack {
            ForEach(0..<4, id: \.self) { i in
                RoundedRectangle(cornerRadius: 100)
                    .stroke(step.accentColor.opacity(0.15 - Double(i) * 0.03), lineWidth: 2)
                    .frame(width: 50 + CGFloat(i) * 60, height: 80 + CGFloat(i) * 40)
                    .rotationEffect(.degrees(-30))
                    .scaleEffect(animate ? 1.2 : 0.8)
                    .opacity(animate ? 0.2 : 0.5)
                    .animation(
                        ambient(.easeOut(duration: 1.8).repeatForever(autoreverses: false).delay(Double(i) * 0.3)),
                        value: animate
                    )
            }
            Image(systemName: "phone.fill")
                .font(.system(size: 50))
                .foregroundColor(step.accentColor.opacity(0.1))
                .rotationEffect(.degrees(animate ? 5 : -5))
                .animation(ambient(.easeInOut(duration: 2).repeatForever(autoreverses: true)), value: animate)
        }
        .position(x: size.width * 0.75, y: size.height * 0.35)
    }

    // MARK: - Email (Enveloppes flottantes)

    private func emailAnimation(in size: CGSize) -> some View {
        ZStack {
            ForEach(0..<6, id: \.self) { i in
                Image(systemName: i % 2 == 0 ? "envelope.fill" : "envelope")
                    .font(.system(size: 20 + CGFloat(i) * 8))
                    .foregroundColor(step.accentColor.opacity(0.08 - Double(i) * 0.01))
                    .offset(
                        x: CGFloat([-80, 60, -40, 90, -60, 30][i]),
                        y: animate ? CGFloat(i) * 40 - 100 : CGFloat(i) * 40 + 100
                    )
                    .rotationEffect(.degrees(Double(i) * 15))
                    .animation(
                        ambient(.easeInOut(duration: 3.5).repeatForever(autoreverses: true).delay(Double(i) * 0.2)),
                        value: animate
                    )
            }
        }
        .position(x: size.width * 0.6, y: size.height * 0.4)
    }

    // MARK: - Identity (Silhouettes)

    private func identityAnimation(in size: CGSize) -> some View {
        ZStack {
            ForEach(0..<3, id: \.self) { i in
                Image(systemName: "person.fill")
                    .font(.system(size: 80 - CGFloat(i) * 15))
                    .foregroundColor(step.accentColor.opacity(0.07 - Double(i) * 0.015))
                    .offset(x: CGFloat(i) * 30 - 30)
                    .scaleEffect(animate ? 1.05 : 0.95)
                    .animation(
                        ambient(.easeInOut(duration: 2.5).repeatForever(autoreverses: true).delay(Double(i) * 0.3)),
                        value: animate
                    )
            }
            Image(systemName: "person.text.rectangle")
                .font(.system(size: 40))
                .foregroundColor(step.accentColor.opacity(0.1))
                .offset(y: 80)
                .rotationEffect(.degrees(animate ? 3 : -3))
                .animation(ambient(.easeInOut(duration: 2).repeatForever(autoreverses: true)), value: animate)
        }
        .position(x: size.width * 0.7, y: size.height * 0.35)
    }

    // MARK: - Password (Bouclier)

    private func passwordAnimation(in size: CGSize) -> some View {
        ZStack {
            Image(systemName: "shield.fill")
                .font(.system(size: 120))
                .foregroundColor(step.accentColor.opacity(0.06))
                .scaleEffect(animate ? 1.1 : 0.9)
                .animation(ambient(.easeInOut(duration: 2.5).repeatForever(autoreverses: true)), value: animate)

            Image(systemName: "lock.fill")
                .font(.system(size: 40))
                .foregroundColor(step.accentColor.opacity(0.12))
                .offset(y: animate ? -5 : 5)
                .animation(ambient(.easeInOut(duration: 2).repeatForever(autoreverses: true)), value: animate)

            ForEach(0..<6, id: \.self) { i in
                Image(systemName: "star.fill")
                    .font(.system(size: 12))
                    .foregroundColor(step.accentColor.opacity(0.1))
                    .offset(
                        x: cos(CGFloat(i) * .pi / 3) * (animate ? 80 : 60),
                        y: sin(CGFloat(i) * .pi / 3) * (animate ? 80 : 60)
                    )
                    .animation(
                        ambient(.easeInOut(duration: 2.5).repeatForever(autoreverses: true).delay(Double(i) * 0.1)),
                        value: animate
                    )
            }
        }
        .position(x: size.width * 0.7, y: size.height * 0.35)
    }

    // MARK: - Language (Globe)

    private func languageAnimation(in size: CGSize) -> some View {
        ZStack {
            Image(systemName: "globe.europe.africa.fill")
                .font(.system(size: 120))
                .foregroundColor(step.accentColor.opacity(0.07))
                .rotationEffect(.degrees(animate ? 10 : -10))
                .animation(ambient(.easeInOut(duration: 3).repeatForever(autoreverses: true)), value: animate)

            ForEach(0..<7, id: \.self) { i in
                let flags = ["🇫🇷", "🇬🇧", "🇪🇸", "🇯🇵", "🇵🇹", "🇨🇳", "🇮🇳"]
                Text(flags[i])
                    .font(.system(size: 20))
                    .opacity(0.6)
                    .offset(
                        x: cos(CGFloat(i) * .pi * 2 / 7 + (animate ? 0.5 : 0)) * 85,
                        y: sin(CGFloat(i) * .pi * 2 / 7 + (animate ? 0.5 : 0)) * 85
                    )
                    .animation(
                        ambient(.easeInOut(duration: 4).repeatForever(autoreverses: true)),
                        value: animate
                    )
            }
        }
        .position(x: size.width * 0.65, y: size.height * 0.35)
    }

    // MARK: - Profile (Cadre photo)

    private func profileAnimation(in size: CGSize) -> some View {
        ZStack {
            RoundedRectangle(cornerRadius: 20)
                .stroke(step.accentColor.opacity(0.1), lineWidth: 2)
                .frame(width: 140, height: 180)
                .scaleEffect(animate ? 1.05 : 0.95)
                .animation(ambient(.easeInOut(duration: 2.5).repeatForever(autoreverses: true)), value: animate)

            Image(systemName: "person.crop.circle.fill")
                .font(.system(size: 70))
                .foregroundColor(step.accentColor.opacity(0.08))

            Image(systemName: "camera.fill")
                .font(.system(size: 30))
                .foregroundColor(step.accentColor.opacity(0.12))
                .offset(x: 50, y: 70)
                .scaleEffect(animate ? 1.2 : 0.8)
                .animation(ambient(.easeInOut(duration: 2).repeatForever(autoreverses: true)), value: animate)

            ForEach(0..<4, id: \.self) { i in
                let xOffsets: [CGFloat] = [-60, 60, -40, 50]
                let yOffsets: [CGFloat] = [-80, -60, 70, 80]
                Image(systemName: "sparkle")
                    .font(.system(size: 12))
                    .foregroundColor(step.accentColor.opacity(animate ? 0.2 : 0.05))
                    .offset(x: xOffsets[i], y: yOffsets[i])
                    .animation(
                        ambient(.easeInOut(duration: 1.5).repeatForever(autoreverses: true).delay(Double(i) * 0.25)),
                        value: animate
                    )
            }
        }
        .position(x: size.width * 0.7, y: size.height * 0.35)
    }

    // MARK: - Complete (Celebration)

    private func completeAnimation(in size: CGSize) -> some View {
        ZStack {
            Image(systemName: "checkmark.seal.fill")
                .font(.system(size: 100))
                .foregroundColor(step.accentColor.opacity(0.1))
                .scaleEffect(animate ? 1.2 : 0.8)
                .animation(ambient(.easeInOut(duration: 2).repeatForever(autoreverses: true)), value: animate)

            ForEach(0..<12, id: \.self) { i in
                Circle()
                    .fill(confettiColor(for: i))
                    .frame(width: 8 + CGFloat(i % 4) * 2)
                    .offset(
                        x: CGFloat(i % 6) * 50 - 125,
                        y: animate ? CGFloat(i / 2) * 80 - 50 : -100
                    )
                    .animation(
                        ambient(.easeIn(duration: 3 + Double(i % 3)).repeatForever(autoreverses: false).delay(Double(i) * 0.15)),
                        value: animate
                    )
            }

            ForEach(0..<6, id: \.self) { i in
                Image(systemName: "star.fill")
                    .font(.system(size: 15 + CGFloat(i % 3) * 4))
                    .foregroundColor(.yellow.opacity(0.3))
                    .offset(
                        x: cos(CGFloat(i) * .pi / 3) * (animate ? 120 : 70),
                        y: sin(CGFloat(i) * .pi / 3) * (animate ? 120 : 70)
                    )
                    .scaleEffect(animate ? 1.2 : 0.8)
                    .animation(
                        ambient(.easeInOut(duration: 1.5).repeatForever(autoreverses: true).delay(Double(i) * 0.15)),
                        value: animate
                    )
            }
        }
        .position(x: size.width * 0.5, y: size.height * 0.4)
    }

    private func confettiColor(for index: Int) -> Color {
        let colors: [Color] = [.red, .orange, .yellow, .green, .blue, .purple, .pink]
        return colors[index % colors.count].opacity(0.4)
    }

    // MARK: - Floating Particles

    private func floatingParticles(in size: CGSize) -> some View {
        ZStack {
            ForEach(0..<10, id: \.self) { i in
                Circle()
                    .fill(step.accentColor.opacity(0.04))
                    .frame(width: 30 + CGFloat(i % 4) * 15)
                    .blur(radius: 12)
                    .offset(
                        x: CGFloat(i % 5) * size.width / 5 - size.width / 2 + 50,
                        y: animate
                            ? CGFloat(i / 5) * size.height / 3 - 40
                            : CGFloat(i / 5) * size.height / 3 + 40
                    )
                    .animation(
                        ambient(.easeInOut(duration: 4 + Double(i % 3)).repeatForever(autoreverses: true).delay(Double(i) * 0.15)),
                        value: animate
                    )
            }
        }
    }

    // MARK: - Waves Overlay

    private func wavesOverlay(in size: CGSize) -> some View {
        VStack {
            Spacer()
            ZStack {
                WaveShape(phase: wavePhase, amplitude: 15, frequency: 1.5)
                    .fill(step.accentColor.opacity(0.04))
                    .frame(height: 80)

                WaveShape(phase: wavePhase + .pi, amplitude: 10, frequency: 2)
                    .fill(step.accentColor.opacity(0.025))
                    .frame(height: 60)
                    .offset(y: 15)
            }
        }
    }
}

// MARK: - Wave Shape

struct WaveShape: Shape {
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

// MARK: - Interactive Progress Bar

struct InteractiveProgressBar: View {
    let currentStep: RegistrationStep
    let onStepTapped: (RegistrationStep) -> Void

    @State private var pressedStep: RegistrationStep?

    var body: some View {
        HStack(spacing: 4) {
            ForEach(RegistrationStep.allCases) { step in
                Button(action: {
                    onStepTapped(step)
                    HapticFeedback.light()
                }) {
                    RoundedRectangle(cornerRadius: 3)
                        .fill(stepColor(for: step))
                        .frame(height: stepHeight(for: step))
                        .overlay(
                            RoundedRectangle(cornerRadius: 3)
                                .stroke(step == currentStep ? step.accentColor : .clear, lineWidth: 1.5)
                        )
                        .scaleEffect(y: scaleEffect(for: step))
                        .animation(.spring(response: 0.3, dampingFraction: 0.7), value: pressedStep)
                        .animation(.spring(response: 0.3, dampingFraction: 0.7), value: currentStep)
                }
                .disabled(step.rawValue > currentStep.rawValue)
                // 242i — ces huit boutons n'avaient AUCUN nom accessible : leur
                // label est un `RoundedRectangle`, c'est-à-dire une FORME.
                // VoiceOver annonçait « bouton », huit fois, sans rien d'autre.
                // Et l'état (faite / en cours / à venir) ne tenait qu'à la
                // COULEUR et à la HAUTEUR — WCAG 1.4.1.
                .accessibilityLabel(Self.positionLabel(for: step))
                .accessibilityValue(Self.stateLabel(for: step, currentStep: currentStep))
                .accessibilityAddTraits(step == currentStep ? .isSelected : [])
                // L'indice ne vaut que pour les étapes réellement re-visitables.
                // L'étape courante n'irait nulle part, et les suivantes sont
                // `.disabled` — SwiftUI les annonce déjà « estompé ».
                .accessibilityHint(step.rawValue < currentStep.rawValue ? Self.revisitHint() : "")
                .simultaneousGesture(
                    DragGesture(minimumDistance: 0)
                        .onChanged { _ in
                            if step.rawValue <= currentStep.rawValue {
                                pressedStep = step
                            }
                        }
                        .onEnded { _ in pressedStep = nil }
                )
            }
        }
    }

    /// « Étape 3 sur 8 ».
    ///
    /// Le libellé est **positionnel** et non nominal, pour une raison qui n'est
    /// pas un choix : `RegistrationStep` vit dans `packages/MeeshySDK`, que
    /// cette piste n'a pas le droit de modifier, et l'enum n'expose **aucun
    /// titre court** — `funHeader` est une accroche (« Un pseudo unique, comme
    /// toi »), inutilisable comme nom de contrôle.
    ///
    /// Ce n'est pas un pis-aller : sur une barre de PROGRESSION, la position est
    /// précisément l'information que le lecteur cherche, et elle survit à
    /// l'ajout d'une étape sans retoucher huit libellés.
    ///
    /// `bundle` et `locale` vont par PAIRE (idiome `PostStatAccessibility`) : le
    /// bundle choisit la table, le locale la règle appliquée à cette table.
    /// Les fixer séparément rend un test vert en local et rouge en CI.
    static func positionLabel(for step: RegistrationStep,
                              bundle: Bundle = .main,
                              locale: Locale = .current) -> String {
        // Les deux nombres sont rendus par `LocalizedNumber.exact` (241i) AVANT
        // d'être injectés — donc le catalogue porte des `%@`, pas des `%lld`.
        // Ce n'est pas un détour : c'est la source unique du dépôt pour « un
        // nombre écrit dans le système de chiffres du lecteur ». L'arabe s'écrit
        // en chiffres arabo-indiens, et une position d'étape n'y fait pas
        // exception.
        let position = LocalizedNumber.exact(step.rawValue + 1, locale: locale)
        let total = LocalizedNumber.exact(RegistrationStep.allCases.count, locale: locale)
        return String(
            localized: "a11y.onboarding.step.position",
            defaultValue: "Étape \(position) sur \(total)",
            bundle: bundle,
            locale: locale
        )
    }

    /// L'état de l'étape **en toutes lettres** — c'est le versant WCAG 1.4.1 du
    /// correctif : avant, « faite / en cours / à venir » ne se distinguaient que
    /// par la teinte (`accentColor`, `accentColor.opacity(0.6)`, `systemGray4`)
    /// et par 3 points de hauteur.
    static func stateLabel(for step: RegistrationStep,
                           currentStep: RegistrationStep,
                           bundle: Bundle = .main,
                           locale: Locale = .current) -> String {
        if step.rawValue < currentStep.rawValue {
            return String(localized: "a11y.onboarding.step.completed",
                          defaultValue: "Terminée", bundle: bundle, locale: locale)
        }
        if step == currentStep {
            return String(localized: "a11y.onboarding.step.current",
                          defaultValue: "En cours", bundle: bundle, locale: locale)
        }
        return String(localized: "a11y.onboarding.step.upcoming",
                      defaultValue: "À venir", bundle: bundle, locale: locale)
    }

    static func revisitHint(bundle: Bundle = .main,
                            locale: Locale = .current) -> String {
        String(localized: "a11y.onboarding.step.revisit.hint",
               defaultValue: "Revenir à cette étape", bundle: bundle, locale: locale)
    }

    private func stepColor(for step: RegistrationStep) -> Color {
        if step.rawValue < currentStep.rawValue {
            return step.accentColor
        } else if step == currentStep {
            return step.accentColor.opacity(0.6)
        } else {
            return Color(.systemGray4)
        }
    }

    private func stepHeight(for step: RegistrationStep) -> CGFloat {
        (step == currentStep || step == pressedStep) ? 8 : 5
    }

    private func scaleEffect(for step: RegistrationStep) -> CGFloat {
        if step == pressedStep { return 1.4 }
        if step == currentStep { return 1.2 }
        return 1.0
    }
}

// MARK: - Glowing Button

struct GlowingButton: View {
    let title: String
    var icon: String? = nil
    let accentColor: Color
    let isEnabled: Bool
    var isLoading: Bool = false
    let action: () -> Void

    @State private var isPressed = false

    /// État d'attente annoncé par VoiceOver — clé existante, réutilisée telle
    /// quelle (0 clé neuve, déjà traduite dans les 7 locales).
    static var loadingAccessibilityValue: String {
        String(localized: "loading.message", defaultValue: "Chargement…", bundle: .main)
    }

    var body: some View {
        Button(action: {
            guard isEnabled && !isLoading else { return }
            HapticFeedback.medium()
            action()
        }) {
            HStack(spacing: 8) {
                if isLoading {
                    ProgressView()
                        .progressViewStyle(CircularProgressViewStyle(tint: .white))
                        .scaleEffect(0.85)
                } else {
                    Text(title)
                        .font(MeeshyFont.relative(16, weight: .semibold))
                    if let icon {
                        Image(systemName: icon)
                            .font(MeeshyFont.relative(15, weight: .semibold))
                    }
                }
            }
            .foregroundColor(.white)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 16)
            .background(
                ZStack {
                    RoundedRectangle(cornerRadius: 14)
                        .fill(
                            LinearGradient(
                                colors: isEnabled ? [accentColor, accentColor.opacity(0.85)] : [.gray.opacity(0.5), .gray.opacity(0.4)],
                                startPoint: .topLeading,
                                endPoint: .bottomTrailing
                            )
                        )
                    if isEnabled && !isLoading {
                        RoundedRectangle(cornerRadius: 14)
                            .fill(accentColor)
                            .blur(radius: 12)
                            .opacity(isPressed ? 0.5 : 0.25)
                            .offset(y: 4)
                    }
                }
            )
            .scaleEffect(isPressed ? 0.98 : 1.0)
            .animation(.spring(response: 0.25, dampingFraction: 0.7), value: isPressed)
        }
        .buttonStyle(PlainButtonStyle())
        .disabled(!isEnabled || isLoading)
        // Pendant `isLoading`, le corps du bouton ne contient PLUS que le
        // `ProgressView` : SwiftUI compose le nom accessible depuis le label,
        // donc le CTA principal de l'inscription devenait un « bouton » ANONYME
        // au moment précis où l'utilisateur attend le réseau. Le titre est posé
        // explicitement pour qu'il survive à ce basculement, et l'attente est
        // annoncée comme VALEUR — pas en la maquillant dans le nom, qui doit
        // rester stable pour Voice Control (« Appuyer sur Continuer »).
        .accessibilityLabel(title)
        .accessibilityValue(isLoading ? Self.loadingAccessibilityValue : "")
        .simultaneousGesture(
            DragGesture(minimumDistance: 0)
                .onChanged { _ in isPressed = true }
                .onEnded { _ in isPressed = false }
        )
    }
}
