import SwiftUI
import MeeshySDK
import MeeshyUI

// MARK: - Splash Screen
struct SplashScreen: View {
    @State private var showLogo = false
    @State private var showTitle = false
    @State private var showSubtitle = false
    @State private var glowPulse = false
    @State private var backgroundScale: CGFloat = 1.2
    @ObservedObject private var theme = ThemeManager.shared

    @Environment(\.accessibilityReduceMotion) private var systemReduceMotion
    @Environment(\.meeshyForceReduceMotion) private var forcedReduceMotion
    private var reduceMotion: Bool {
        MeeshyMotion.shouldReduce(system: systemReduceMotion, userForced: forcedReduceMotion)
    }

    private var isDark: Bool { theme.mode.isDark }

    var body: some View {
        ZStack {
            // Animated gradient background
            LinearGradient(
                colors: isDark ? [
                    Color(hex: "09090B"),
                    Color(hex: "13111C"),
                    MeeshyColors.indigo950
                ] : [
                    Color(hex: "FFFFFF"),
                    Color(hex: "F8F7FF"),
                    MeeshyColors.indigo50
                ],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
            .scaleEffect(backgroundScale)
            .ignoresSafeArea()

            // Ambient orbs
            Circle()
                .fill(MeeshyColors.indigo600.opacity(isDark ? 0.15 : 0.10))
                .frame(width: 200, height: 200)
                .blur(radius: 60)
                .offset(x: -80, y: -200)
                .scaleEffect(glowPulse ? 1.3 : 0.8)

            Circle()
                .fill(MeeshyColors.indigo400.opacity(isDark ? 0.12 : 0.08))
                .frame(width: 160, height: 160)
                .blur(radius: 50)
                .offset(x: 90, y: 180)
                .scaleEffect(glowPulse ? 1.2 : 0.9)

            Circle()
                .fill(MeeshyColors.indigo800.opacity(isDark ? 0.10 : 0.06))
                .frame(width: 120, height: 120)
                .blur(radius: 40)
                .offset(x: 60, y: -80)
                .scaleEffect(glowPulse ? 1.1 : 1.0)

            VStack(spacing: 0) {
                Spacer()

                // Animated Logo
                AnimatedLogoView(color: isDark ? .white : MeeshyColors.indigo950, lineWidth: 10, continuous: false)
                    .frame(width: 120, height: 120)
                    .opacity(showLogo ? 1 : 0)
                    .scaleEffect(showLogo ? 1 : 0.5)
                    .padding(.bottom, 32)

                // App Name
                Text(verbatim: "Meeshy")
                    .font(MeeshyFont.relative(46, weight: .bold, design: .rounded))
                    .foregroundStyle(
                        LinearGradient(
                            colors: [MeeshyColors.indigo500, MeeshyColors.indigo700],
                            startPoint: .leading,
                            endPoint: .trailing
                        )
                    )
                    .shadow(color: MeeshyColors.indigo500.opacity(isDark ? 0.5 : 0.25), radius: 12, x: 0, y: 4)
                    .fixedSize()
                    .frame(height: 80)
                    .opacity(showTitle ? 1 : 0)
                    .offset(y: showTitle ? 0 : -40)
                    .padding(.bottom, 8)

                // Tagline
                Text(String(localized: "splash.tagline", bundle: .main))
                    .font(MeeshyFont.relative(16, weight: .medium))
                    .foregroundColor(theme.textMuted)
                    .frame(height: 40)
                    .opacity(showSubtitle ? 1 : 0)
                    .offset(y: showSubtitle ? 0 : -20)

                Spacer()

                // Footer : version + signature + brand logo (shared — see BrandSignature)
                BrandSignature()
                    .opacity(showSubtitle ? 1 : 0)
                    .padding(.bottom, 24)
            }
        }
        .onAppear {
            // Staggered entrance — fast and punchy
            withAnimation(.spring(response: 0.35, dampingFraction: 0.7)) {
                showLogo = true
            }

            // Title: fade in + descend with bounce overshoot
            withAnimation(.spring(response: 0.4, dampingFraction: 0.6).delay(0.2)) {
                showTitle = true
            }

            // Subtitle: same bounce, slightly later
            withAnimation(.spring(response: 0.4, dampingFraction: 0.6).delay(0.35)) {
                showSubtitle = true
            }

            // Le halo est DÉCORATIF : sous Reduce Motion il ne se pose sur
            // aucune valeur, il n'existe pas. `glowPulse` reste `false`, donc
            // les trois orbes gardent leur échelle de repos. Avec le halo de
            // `LoginView`, ce sont les deux seuls des sept sites de #4286 où
            // « ne rien faire » est le bon repos — les cinq autres portent un
            // STATUT, et devaient choisir une valeur qui le dit encore.
            if !reduceMotion {
                withAnimation(.easeInOut(duration: 1.5).repeatForever(autoreverses: true)) {
                    glowPulse = true
                }
            }

            withAnimation(.easeInOut(duration: 1.0)) {
                backgroundScale = 1.0
            }

            // La tombée n'est PAS décidée ici : `LaunchSplashController`
            // (#6744) lève le rideau dès que le démarrage est prêt, et à son
            // plafond quoi qu'il arrive. Un minuteur posé dans la vue faisait
            // disparaître le splash avant que le cache ne soit lu.
        }
        .onDisappear {
            withTransaction(Transaction(animation: nil)) {
                glowPulse = false
            }
        }
    }
}
