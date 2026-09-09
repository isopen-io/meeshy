import SwiftUI
import MeeshySDK
import MeeshyUI

/// **Le palier obtenu se REGARDE avant de se ranger dans une grille.**
///
/// Toucher une notification de succès ouvrait directement le tableau de bord
/// (#5809) : il fallait retrouver soi-même, parmi les badges, celui qu'on
/// venait de débloquer. La récompense arrivait sous forme de devoir.
///
/// Cette vue s'intercale entre le tap et le tableau de bord — elle ne le
/// remplace pas : elle le COUVRE, et le referme sur lui. L'utilisateur n'a donc
/// jamais un geste de plus à faire pour arriver là où il allait.
///
/// **Réduire les animations est respecté, et pas seulement ralenti.** Sous ce
/// réglage, le badge est POSÉ à son état final — aucune échelle, aucun halo qui
/// pulse, aucun rayon qui tourne. Une animation « plus lente » reste une
/// animation : la demande est de ne pas en jouer.
struct AchievementRevealView: View {

    let reveal: EngagementReveal
    let onContinue: () -> Void

    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    private var isDark: Bool { colorScheme == .dark }

    @State private var apparu = false
    @State private var halo = false

    // MARK: - Ce que le palier DIT

    private var titre: String {
        switch reveal {
        case .achievement(let clé): return ProgressionCopy.title(for: clé)
        case .streak(let jours): return ProgressionCopy.streak(jours)
        case .level(let rang): return ProgressionCopy.levelTitle(rang)
        }
    }

    private var explication: String {
        switch reveal {
        case .achievement(let clé):
            return ProgressionCopy.condition(for: clé)
        case .streak(let jours):
            return String(localized: "reveal.streak.subtitle",
                          defaultValue: "\(jours) jours d'affilée. La série continue tant que vous écrivez.",
                          bundle: .main)
        case .level:
            return String(localized: "reveal.level.subtitle",
                          defaultValue: "Votre activité vous a fait franchir un rang.",
                          bundle: .main)
        }
    }

    private var bandeau: String {
        switch reveal {
        case .achievement: return String(localized: "reveal.badge.achievement", defaultValue: "Succès débloqué", bundle: .main)
        case .streak: return String(localized: "reveal.badge.streak", defaultValue: "Série tenue", bundle: .main)
        case .level: return String(localized: "reveal.badge.level", defaultValue: "Nouveau niveau", bundle: .main)
        }
    }

    private var teinte: Color {
        switch reveal {
        case .achievement: return MeeshyColors.purple500
        case .streak: return MeeshyColors.warning
        case .level: return MeeshyColors.indigo500
        }
    }

    var body: some View {
        ZStack {
            MeeshyColors.backgroundPrimary(isDark: isDark).ignoresSafeArea()
            lueurDeFond.ignoresSafeArea()

            VStack(spacing: MeeshySpacing.xl) {
                Spacer()
                médaille
                texte
                Spacer()
                sortie
            }
            .padding(.horizontal, MeeshySpacing.xl)
            .padding(.bottom, MeeshySpacing.xxl)
        }
        .onAppear(perform: entrer)
        // UN seul élément pour le lecteur d'écran : « Succès débloqué, <titre>,
        // <explication> » se lit d'un trait. Trois éléments séparés feraient
        // balayer trois fois ce qui est une seule nouvelle.
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(bandeau). \(titre). \(explication)")
    }

    // MARK: - Pièces

    private var lueurDeFond: some View {
        RadialGradient(
            colors: [teinte.opacity(isDark ? 0.28 : 0.18), .clear],
            center: .center, startRadius: 0, endRadius: 320
        )
        .scaleEffect(halo ? 1.0 : 0.7)
        .opacity(apparu ? 1 : 0)
    }

    private var médaille: some View {
        ZStack {
            // Les rayons ne tournent QUE si l'animation est permise — sinon ils
            // ne sont pas peints du tout : un décor immobile n'explique rien et
            // encombre la lecture.
            if !reduceMotion {
                ForEach(0..<12, id: \.self) { i in
                    Capsule()
                        .fill(teinte.opacity(0.35))
                        .frame(width: 3, height: 18)
                        .offset(y: -78)
                        .rotationEffect(.degrees(Double(i) / 12 * 360))
                        .scaleEffect(halo ? 1.15 : 0.6)
                        .opacity(apparu ? 1 : 0)
                }
            }

            Circle()
                .fill(LinearGradient(colors: [teinte, teinte.opacity(0.55)],
                                     startPoint: .topLeading, endPoint: .bottomTrailing))
                .frame(width: 128, height: 128)
                .shadow(color: teinte.opacity(0.45), radius: 24, y: 10)

            Image(systemName: reveal.symbolName)
                .font(MeeshyFont.relative(56, weight: .semibold))
                .foregroundColor(.white)
        }
        .scaleEffect(apparu ? 1 : 0.4)
        .opacity(apparu ? 1 : 0)
    }

    private var texte: some View {
        VStack(spacing: MeeshySpacing.sm) {
            Text(bandeau.uppercased())
                .font(MeeshyFont.relative(12, weight: .bold))
                .tracking(1.2)
                .foregroundColor(teinte)

            Text(titre)
                .font(MeeshyFont.relative(26, weight: .bold))
                .foregroundColor(MeeshyColors.textPrimary(isDark: isDark))
                .multilineTextAlignment(.center)

            Text(explication)
                .font(MeeshyFont.relative(15))
                .foregroundColor(MeeshyColors.textSecondary(isDark: isDark))
                .multilineTextAlignment(.center)
                .fixedSize(horizontal: false, vertical: true)
        }
        .opacity(apparu ? 1 : 0)
        .offset(y: apparu ? 0 : MeeshySpacing.lg)
    }

    private var sortie: some View {
        Button {
            HapticFeedback.light()
            onContinue()
        } label: {
            Text(String(localized: "reveal.continue", defaultValue: "Voir ma progression", bundle: .main))
                .font(MeeshyFont.relative(16, weight: .semibold))
                .foregroundColor(.white)
                .frame(maxWidth: .infinity, minHeight: 52)
                .background(Capsule().fill(teinte))
        }
        .buttonStyle(.plain)
        .opacity(apparu ? 1 : 0)
    }

    // MARK: - L'entrée

    private func entrer() {
        HapticFeedback.success()
        guard !reduceMotion else {
            // POSÉ, pas animé — et le halo reste à son échelle de repos.
            apparu = true
            halo = true
            return
        }
        withAnimation(.spring(response: 0.55, dampingFraction: 0.62)) { apparu = true }
        withAnimation(.easeOut(duration: 0.9).delay(0.1)) { halo = true }
    }
}
