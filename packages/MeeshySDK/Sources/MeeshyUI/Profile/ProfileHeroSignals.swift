import Combine
import SwiftUI
import MeeshySDK

// MARK: - Les signes de la fiche, à côté du grand avatar (#20178)
//
// Ce que la personne vit en ce moment, en ICÔNES comme la présence : la batterie de son téléphone (en charge, pleine,
// son pourcentage) et ce qu'elle écoute. Le type de lien, lui, est la pastille de cercle de l'avatar. Chaque signe ne
// paraît que si l'app le sert ; rien sur ma propre fiche, rien dans la barre repliée.

/// Ce que l'icône de batterie peint : le symbole, sa teinte et la phrase de VoiceOver, composés par l'app depuis l'état
/// servi (le SDK ne lit aucun magasin).
public struct ProfileBatterySignal: Equatable, Sendable {
    public let systemImage: String
    public let tint: Color
    public let spoken: String

    public init(systemImage: String, tint: Color, spoken: String) {
        self.systemImage = systemImage
        self.tint = tint
        self.spoken = spoken
    }
}

/// La batterie d'une personne telle que l'app la sert : l'état courant puis chacun de ses changements, `nil` hors
/// épisode — l'icône n'existe alors pas ; et la façon dont l'app le DIT (symbole, teinte, phrase).
public struct ProfileHeroBattery {
    public let states: @MainActor (_ userId: String) -> AnyPublisher<BatteryReaderState?, Never>
    public let describe: @MainActor (_ state: BatteryReaderState) -> ProfileBatterySignal

    public init(states: @escaping @MainActor (_ userId: String) -> AnyPublisher<BatteryReaderState?, Never>,
                describe: @escaping @MainActor (_ state: BatteryReaderState) -> ProfileBatterySignal) {
        self.states = states
        self.describe = describe
    }
}

private struct ProfileHeroBatteryKey: EnvironmentKey {
    static let defaultValue: ProfileHeroBattery? = nil
}

public extension EnvironmentValues {
    /// L'icône de batterie de la fiche ; `nil` : aucune.
    var profileHeroBattery: ProfileHeroBattery? {
        get { self[ProfileHeroBatteryKey.self] }
        set { self[ProfileHeroBatteryKey.self] = newValue }
    }
}

/// Les signes posés à côté du grand avatar, sur la ligne de son bas ; ils s'effacent avec lui quand l'en-tête se replie.
struct ProfileHeroSignals: View {
    /// Sous ce diamètre, l'avatar est dans la barre repliée : les signes n'y ont pas leur place.
    static let minimumAvatarSize: CGFloat = 64
    /// La course sur laquelle ils s'effacent pendant le repli.
    static let fadeRange: CGFloat = 24

    let userId: String?
    let avatarSize: CGFloat
    let tint: Color
    @Environment(\.avatarListeningSource) private var listening
    @Environment(\.avatarListeningSuppressed) private var listeningSuppressed
    @Environment(\.profileHeroBattery) private var battery

    static func isShown(userId: String?, avatarSize: CGFloat) -> Bool {
        guard let userId, !userId.isEmpty else { return false }
        return avatarSize >= minimumAvatarSize
    }

    /// L'opacité des signes pour un diamètre d'avatar : pleine sur le grand, nulle sous le seuil.
    static func opacity(avatarSize: CGFloat) -> Double {
        let shown = (avatarSize - minimumAvatarSize) / fadeRange
        return Double(min(1, max(0, shown)))
    }

    var body: some View {
        if let userId, Self.isShown(userId: userId, avatarSize: avatarSize) {
            HStack(spacing: MeeshySpacing.sm) {
                if let battery {
                    ProfileBatteryLive(userId: userId, battery: battery)
                }
                if let listening, !listeningSuppressed {
                    ProfileListeningLive(userId: userId, source: listening, tint: tint)
                }
            }
            .fixedSize()
            .offset(x: avatarSize + MeeshySpacing.md, y: -avatarSize * 0.12)
            .opacity(Self.opacity(avatarSize: avatarSize))
        }
    }
}

/// L'icône de batterie d'UNE personne, abonnée à sa source ; rien tant qu'aucun épisode n'est servi.
private struct ProfileBatteryLive: View {
    let userId: String
    let battery: ProfileHeroBattery
    @State private var state: BatteryReaderState?

    var body: some View {
        ZStack {
            if let state {
                glyph(battery.describe(state))
            }
        }
        .task(id: userId) {
            state = nil
            for await value in battery.states(userId).values {
                state = value
            }
        }
    }

    private func glyph(_ signal: ProfileBatterySignal) -> some View {
        Image(systemName: signal.systemImage)
            .symbolRenderingMode(.palette)
            .foregroundStyle(signal.tint, Color.white.opacity(0.9))
            .font(MeeshyFont.relative(MeeshyFont.subheadSize, weight: .semibold))
            .padding(.horizontal, MeeshySpacing.sm)
            .padding(.vertical, MeeshySpacing.xsPlus)
            .meeshyGlass(in: Capsule(), tone: .theme, tint: signal.tint)
            .accessibilityElement()
            .accessibilityLabel(signal.spoken)
            .accessibilityIdentifier("profile.battery")
    }
}
