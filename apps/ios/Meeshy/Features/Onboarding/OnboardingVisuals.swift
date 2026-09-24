import SwiftUI
import MeeshySDK
import MeeshyUI

// MARK: - Le gabarit commun des cartes

/// Un geste proposé par une carte. `identifier` est la poignée des tests d'UI
/// et des captures — il ne dit rien à l'utilisateur.
struct OnboardingAction {
    let title: String
    let identifier: String
    var isEnabled = true
    var isBusy = false
    let perform: () -> Void
}

/// Le gabarit des cinq cartes : illustration, titre, phrase, contenu propre à
/// la carte, puis UN bouton principal pré-rempli et un « Plus tard » discret.
///
/// **Une carte TIENT dans l'écran.** Les boutons vivent SOUS la zone de la
/// carte, jamais par-dessus : rien de ce que la carte montre — la jauge du
/// niveau 1, la note « +7 chacun » — ne peut passer derrière eux. Pour tenir,
/// c'est l'illustration, décorative, qui cède : elle se réduit à la place qui
/// reste, puis disparaît sous `OnboardingCardFit.minimumIllustrationScale`.
/// Si le contenu déborde encore (iPhone SE, grandes tailles de texte), la
/// barre de défilement est MONTRÉE et un fondu signale la suite.
///
/// **Une carte = un conteneur VoiceOver**, lu dans l'ordre titre → texte →
/// contenu → action → « Plus tard ». En tailles d'accessibilité, les boutons
/// quittent le bas de l'écran pour suivre le contenu dans le défilement :
/// épinglés, deux boutons AX5 mangeraient la moitié de la hauteur.
struct OnboardingCardLayout<Illustration: View, Content: View>: View {
    let title: String
    let message: String
    let isDark: Bool
    let primary: OnboardingAction
    var secondary: OnboardingAction?
    @ViewBuilder let illustration: () -> Illustration
    @ViewBuilder let content: () -> Content

    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    /// La plus grande hauteur vue : le clavier qui monte ne doit pas faire
    /// sauter l'illustration sous le doigt de qui écrit.
    @State private var roomyViewport: CGFloat = 0
    @State private var viewport: CGFloat = 0
    @State private var scrolledContent: CGFloat = 0
    @State private var cardBody: CGFloat = 0
    @State private var naturalIllustration: CGFloat = 0

    private static var cardPadding: CGFloat { MeeshySpacing.lg }
    private static var cardSpacing: CGFloat { MeeshySpacing.lg }
    private static var scrollTop: CGFloat { MeeshySpacing.sm }
    private static var scrollBottom: CGFloat { MeeshySpacing.lg }

    private var isAccessibilitySize: Bool { dynamicTypeSize.isAccessibilitySize }

    private var illustrationScale: CGFloat {
        guard !isAccessibilitySize, roomyViewport > 0, cardBody > 0 else { return 1 }
        let rest = cardBody + Self.cardPadding * 2 + Self.cardSpacing + Self.scrollTop + Self.scrollBottom
        return OnboardingCardFit.illustrationScale(natural: naturalIllustration, room: roomyViewport - rest)
    }

    private var overflows: Bool { viewport > 0 && scrolledContent > viewport + 1 }

    var body: some View {
        VStack(spacing: 0) {
            ScrollView(showsIndicators: overflows) {
                VStack(spacing: MeeshySpacing.xl) {
                    card
                    if isAccessibilitySize { actions }
                }
                .padding(.horizontal, MeeshySpacing.xl)
                .padding(.top, Self.scrollTop)
                .padding(.bottom, Self.scrollBottom)
                .onGeometryChange(for: CGFloat.self) { $0.size.height } action: { scrolledContent = $0 }
            }
            .onboardingScrollClip(disabled: !overflows)
            .onboardingFlashIndicators(when: overflows)
            .onGeometryChange(for: CGFloat.self) { $0.size.height } action: { height in
                viewport = height
                roomyViewport = max(roomyViewport, height)
            }
            .overlay(alignment: .bottom) { if overflows { moreBelow } }
            if !isAccessibilitySize {
                actions
                    .padding(.horizontal, MeeshySpacing.xl)
                    .padding(.top, MeeshySpacing.sm)
                    .padding(.bottom, MeeshySpacing.sm)
            }
        }
    }

    /// Le contenu qui continue plus bas s'efface au lieu d'être coupé net.
    private var moreBelow: some View {
        LinearGradient(
            colors: [MeeshyColors.backgroundPrimary(isDark: isDark).opacity(0),
                     MeeshyColors.backgroundPrimary(isDark: isDark).opacity(0.85)],
            startPoint: .top, endPoint: .bottom
        )
        .frame(height: 28)
        .allowsHitTesting(false)
        .accessibilityHidden(true)
    }

    private var card: some View {
        VStack(spacing: Self.cardSpacing) {
            if illustrationScale > 0 { illustrationSlot }
            VStack(spacing: Self.cardSpacing) {
                VStack(spacing: MeeshySpacing.sm) {
                    Text(title)
                        .font(MeeshyFont.relative(MeeshyFont.titleSize + 4, weight: .bold, design: .rounded))
                        .foregroundStyle(MeeshyColors.textPrimary(isDark: isDark))
                        .accessibilityAddTraits(.isHeader)
                    Text(message)
                        .font(MeeshyFont.relative(MeeshyFont.headlineSize))
                        .foregroundStyle(MeeshyColors.textSecondary(isDark: isDark))
                }
                .multilineTextAlignment(.center)
                .fixedSize(horizontal: false, vertical: true)

                content()
            }
            .onGeometryChange(for: CGFloat.self) { $0.size.height } action: { cardBody = $0 }
        }
        .padding(Self.cardPadding)
        .frame(maxWidth: 560)
        .background(
            RoundedRectangle(cornerRadius: 30, style: .continuous)
                .fill(.ultraThinMaterial)
        )
        .background(
            RoundedRectangle(cornerRadius: 30, style: .continuous)
                .fill(isDark ? MeeshyColors.indigo950.opacity(0.35) : Color.white.opacity(0.55))
        )
        .overlay(
            RoundedRectangle(cornerRadius: 30, style: .continuous)
                .stroke(MeeshyColors.glassBorderGradient(isDark: isDark), lineWidth: 1)
        )
        .shadow(color: MeeshyColors.indigo700.opacity(isDark ? 0.45 : 0.16), radius: 24, y: 10)
        .accessibilityElement(children: .contain)
    }

    /// Décorative et masquée à VoiceOver, l'illustration plafonne sa taille de
    /// texte : en AX5, ses bulles déborderaient la carte sans rien apprendre à
    /// personne. Elle est mesurée à sa taille NATURELLE, puis réduite d'un
    /// bloc — une réduction qui garde ses proportions, jamais une coupe.
    private var illustrationSlot: some View {
        let scale = illustrationScale
        return illustration()
            .dynamicTypeSize(...DynamicTypeSize.xLarge)
            .fixedSize()
            .onGeometryChange(for: CGFloat.self) { $0.size.height } action: { naturalIllustration = $0 }
            .scaleEffect(scale)
            .frame(maxWidth: .infinity)
            .frame(height: naturalIllustration > 0 ? naturalIllustration * scale : nil)
            .accessibilityHidden(true)
    }

    private var actions: some View {
        VStack(spacing: MeeshySpacing.xs) {
            OnboardingPrimaryButton(action: primary)
            if let secondary {
                OnboardingSecondaryButton(action: secondary, isDark: isDark)
            }
        }
        .frame(maxWidth: 560)
    }
}

// MARK: - Boutons

struct OnboardingPrimaryButton: View {
    let action: OnboardingAction

    @Environment(\.colorScheme) private var colorScheme

    /// Désactivé, le bouton reste OPAQUE : une capsule translucide laisserait
    /// lire le contenu qui défile dessous, à travers le libellé.
    private var fill: AnyShapeStyle {
        guard action.isEnabled else {
            return AnyShapeStyle(colorScheme == .dark ? MeeshyColors.indigo900 : MeeshyColors.indigo200)
        }
        return AnyShapeStyle(MeeshyColors.brandGradient)
    }

    var body: some View {
        Button(action: action.perform) {
            HStack(spacing: MeeshySpacing.sm) {
                if action.isBusy {
                    ProgressView().tint(.white)
                }
                Text(action.title)
                    .font(MeeshyFont.relative(MeeshyFont.headlineSize, weight: .semibold, design: .rounded))
                    .multilineTextAlignment(.center)
            }
            .foregroundStyle(action.isEnabled ? Color.white : (colorScheme == .dark ? Color.white.opacity(0.6) : MeeshyColors.indigo600))
            .frame(maxWidth: .infinity, minHeight: 54)
            .padding(.horizontal, MeeshySpacing.lg)
            .background(Capsule().fill(fill))
            .shadow(color: MeeshyColors.indigo500.opacity(action.isEnabled ? 0.35 : 0), radius: 14, y: 6)
            .contentShape(Capsule())
        }
        .buttonStyle(.plain)
        .bounceOnTap(scale: 0.96)
        .disabled(!action.isEnabled || action.isBusy)
        .accessibilityIdentifier(action.identifier)
    }
}

struct OnboardingSecondaryButton: View {
    let action: OnboardingAction
    let isDark: Bool

    var body: some View {
        Button(action: action.perform) {
            Text(action.title)
                .font(MeeshyFont.relative(MeeshyFont.bodySize, weight: .semibold, design: .rounded))
                .foregroundStyle(MeeshyColors.textSecondary(isDark: isDark))
                .frame(maxWidth: .infinity, minHeight: 44)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .disabled(!action.isEnabled)
        .accessibilityIdentifier(action.identifier)
    }
}

// MARK: - La jauge du premier niveau

/// « 0 / 10 pts pour ton niveau 1 ». Elle se remplit dans le sens de lecture —
/// de droite à gauche en arabe, sans rien écrire pour ça : le calque est aligné
/// sur `.leading`, que SwiftUI retourne avec la mise en page.
struct OnboardingLevelGauge: View {
    let points: Int
    let threshold: Int
    let isDark: Bool

    private var fraction: CGFloat {
        guard threshold > 0 else { return 1 }
        return min(1, CGFloat(points) / CGFloat(threshold))
    }

    private var reached: Bool { points >= threshold }

    private var label: String {
        reached
            ? String(localized: "onboarding.gauge.reached", bundle: .main)
            : String.localizedStringWithFormat(String(localized: "onboarding.gauge.level1", bundle: .main), min(points, threshold), threshold)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.sm) {
            HStack(spacing: MeeshySpacing.xs) {
                Image(systemName: reached ? "star.circle.fill" : "star.circle")
                    .foregroundStyle(reached ? MeeshyColors.warning : MeeshyColors.indigo400)
                Text(label)
                    .font(MeeshyFont.relative(MeeshyFont.subheadSize, weight: .semibold, design: .rounded))
                    .foregroundStyle(MeeshyColors.textSecondary(isDark: isDark))
                    .fixedSize(horizontal: false, vertical: true)
            }
            Capsule()
                .fill(isDark ? Color.white.opacity(0.10) : MeeshyColors.indigo100)
                .frame(height: 10)
                .overlay(alignment: .leading) {
                    GeometryReader { proxy in
                        Capsule()
                            .fill(MeeshyColors.brandGradient)
                            .frame(width: max(10, proxy.size.width * fraction))
                            .opacity(points == 0 ? 0.35 : 1)
                    }
                }
                .clipShape(Capsule())
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(label)
    }
}

// MARK: - Une puce

/// Une puce sélectionnable (langue, audience) — 44 pt de haut, jamais moins.
struct OnboardingChip: View {
    let title: String
    let isSelected: Bool
    let isDark: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Text(title)
                .font(MeeshyFont.relative(MeeshyFont.bodySize, weight: .medium, design: .rounded))
                .foregroundStyle(isSelected ? Color.white : MeeshyColors.textPrimary(isDark: isDark))
                .padding(.horizontal, MeeshySpacing.lg)
                .frame(minHeight: 44)
                .background(
                    Capsule().fill(isSelected
                                   ? AnyShapeStyle(MeeshyColors.brandGradient)
                                   : AnyShapeStyle(isDark ? Color.white.opacity(0.08) : MeeshyColors.indigo50))
                )
                .overlay(Capsule().stroke(isSelected ? Color.clear : MeeshyColors.indigo200.opacity(isDark ? 0.25 : 1), lineWidth: 1))
                .contentShape(Capsule())
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(isSelected ? .isSelected : [])
    }
}

// MARK: - Le fond

/// Le fond du parcours : le dégradé de l'app et deux halos IMMOBILES — la
/// couleur de la marque sans mouvement perpétuel.
struct OnboardingBackdrop: View {
    let isDark: Bool

    var body: some View {
        ZStack {
            MeeshyColors.mainBackgroundGradient(isDark: isDark)
            Circle()
                .fill(MeeshyColors.indigo500.opacity(isDark ? 0.35 : 0.22))
                .frame(width: 360, height: 360)
                .blur(radius: 90)
                .offset(x: -140, y: -300)
            Circle()
                .fill(MeeshyColors.purple500.opacity(isDark ? 0.28 : 0.16))
                .frame(width: 320, height: 320)
                .blur(radius: 90)
                .offset(x: 160, y: 320)
        }
        .ignoresSafeArea()
        .accessibilityHidden(true)
    }
}

// MARK: - La pastille de points et la progression

struct OnboardingPointsPill: View {
    let points: Int
    let bump: Bool

    var body: some View {
        HStack(spacing: MeeshySpacing.xs) {
            Image(systemName: "sparkles")
            Text(String.localizedStringWithFormat(String(localized: "onboarding.points.pill", bundle: .main), points))
                .monospacedDigit()
                .lineLimit(1)
        }
        .fixedSize()
        .font(MeeshyFont.relative(MeeshyFont.subheadSize, weight: .bold, design: .rounded))
        .foregroundStyle(.white)
        .padding(.horizontal, MeeshySpacing.md)
        .frame(minHeight: 36)
        .background(Capsule().fill(MeeshyColors.brandGradient))
        .shadow(color: MeeshyColors.indigo500.opacity(0.4), radius: 10, y: 4)
        .scaleEffect(bump ? 1.18 : 1)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(String.localizedStringWithFormat(String(localized: "onboarding.points.a11y", bundle: .main), points))
    }
}

struct OnboardingProgressBar: View {
    let position: Int
    let count: Int
    let isDark: Bool

    var body: some View {
        HStack(spacing: 6) {
            ForEach(0..<max(count, 1), id: \.self) { index in
                Capsule()
                    .fill(index < position
                          ? AnyShapeStyle(MeeshyColors.brandGradient)
                          : AnyShapeStyle(isDark ? Color.white.opacity(0.12) : MeeshyColors.indigo100))
                    .frame(height: 6)
                    .frame(maxWidth: index == position - 1 ? .infinity : 44)
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(String.localizedStringWithFormat(String(localized: "onboarding.progress.a11y", bundle: .main), position, count))
    }
}

// MARK: - Défilement

private extension View {
    /// Une carte qui déborde le DIT : la barre de défilement clignote à
    /// l'apparition (iOS 17+ ; en iOS 16, elle reste simplement visible).
    @ViewBuilder
    func onboardingFlashIndicators(when overflows: Bool) -> some View {
        if #available(iOS 17.0, *) {
            scrollIndicatorsFlash(trigger: overflows)
        } else {
            self
        }
    }

    /// Tant que la carte TIENT, son ombre déborde du défilement au lieu d'y
    /// être tranchée net, et rien ne rebondit. Dès qu'elle déborde, le
    /// défilement coupe de nouveau à son bord : sans ça, le contenu qui monte
    /// se dessinerait sous les boutons, là même où ce gabarit l'interdit.
    @ViewBuilder
    func onboardingScrollClip(disabled: Bool) -> some View {
        if #available(iOS 17.0, *) {
            scrollClipDisabled(disabled).scrollBounceBehavior(.basedOnSize)
        } else if #available(iOS 16.4, *) {
            scrollBounceBehavior(.basedOnSize)
        } else {
            self
        }
    }
}
