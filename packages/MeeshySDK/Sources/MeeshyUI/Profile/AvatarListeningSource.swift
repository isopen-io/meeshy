import Combine
import SwiftUI

// MARK: - L'écoute d'une personne, en direct, sur son avatar (#16755)
//
// Ce qu'écoute un Proche ou un Sang vit côté app (socket, rattrapage, échéance). Le SDK reçoit une SOURCE opaque — pour
// une personne, le flux de son bandeau tel que servi — et la peint sur l'avatar. Sans source, rien ne s'ajoute.

/// Ce que l'app fournit : pour un identifiant, le bandeau courant puis chacun de ses changements (`nil` : rien).
public struct AvatarListeningSource {
    public let band: @MainActor (_ userId: String) -> AnyPublisher<AvatarListening?, Never>

    public init(band: @escaping @MainActor (_ userId: String) -> AnyPublisher<AvatarListening?, Never>) {
        self.band = band
    }
}

/// Le bandeau d'UNE personne, abonné à sa source : il ne se réabonne qu'au changement de personne, jamais à chaque
/// rendu de l'hôte.
public struct AvatarListeningLive: View {
    let userId: String
    let avatarSize: CGFloat
    let source: AvatarListeningSource

    @State private var band: AvatarListening?

    public init(userId: String, avatarSize: CGFloat, source: AvatarListeningSource) {
        self.userId = userId
        self.avatarSize = avatarSize
        self.source = source
    }

    public var body: some View {
        ZStack {
            if let band {
                AvatarListeningBand(listening: band, avatarSize: avatarSize)
            }
        }
        .meeshyMotion(.rise, value: band)
        .task(id: userId) {
            band = nil
            for await value in source.band(userId).values {
                band = value
            }
        }
    }
}

/// L'écoute posée sur un avatar, d'après la source de l'environnement : rien sans source, ni pour un avatar qui ne la
/// montre pas (`userId` nil ou vide, ou trop petit pour le bandeau). Une liste, une fiche, un en-tête la posent de la même façon (#16733).
public struct AvatarListeningOverlay: View {
    let userId: String?
    let avatarSize: CGFloat
    @Environment(\.avatarListeningSource) private var source

    public init(userId: String?, avatarSize: CGFloat) {
        self.userId = userId
        self.avatarSize = avatarSize
    }

    /// Vrai quand une écoute se peint : une personne connue, sur un avatar assez grand pour que le bandeau se lise.
    public static func paints(userId: String?, avatarSize: CGFloat) -> Bool {
        guard let userId, !userId.isEmpty else { return false }
        return AvatarListeningBand.isShown(avatarSize: avatarSize)
    }

    public var body: some View {
        if let source, let userId, Self.paints(userId: userId, avatarSize: avatarSize) {
            AvatarListeningLive(userId: userId, avatarSize: avatarSize, source: source)
        }
    }
}

/// « Écoute en ce moment » sur la fiche (planche `Autre-Vitrine`, #19674) : une pilule de verre posée À CÔTÉ du grand
/// avatar, sa note et son égaliseur qui bat. Un toucher la déplie sur ce qui est écouté, tel que servi. Elle s'efface
/// avec l'avatar quand l'en-tête se replie ; rien sans source, ni sur ma propre fiche.
struct ProfileAvatarListening: View {
    /// Sous ce diamètre, l'avatar est dans la barre repliée : la pilule n'y a pas sa place.
    static let minimumAvatarSize: CGFloat = 64
    /// La course sur laquelle elle s'efface pendant le repli.
    static let fadeRange: CGFloat = 24

    let userId: String?
    let avatarSize: CGFloat
    let tint: Color
    @Environment(\.avatarListeningSource) private var source

    /// L'opacité de la pilule pour un diamètre d'avatar : pleine sur le grand, nulle sous le seuil.
    static func opacity(avatarSize: CGFloat) -> Double {
        let shown = (avatarSize - minimumAvatarSize) / fadeRange
        return Double(min(1, max(0, shown)))
    }

    var body: some View {
        if let source, let userId, !userId.isEmpty, avatarSize >= Self.minimumAvatarSize {
            ProfileListeningLive(userId: userId, source: source, tint: tint)
                .fixedSize()
                .offset(x: avatarSize + MeeshySpacing.md, y: -avatarSize * 0.12)
                .opacity(Self.opacity(avatarSize: avatarSize))
        }
    }
}

/// La pilule abonnée à la source d'UNE personne ; rien tant qu'aucune écoute n'est servie.
private struct ProfileListeningLive: View {
    let userId: String
    let source: AvatarListeningSource
    let tint: Color

    @State private var band: AvatarListening?
    @State private var isExpanded = false
    @Environment(\.accessibilityReduceMotion) private var systemReduceMotion
    @Environment(\.meeshyForceReduceMotion) private var forcedReduceMotion
    @ResolvedThemePalette private var theme

    private var reduceMotion: Bool {
        MeeshyMotion.shouldReduce(system: systemReduceMotion, userForced: forcedReduceMotion)
    }

    var body: some View {
        ZStack {
            if let band {
                pill(band)
                    .transition(MeeshyMotion.transition(.scale(scale: 0.8, anchor: .leading).combined(with: .opacity),
                                                        reduce: reduceMotion))
            }
        }
        .meeshyMotion(.rise, value: band)
        .task(id: userId) {
            band = nil
            for await value in source.band(userId).values {
                band = value
            }
        }
    }

    private func pill(_ band: AvatarListening) -> some View {
        Button {
            meeshyWithMotion(.morph, reduceMotion: reduceMotion) { isExpanded.toggle() }
        } label: {
            HStack(spacing: MeeshySpacing.xsPlus) {
                Image(systemName: ProfileGlyph.listening)
                    .font(MeeshyFont.relative(MeeshyFont.smallSize, weight: .bold))
                    .foregroundStyle(tint)
                Text(isExpanded ? band.text : ProfileListeningCopy.now)
                    .font(MeeshyFont.relative(MeeshyFont.subheadSize, weight: .semibold))
                    .foregroundStyle(theme.textPrimary)
                    .lineLimit(1)
                    .frame(maxWidth: ProfileListeningCopy.maxTextWidth, alignment: .leading)
                ProfileListeningEqualizer(tint: tint, reduceMotion: reduceMotion)
            }
            .padding(.horizontal, MeeshySpacing.md)
            .padding(.vertical, MeeshySpacing.xsPlus)
            .meeshyGlass(in: Capsule(), tone: .theme, tint: tint, isInteractive: true)
            .meeshyTapTarget()
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(band.spoken)
        .accessibilityHint(ProfileListeningCopy.hint)
        .accessibilityIdentifier("profile.listening")
    }
}

/// L'égaliseur de la pilule : trois barres qui battent, immobiles sous « Réduire les animations ». Décoratif.
private struct ProfileListeningEqualizer: View {
    static let bars: [Double] = [0, 0.33, 0.66]
    static let barWidth: CGFloat = 2.5
    static let height: CGFloat = 12

    let tint: Color
    let reduceMotion: Bool

    var body: some View {
        TimelineView(.animation(minimumInterval: nil, paused: reduceMotion)) { context in
            let time = reduceMotion ? 0 : context.date.timeIntervalSinceReferenceDate
            HStack(alignment: .bottom, spacing: Self.barWidth) {
                ForEach(Self.bars, id: \.self) { shift in
                    Capsule()
                        .fill(tint)
                        .frame(width: Self.barWidth, height: Self.height * Self.level(time: time, shift: shift))
                }
            }
            .frame(height: Self.height, alignment: .bottom)
        }
        .accessibilityHidden(true)
    }

    /// La hauteur d'une barre, entre un tiers et la pleine hauteur ; au repos (réduction), des hauteurs étagées.
    static func level(time: TimeInterval, shift: Double) -> CGFloat {
        let wave = (sin((time * 1.6 + shift) * 2 * .pi) + 1) / 2
        return CGFloat(0.35 + 0.65 * wave)
    }
}

/// Les mots de la pilule d'écoute.
enum ProfileListeningCopy {
    static let maxTextWidth: CGFloat = 180

    static var now: String {
        String(localized: "profile.listening.now", defaultValue: "Écoute en ce moment", bundle: .module)
    }

    static var hint: String {
        String(localized: "profile.listening.a11y", defaultValue: "Touchez pour voir ce qui est écouté", bundle: .module)
    }
}

private struct AvatarListeningSourceKey: EnvironmentKey {
    static let defaultValue: AvatarListeningSource? = nil
}

public extension EnvironmentValues {
    /// La source des écoutes servies ; `nil` : aucun bandeau.
    var avatarListeningSource: AvatarListeningSource? {
        get { self[AvatarListeningSourceKey.self] }
        set { self[AvatarListeningSourceKey.self] = newValue }
    }
}
