import Combine
import MeeshyUI
import SwiftUI

/// OÙ LA VOIX DU TALKIE VIT (#20531) : en orbe sous le doigt — sur le bouton du talkie de l'en-tête, bornée à la
/// rangée (le nom, le retour et les actions restent visibles), et sur le bouton « Maintenir pour parler » de la fiche,
/// bornée à sa marge —, et autour de l'avatar de la fiche. Montée seulement tant qu'une voix va vers la personne ou
/// vient d'elle.
nonisolated enum TalkieVoiceHostLaw {
    /// L'orbe de l'en-tête part du centre du bouton et ne sort jamais de la rangée : `maxAmplitude ≤ rowHeight / 2`.
    static func headerOrb(buttonSize: CGFloat, rowHeight: CGFloat) -> TalkieBubbleGeometry {
        holdOrb(buttonSize: buttonSize, room: (rowHeight - buttonSize) / 2)
    }

    /// Jusqu'où l'orbe d'un bouton dépasse son bord, en part de son rayon, quand la place le permet.
    static let holdOrbReach: CGFloat = 0.7

    /// L'orbe d'un bouton qu'on maintient : elle part de son CENTRE — un point au silence — et la voix la pousse
    /// jusqu'au bord du bouton plus `room`, la marge libre qui l'entoure, et au plus 70 % du rayon au-delà du bord ;
    /// une marge négative la rentre d'autant dans le bouton. Elle répond à la voix (`TalkieBubbleResponse.voice`).
    static func holdOrb(buttonSize: CGFloat, room: CGFloat) -> TalkieBubbleGeometry {
        let radius = buttonSize / 2
        return TalkieBubbleGeometry(baseRadius: 0, maxAmplitude: max(0, radius + min(room, holdOrbReach * radius)),
                                    response: .voice)
    }

    /// Le reflet et l'anneau du décompte autour d'un bouton maintenu : l'orbe les remplace tant qu'elle vit
    /// (#20531) ; le nombre de secondes reste.
    static func holdRingsVisible(orbShows: Bool) -> Bool {
        !orbShows
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
    /// Construite une fois pour toute l'app : la racine la relit à chaque rendu sans en refaire les fermetures.
    static let shared = make()

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

/// L'orbe d'un bouton du talkie — celui de l'en-tête, celui de la fiche, le micro du bandeau reçu : née au centre du
/// bouton, posée entre son fond et son glyphe, sans changer sa place ni prendre le doigt, entrée et sortie en fondu agrandi (fondu seul sous « Réduire les animations »). L'hôte
/// lui dit quand se montrer (`TalkieVoiceHostLaw.shows`) et à quelle échelle : la feuille n'observe aucun singleton.
struct TalkieHoldOrb: View {
    let userId: String
    let shows: Bool
    var geometry: TalkieBubbleGeometry = TalkieHoldOrb.headerGeometry
    /// Nil : la voix vers la personne comme celle qui vient d'elle ; sinon, ce sens seul.
    var direction: TalkieVoiceDirection?

    @Environment(\.accessibilityReduceMotion) private var systemReduceMotion
    @Environment(\.meeshyForceReduceMotion) private var forcedReduceMotion

    static let headerGeometry = TalkieVoiceHostLaw.headerOrb(buttonSize: MeeshyControlSize.small,
                                                       rowHeight: MeeshyControlSize.tapTarget)

    var body: some View {
        let reduceMotion = MeeshyMotion.shouldReduce(system: systemReduceMotion, userForced: forcedReduceMotion)
        ZStack {
            if shows {
                TalkieVoiceBubble(userId: userId, geometry: geometry, direction: direction)
                    .transition(reduceMotion ? .opacity : .opacity.combined(with: .scale(scale: 0.6)))
            }
        }
        .animation(MeeshyMotion.animation(.rise, reduce: reduceMotion), value: shows)
        .allowsHitTesting(false)
        .accessibilityHidden(true)
    }
}
