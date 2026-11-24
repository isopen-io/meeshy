import Combine
import SwiftUI

// MARK: - La voix autour du grand avatar de la fiche (#20531)
//
// L'app remet une forme qui vit autour de l'avatar et une légende posée sous lui, et dit, personne par personne, quand
// une voix est en cours. La fiche ne sait ni ce qu'est cette voix ni d'où elle vient : elle monte la forme derrière
// l'avatar tant que la voix dure, pose la légende sous lui en faisant descendre le nom, et tait l'écoute de l'avatar.

/// Ce que la fiche montre d'une voix : rien, ou une voix — avec ou sans sa légende sous l'avatar.
public nonisolated enum ProfileHeroVoiceState: Equatable, Sendable {
    case silent
    case voice(captioned: Bool)

    /// Une voix est en cours : la forme se monte et l'écoute de l'avatar se tait.
    public var isActive: Bool { self != .silent }

    /// La légende se pose sous l'avatar, et le nom descend de sa hauteur.
    public var showsCaption: Bool { self == .voice(captioned: true) }
}

/// Ce que l'app fournit : la forme posée derrière l'avatar (centrée, sans changer sa place), la légende posée sous lui,
/// et l'état de la voix d'une personne — l'état courant puis chacun de ses changements.
public struct ProfileHeroVoice {
    /// La forme d'une personne, autour d'un cercle de rayon `baseRadius`, qui ne dépasse jamais `baseRadius + maxAmplitude`.
    public typealias Bubble = (_ userId: String, _ baseRadius: CGFloat, _ maxAmplitude: CGFloat) -> AnyView
    public typealias Caption = (_ userId: String) -> AnyView
    public typealias States = @MainActor (_ userId: String) -> AnyPublisher<ProfileHeroVoiceState, Never>

    public let bubble: Bubble
    public let caption: Caption
    public let states: States

    public init(bubble: @escaping Bubble, caption: @escaping Caption, states: @escaping States) {
        self.bubble = bubble
        self.caption = caption
        self.states = states
    }
}

private struct ProfileHeroVoiceKey: EnvironmentKey {
    static let defaultValue: ProfileHeroVoice? = nil
}

public extension EnvironmentValues {
    /// La voix autour du grand avatar d'une fiche ; `nil` : rien autour de l'avatar.
    var profileHeroVoice: ProfileHeroVoice? {
        get { self[ProfileHeroVoiceKey.self] }
        set { self[ProfileHeroVoiceKey.self] = newValue }
    }
}

/// Lit l'état de la voix d'une personne et le remet au héros ; silencieux sans voix fournie ni personne. Chaque
/// changement s'anime, sauf sous « Réduire les animations ».
struct ProfileHeroVoiceReader<Content: View>: View {
    let voice: ProfileHeroVoice?
    let userId: String?
    @ViewBuilder let content: (ProfileHeroVoiceState) -> Content

    @State private var state = ProfileHeroVoiceState.silent
    @Environment(\.accessibilityReduceMotion) private var systemReduceMotion
    @Environment(\.meeshyForceReduceMotion) private var forcedReduceMotion

    var body: some View {
        content(state)
            .task(id: userId) {
                state = .silent
                guard let voice, let userId, !userId.isEmpty else { return }
                for await value in voice.states(userId).values where value != state {
                    let reduce = MeeshyMotion.shouldReduce(system: systemReduceMotion, userForced: forcedReduceMotion)
                    withAnimation(reduce ? nil : .spring(response: 0.3, dampingFraction: 0.8)) { state = value }
                }
            }
    }
}

/// La forme posée derrière l'avatar tant qu'une voix dure, entrée et sortie en fondu agrandi (fondu seul sous
/// « Réduire les animations ») ; elle ne prend jamais le doigt et ne change pas la place de l'avatar.
struct ProfileHeroVoiceHalo: View {
    let voice: ProfileHeroVoice
    let userId: String
    let isActive: Bool
    let baseRadius: CGFloat
    let maxAmplitude: CGFloat

    @Environment(\.accessibilityReduceMotion) private var systemReduceMotion
    @Environment(\.meeshyForceReduceMotion) private var forcedReduceMotion

    var body: some View {
        let reduce = MeeshyMotion.shouldReduce(system: systemReduceMotion, userForced: forcedReduceMotion)
        ZStack {
            if isActive {
                voice.bubble(userId, baseRadius, maxAmplitude)
                    .transition(reduce ? .opacity : .opacity.combined(with: .scale(scale: 0.85)))
            }
        }
        .allowsHitTesting(false)
        .accessibilityHidden(true)
    }
}

/// La légende de la voix, posée juste sous l'avatar (sous son cadre quand il en porte un) ; elle s'efface avec les
/// signes du grand avatar pendant le repli, et ne se pose pas sur le mini-avatar de la barre.
struct ProfileHeroVoiceCaption: View {
    let voice: ProfileHeroVoice
    let userId: String
    let isShown: Bool
    let avatarSize: CGFloat
    let avatarSpill: CGFloat

    var body: some View {
        ZStack {
            if isShown, ProfileHeroSignals.opacity(avatarSize: avatarSize) > 0 {
                voice.caption(userId)
                    .dynamicTypeSize(...DynamicTypeSize.xLarge)
                    .fixedSize()
                    .opacity(ProfileHeroSignals.opacity(avatarSize: avatarSize))
                    .transition(.opacity)
            }
        }
        .alignmentGuide(.bottom) { $0[.top] - avatarSpill - CGFloat(ProfileHeroPlan.voiceCaptionGap) }
        .allowsHitTesting(false)
    }
}

public extension ProfileHeroPlan {
    /// La place que la légende de la voix prend sous l'avatar déplié : le nom descend d'autant.
    nonisolated static let voiceCaptionHeight: Double = 22
    /// L'écart entre le bas de l'avatar (ou de son cadre) et la légende.
    nonisolated static let voiceCaptionGap: Double = 2

    /// Le bord extérieur de ce que l'avatar du héros peint, vu depuis le visage autour duquel la voix se pose : le
    /// cadre équipé (sa boîte, ramenée à l'échelle que le cadre impose au visage et à son anneau de story), sinon
    /// l'anneau de story, sinon le visage nu.
    static func voiceOuterRadius(avatarSize: CGFloat, hasRing: Bool, storyRingSize: CGFloat?) -> CGFloat {
        guard hasRing else { return (storyRingSize ?? avatarSize) / 2 }
        let scale = AvatarRingGeometry.avatarScale(avatarSize: avatarSize, storyRingSize: storyRingSize)
        return AvatarRingGeometry.decoratedSide(avatarSize: avatarSize) / 2 / scale
    }

    /// La part du rayon de l'avatar qu'une voix à pleine bande ajoute autour de lui.
    nonisolated static let voiceAmplitudeShare: CGFloat = 0.35

    /// La hauteur d'une bande à pleine voix autour d'un avatar de diamètre `avatarSize` : 35 % de son rayon, sur le
    /// grand comme sur le mini-avatar de la barre.
    nonisolated static func voiceAmplitude(avatarSize: CGFloat) -> CGFloat {
        voiceAmplitudeShare * avatarSize / 2
    }

    /// Ce dont le nom descend sous l'avatar déplié : la légende quand elle se pose, rien sinon.
    nonisolated static func voiceTitleDrop(_ state: ProfileHeroVoiceState) -> Double {
        state.showsCaption ? voiceCaptionHeight : 0
    }
}
