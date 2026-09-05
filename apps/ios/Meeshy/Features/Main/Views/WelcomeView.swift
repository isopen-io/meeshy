import SwiftUI
import MeeshySDK
import MeeshyUI

/// Le premier écran, au tout premier lancement : deux boutons, une promesse.
///
/// Il remplace un carrousel de cinq pages (#5218). Ce que le carrousel coûtait
/// se compte : cinq balayages avant de pouvoir faire quoi que ce soit, et une
/// alerte système de permission de notification posée à la dernière page —
/// devant quelqu'un qui n'avait pas encore de compte, donc pas un message à
/// recevoir. Ce qu'il apportait — quatre arguments produit — se lit mieux là où
/// la feature s'utilise.
///
/// La garde `hasCompletedOnboarding` garde exactement son sens : « cet appareil
/// a déjà vu l'accueil ». Les DEUX boutons la posent, donc aucun chemin ne
/// laisse l'écran revenir, et aucun ne le quitte sans destination.
struct WelcomeView: View {
    @Binding var hasCompletedOnboarding: Bool

    @StateObject private var theme = ThemeManager.shared

    @State private var isShowingSignup = false

    private var isDark: Bool { theme.mode.isDark }

    var body: some View {
        ZStack {
            theme.backgroundGradient
                .ignoresSafeArea()

            VStack(spacing: 0) {
                Spacer()

                AnimatedLogoView(
                    color: isDark ? .white : MeeshyColors.indigo950,
                    lineWidth: 10,
                    continuous: false
                )
                .frame(width: 100, height: 100)
                .accessibilityHidden(true)

                Text(verbatim: "Meeshy")
                    .font(MeeshyFont.relative(MeeshyFont.largeTitleSize + 6, weight: .bold, design: .rounded))
                    .foregroundStyle(MeeshyColors.brandGradient)
                    .padding(.top, MeeshySpacing.xxl)
                    .accessibilityAddTraits(.isHeader)

                Text(String(localized: "welcome.tagline", defaultValue: "Écrivez dans votre langue. Tout le monde vous lit dans la sienne.", bundle: .main))
                    .font(MeeshyFont.relative(MeeshyFont.bodySize))
                    .foregroundColor(theme.textSecondary)
                    .multilineTextAlignment(.center)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.horizontal, MeeshySpacing.xxxl)
                    .padding(.top, MeeshySpacing.md)

                Spacer()

                VStack(spacing: MeeshySpacing.md) {
                    createAccountButton
                    signInButton
                }
                .padding(.horizontal, MeeshySpacing.xxxl)

                BrandSignature()
                    .padding(.top, MeeshySpacing.xl)
                    .padding(.bottom, MeeshySpacing.xl)
            }
            .iPadFormWidth()
        }
        .fullScreenCover(isPresented: $isShowingSignup) {
            SignupView(
                // L'accueil est SOLDÉ dès que le compte existe : rouvrir le
                // carrousel au prochain lancement d'un utilisateur connecté
                // serait un écran mort posé devant sa messagerie.
                onComplete: { completeWelcome() },
                onSwitchToLogin: {
                    isShowingSignup = false
                    completeWelcome()
                }
            )
        }
    }

    // MARK: - Boutons

    private var createAccountButton: some View {
        Button {
            HapticFeedback.medium()
            isShowingSignup = true
        } label: {
            ZStack {
                RoundedRectangle(cornerRadius: MeeshyRadius.md)
                    .fill(MeeshyColors.brandGradient)
                    .frame(minHeight: 52)
                Text(String(localized: "welcome.createAccount", defaultValue: "Créer un compte", bundle: .main))
                    .font(MeeshyFont.relative(MeeshyFont.headlineSize, weight: .bold))
                    .foregroundColor(.white)
            }
        }
        .bounceOnTap()
        .accessibilityLabel(String(localized: "welcome.createAccount", defaultValue: "Créer un compte", bundle: .main))
        .accessibilityHint(String(localized: "welcome.createAccount.hint", defaultValue: "Ouvre le formulaire d'inscription", bundle: .main))
    }

    private var signInButton: some View {
        Button {
            HapticFeedback.light()
            completeWelcome()
        } label: {
            ZStack {
                RoundedRectangle(cornerRadius: MeeshyRadius.md)
                    .stroke(theme.inputBorder.opacity(0.6), lineWidth: 1)
                    .frame(minHeight: 52)
                Text(String(localized: "welcome.signIn", defaultValue: "Se connecter", bundle: .main))
                    .font(MeeshyFont.relative(MeeshyFont.headlineSize, weight: .semibold))
                    .foregroundColor(theme.textPrimary)
            }
        }
        .bounceOnTap()
        .accessibilityLabel(String(localized: "welcome.signIn", defaultValue: "Se connecter", bundle: .main))
        .accessibilityHint(String(localized: "welcome.signIn.hint", defaultValue: "Ouvre l'écran de connexion", bundle: .main))
    }

    // MARK: - Sortie

    /// Le SEUL site qui solde l'accueil.
    ///
    /// Aucune permission n'est demandée ici : la notification se demande au
    /// premier message ENVOYÉ (`PushPermissionDeferral`), pas devant quelqu'un
    /// qui n'a encore parlé à personne.
    private func completeWelcome() {
        withAnimation(MeeshyAnimation.springDefault) {
            hasCompletedOnboarding = true
        }
    }
}
