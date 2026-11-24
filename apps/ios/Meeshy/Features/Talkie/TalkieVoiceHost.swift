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

extension TalkieVoiceStageObserver {
    /// Les voix en cours, lues par tous les hôtes de l'app : un abonnement au registre, publié au début et à la fin.
    static let shared = TalkieVoiceStageObserver()
}

/// La voix autour de l'avatar d'une fiche, remise au SDK sans qu'il sache ce qu'est un talkie.
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
                    .map { TalkieVoiceHostLaw.heroState(userId: userId, voices: $0) }
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
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    static let geometry = TalkieVoiceHostLaw.headerOrb(buttonSize: MeeshyControlSize.small,
                                                       rowHeight: MeeshyControlSize.tapTarget)

    init(userId: String, voices: TalkieVoiceStageObserver = .shared) {
        self.userId = userId
        _voices = ObservedObject(wrappedValue: voices)
    }

    var body: some View {
        let shows = TalkieVoiceHostLaw.shows(userId: userId, voices: voices.voices)
        ZStack {
            if shows {
                TalkieVoiceBubble(userId: userId, geometry: Self.geometry)
                    .transition(reduceMotion ? .opacity : .opacity.combined(with: .scale(scale: 0.6)))
            }
        }
        .animation(reduceMotion ? .easeOut(duration: 0.15) : .spring(response: 0.3, dampingFraction: 0.75), value: shows)
        .allowsHitTesting(false)
        .accessibilityHidden(true)
    }
}
