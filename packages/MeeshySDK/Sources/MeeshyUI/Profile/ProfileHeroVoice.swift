import Combine
import MeeshySDK
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
    /// L'état d'une personne. La suite rendue peut être abonnée depuis n'importe quel fil : la fiche, elle, s'y abonne
    /// et la lit sur le fil principal (`liveStates`), si bien qu'un maillon isolé au MainActor n'y piège rien.
    public let states: States

    public init(bubble: @escaping Bubble, caption: @escaping Caption, states: @escaping States) {
        self.bubble = bubble
        self.caption = caption
        self.states = states
    }

    /// Ce que la fiche lit : l'état de la personne, abonné et servi sur le fil principal. L'itérateur `.values`
    /// demande hors du fil principal et une source `@Published` y rejoue sa valeur courante ; sans ce relais, un
    /// maillon de l'app isolé au MainActor piégeait l'ouverture d'une fiche.
    @MainActor
    func liveStates(_ userId: String) -> AnyPublisher<ProfileHeroVoiceState, Never> {
        states(userId)
            .subscribe(on: DispatchQueue.main)
            .receive(on: DispatchQueue.main)
            .eraseToAnyPublisher()
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
                for await value in voice.liveStates(userId).values where value != state {
                    let reduce = MeeshyMotion.shouldReduce(system: systemReduceMotion, userForced: forcedReduceMotion)
                    withAnimation(MeeshyMotion.animation(.morph, reduce: reduce)) { state = value }
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

/// Le gabarit de la voix autour de l'avatar, en points d'écran : le cercle d'où elle part, et sa hauteur à pleine voix.
public nonisolated struct ProfileHeroVoiceHaloGeometry: Equatable, Sendable {
    public let baseRadius: CGFloat
    public let maxAmplitude: CGFloat
}

public extension ProfileHeroPlan {
    /// La place que la légende de la voix prend sous l'avatar déplié : le nom descend d'autant.
    nonisolated static let voiceCaptionHeight: Double = 22
    /// L'écart entre le bas de l'avatar (ou de son cadre) et la légende.
    nonisolated static let voiceCaptionGap: Double = 2

    /// La voix autour de l'avatar du héros, À L'ÉCRAN : elle se pose HORS du cadre (`.background` après
    /// `.avatarRing`), que l'échelle du visage — anneau de story, film illustré — ne touche donc jamais. Elle part du
    /// bord de ce que l'avatar peint — la boîte du cadre équipé, sinon l'anneau de story, sinon le visage nu — et s'en
    /// écarte d'au plus 35 % de son rayon.
    static func voiceHalo(avatarSize: CGFloat, ring: AvatarRingDesign?, storyRingSize: CGFloat?) -> ProfileHeroVoiceHaloGeometry {
        let painted = ring.map { AvatarRingLayout.make($0, avatarSize: avatarSize, storyRingSize: storyRingSize).box }
        return ProfileHeroVoiceHaloGeometry(baseRadius: (painted ?? storyRingSize ?? avatarSize) / 2,
                                            maxAmplitude: voiceAmplitude(avatarSize: avatarSize))
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

    /// Où commence ce qui défile sous le héros, la voix comprise : tant que sa légende se pose, la première carte
    /// descend avec le nom, pour ne jamais passer sous lui.
    nonisolated static func contentTop(voiceState: ProfileHeroVoiceState) -> Double {
        MeeshyCollapsingHeroRecipe.contentTop(expandedHeight: expandedHeight, avatarCaption: voiceTitleDrop(voiceState))
    }
}
