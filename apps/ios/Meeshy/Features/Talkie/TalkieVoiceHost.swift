import Combine
import MeeshyUI
import SwiftUI

/// OÙ LA VOIX DU TALKIE VIT (#20531) : en orbe sur le bouton du talkie de l'en-tête, née sous le doigt et bornée à la
/// rangée — le nom, le retour et les actions restent visibles —, et autour de l'avatar de la fiche. Montée seulement
/// tant qu'une voix va vers la personne ou vient d'elle.
nonisolated enum TalkieVoiceHostLaw {
    /// L'orbe part du bord du bouton et ne sort jamais de la rangée : `baseRadius + maxAmplitude ≤ rowHeight / 2`.
    static func headerOrb(buttonSize: CGFloat, rowHeight: CGFloat) -> TalkieBubbleGeometry {
        TalkieBubbleGeometry(baseRadius: buttonSize / 2, maxAmplitude: max(0, (rowHeight - buttonSize) / 2))
    }

    /// La bulle part du bord extérieur de ce que l'avatar peint, et s'en écarte d'au plus 35 % de son rayon.
    static func profileHero(outerRingRadius: CGFloat, avatarSize: CGFloat) -> TalkieBubbleGeometry {
        TalkieBubbleGeometry(baseRadius: outerRingRadius, maxAmplitude: ProfileHeroPlan.voiceAmplitude(avatarSize: avatarSize))
    }

    /// Ce que la fente du talkie de l'en-tête montre : le bouton quand il est proposé ; sinon, tant que le pair parle,
    /// une fente d'écoute de même taille, sans geste, qui porte l'orbe de sa voix ; rien le reste du temps.
    static func headerSlot(offered: Bool, withdrawn: Bool, incoming: Bool) -> TalkieHeaderSlot {
        if offered && !withdrawn { return .button }
        return incoming ? .listeningSlot : .none
    }

    /// La voix du pair arrive en ce moment.
    static func incoming(userId: String, voices: Set<TalkieVoiceKey>) -> Bool {
        voices.contains(TalkieVoiceKey(userId: userId, direction: .incoming))
    }

    /// Ce que VoiceOver annonce quand ma voix part : son sort en entrant en direct, puis à chaque changement de sort
    /// tant qu'elle dure ; rien à la fin, rien sans changement. La voix qui arrive s'annonce par l'indicateur de
    /// réception, jamais ici.
    static func announcement(previous: TalkieHeaderDelivery?, current: TalkieHeaderDelivery?) -> TalkieHeaderDelivery? {
        guard let current, current != previous else { return nil }
        return current
    }

    /// Une voix vers la personne, ou de la personne : l'hôte se monte.
    static func shows(userId: String, voices: Set<TalkieVoiceKey>) -> Bool {
        voices.contains { $0.userId == userId }
    }

    /// Ce que la fiche montre : la bulle pour toute voix de la personne, le compteur pour la mienne vers elle.
    static func heroState(userId: String, voices: Set<TalkieVoiceKey>) -> ProfileHeroVoiceState {
        guard shows(userId: userId, voices: voices) else { return .silent }
        return .voice(captioned: voices.contains(TalkieVoiceKey(userId: userId, direction: .outgoing)))
    }
}

/// La fente du talkie dans l'en-tête d'un direct.
nonisolated enum TalkieHeaderSlot: Equatable, Sendable {
    case none
    case button
    case listeningSlot
}

/// Ce que devient ma voix pendant qu'elle part (#17337) : entendue à l'instant, gardée pour plus tard parce que
/// l'autre est hors ligne, ou enregistrée en message vocal parce que le talkie ne passe pas.
nonisolated enum TalkieHeaderDelivery: Equatable, Sendable {
    case live
    case relayed
    case recorded

    static func resolve(phase: TalkieSender.Phase, waking: Bool) -> TalkieHeaderDelivery {
        if case .recordingCopy = phase { return .recorded }
        return waking ? .relayed : .live
    }
}

/// Les phrases que VoiceOver entend du talkie de l'en-tête : le sort de ma voix qui part, et la fente d'écoute.
nonisolated enum TalkieHeaderWording {
    /// « Bob te parle » : la même phrase que l'indicateur de réception.
    static func peerSpeaking(name: String) -> String {
        String(format: String(localized: "talkie.incoming.title", defaultValue: "%@ te parle", bundle: .main), name)
    }

    static func announcement(_ delivery: TalkieHeaderDelivery) -> String {
        switch delivery {
        case .live:
            String(localized: "talkie.header.announce.live", defaultValue: "Talkie en direct : ta voix est entendue maintenant", bundle: .main)
        case .relayed:
            String(localized: "talkie.header.announce.relayed", defaultValue: "Hors ligne : ta voix lui sera rejouée à son retour", bundle: .main)
        case .recorded:
            String(localized: "talkie.header.announce.recorded", defaultValue: "Le talkie ne passe pas : ta voix part en message vocal", bundle: .main)
        }
    }
}

extension TalkieVoiceStageObserver {
    /// Les voix en cours, lues par tous les hôtes de l'app : un abonnement au registre, publié au début et à la fin.
    static let shared = TalkieVoiceStageObserver()
}

/// La voix autour de l'avatar d'une fiche, remise au SDK sans qu'il sache ce qu'est un talkie. Les maillons de l'état
/// sont hors de tout acteur : la fiche le lit par `.values`, dont l'itérateur demande hors du fil principal, et
/// `@Published` y rejoue sa valeur courante — un maillon isolé au MainActor y piégeait l'ouverture d'un profil.
@MainActor
enum TalkieProfileHeroVoice {
    static func make(observer: TalkieVoiceStageObserver = .shared) -> ProfileHeroVoice {
        ProfileHeroVoice(
            bubble: { userId, baseRadius, maxAmplitude in
                ProfileSlot.view(.voiceBubble, userId: userId, displayName: "",
                                 voice: TalkieBubbleGeometry(baseRadius: baseRadius, maxAmplitude: maxAmplitude))
            },
            caption: { userId in ProfileSlot.view(.voiceClock, userId: userId, displayName: "") },
            states: { userId in
                observer.$voices
                    .map { @Sendable voices in TalkieVoiceHostLaw.heroState(userId: userId, voices: voices) }
                    .removeDuplicates()
                    .eraseToAnyPublisher()
            }
        )
    }
}

/// L'orbe du bouton du talkie de l'en-tête : posée derrière le glyphe, sans changer sa place ni prendre le doigt,
/// entrée et sortie en fondu agrandi (fondu seul sous « Réduire les animations »).
struct TalkieHeaderOrb: View {
    let userId: String

    @ObservedObject private var voices: TalkieVoiceStageObserver
    @Environment(\.accessibilityReduceMotion) private var systemReduceMotion
    @Environment(\.meeshyForceReduceMotion) private var forcedReduceMotion

    static let geometry = TalkieVoiceHostLaw.headerOrb(buttonSize: MeeshyControlSize.small,
                                                       rowHeight: MeeshyControlSize.tapTarget)

    init(userId: String, voices: TalkieVoiceStageObserver = .shared) {
        self.userId = userId
        _voices = ObservedObject(wrappedValue: voices)
    }

    var body: some View {
        let shows = TalkieVoiceHostLaw.shows(userId: userId, voices: voices.voices)
        let reduceMotion = MeeshyMotion.shouldReduce(system: systemReduceMotion, userForced: forcedReduceMotion)
        ZStack {
            if shows {
                TalkieVoiceBubble(userId: userId, geometry: Self.geometry)
                    .transition(reduceMotion ? .opacity : .opacity.combined(with: .scale(scale: 0.6)))
            }
        }
        .animation(MeeshyMotion.animation(.rise, reduce: reduceMotion), value: shows)
        .allowsHitTesting(false)
        .accessibilityHidden(true)
    }
}
