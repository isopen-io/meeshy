import SwiftUI
import MeeshySDK
import MeeshyUI

/// **Le refus d'un plafond se DIT** (#13590) : un geste sans effet visible se
/// lit comme un bouton inerte. Le viewmodel annonce la borne atteinte
/// (`onLimitReached`) ; ce site la traduit en haptique d'erreur et en message
/// qui chiffre la borne — le chiffre vient de `StoryComposerLimits`, jamais
/// recopié ici.
@MainActor
enum ComposerLimitFeedback {

    /// Le message du refus, dans la langue de l'interface et le nom du format
    /// composé (#13913) : seule la durée nomme le format.
    static func message(for limit: StoryComposerLimit, format composed: ComposerFormat = .story) -> String {
        let pattern: String
        switch limit {
        case .sticker:
            pattern = String(localized: "composer.limit.sticker", defaultValue: "%lld stickers au maximum par scène", bundle: .main)
        case .image:
            pattern = String(localized: "composer.limit.image", defaultValue: "%lld images au maximum par scène", bundle: .main)
        case .text:
            pattern = String(localized: "composer.limit.text", defaultValue: "%lld textes au maximum par scène", bundle: .main)
        case .audio:
            pattern = String(localized: "composer.limit.audio", defaultValue: "%lld audios au maximum par scène", bundle: .main)
        case .video:
            pattern = String(localized: "composer.limit.video", defaultValue: "%lld vidéos au maximum par scène", bundle: .main)
        case .textLength:
            pattern = String(localized: "composer.limit.textLength", defaultValue: "%lld caractères au maximum par texte", bundle: .main)
        case .duration:
            return ComposerFormatVariant.of(composed).durationLimitMessage(hours: limit.value)
        }
        return String(format: pattern, limit.value)
    }

    /// Branche le retour sur `composer` et le rend : `showError` porte l'haptique
    /// d'erreur et le message.
    @discardableResult
    static func attached(to composer: StoryComposerViewModel) -> StoryComposerViewModel {
        composer.onLimitReached = { board.report($0) }
        _ = typingRelay
        return composer
    }

    /// Le tableau partagé : une frappe qui bute ne vibre qu'une fois.
    static let board = ComposerLimitNoticeBoard(speaker: ComposerSystemLimitSpeaker())

    /// La frappe sur la scène ne passe pas par le viewmodel : le canvas coupe le
    /// texte et poste `StoryInlineTextLengthGate.limitReached`, que ce relais dit
    /// comme les autres refus.
    static let typingRelay: NSObjectProtocol = NotificationCenter.default.addObserver(
        forName: StoryInlineTextLengthGate.limitReached, object: nil, queue: nil
    ) { _ in
        MainActor.assumeIsolated { board.report(.textLength) }
    }
}

/// **Une limite se dit à la limite, une fois par geste** (#13839, L3). Aucun
/// compteur ni plafond n'est affiché au repos ; atteindre la borne la dit, et
/// la redire pendant la même frappe serait une vibration par caractère.
nonisolated enum ComposerLimitNotice {
    static let quietInterval: TimeInterval = 2

    struct Spoken: Equatable, Sendable {
        let limit: StoryComposerLimit
        let at: Date
    }

    static func speaks(_ limit: StoryComposerLimit, at now: Date, last: Spoken?) -> Bool {
        guard let last, last.limit == limit else { return true }
        return now.timeIntervalSince(last.at) >= quietInterval
    }
}

/// Qui DIT une limite : message, annonce VoiceOver et vibration.
@MainActor
protocol ComposerLimitSpeaking: AnyObject {
    func say(_ message: String)
}

/// **La limite se dit par une CAPSULE, plus par un toast** (#17111) : posée
/// au-dessus de la pilule (L12), elle chiffre la borne, vibre d'un avertissement et se
/// dit à VoiceOver. Le toast montait loin du geste refusé et couvrait le socle.
@MainActor
final class ComposerSystemLimitSpeaker: ComposerLimitSpeaking {
    private let capsule: ComposerLimitCapsule
    private let haptic: () -> Void
    private let announce: (String) -> Void

    init(capsule: ComposerLimitCapsule = .shared,
         haptic: @escaping () -> Void = { HapticFeedback.warning() },
         announce: @escaping (String) -> Void = { AdaptiveAccessibility.announce($0) }) {
        self.capsule = capsule
        self.haptic = haptic
        self.announce = announce
    }

    func say(_ message: String) {
        haptic()
        announce(message)
        capsule.show(message)
    }

    nonisolated deinit {}
}

/// **Ce que la capsule montre, et combien de temps** : un message à la fois,
/// le dernier refus remplace le précédent, et elle se retire seule.
@MainActor
final class ComposerLimitCapsule: ObservableObject {
    static let shared = ComposerLimitCapsule()
    static let visibleFor: Duration = .milliseconds(2200)

    @Published private(set) var message: String?
    private var generation = 0
    private let sleep: @concurrent @Sendable (Duration) async throws -> Void

    init(sleep: @escaping @concurrent @Sendable (Duration) async throws -> Void = { try await Task.sleep(for: $0) }) {
        self.sleep = sleep
    }

    nonisolated deinit {}

    func show(_ text: String) {
        generation += 1
        let tour = generation
        message = text
        let sleep = self.sleep
        Task { [weak self] in
            do {
                try await sleep(Self.visibleFor)
                self?.retire(ifStill: tour)
            } catch {}
        }
    }

    func retire(ifStill tour: Int? = nil) {
        guard tour == nil || tour == generation else { return }
        message = nil
    }
}

/// La capsule posée au-dessus de la pilule : verre sombre, texte blanc, muette pour
/// VoiceOver (l'annonce est déjà faite), et elle ne prend aucun doigt.
struct ComposerLimitCapsuleView: View {
    @ObservedObject var capsule: ComposerLimitCapsule
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        VStack(spacing: 0) {
            Spacer(minLength: 0)
            if let message = capsule.message {
                Text(message)
                    .font(.footnote.weight(.semibold))
                    .foregroundStyle(.white)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, MeeshySpacing.md)
                    .padding(.vertical, MeeshySpacing.sm)
                    .adaptiveGlass(in: Capsule(), tint: Color.black.opacity(0.55))
                    .transition(reduceMotion ? .opacity : .move(edge: .bottom).combined(with: .opacity))
                    .accessibilityHidden(true)
                    .accessibilityIdentifier("composer.limit.capsule")
            }
        }
        // **Au-dessus de la pilule, jamais sous ✕** (L12) : le socle est un
        // `safeAreaInset` bas de la surface, la capsule se pose donc sur lui, au
        // plus près du geste refusé, sans croiser la rangée des scènes du haut.
        .padding(.horizontal, MeeshySpacing.md)
        .padding(.bottom, MeeshySpacing.sm)
        .frame(maxWidth: .infinity)
        .animation(reduceMotion ? nil : .spring(response: 0.3, dampingFraction: 0.85), value: capsule.message)
        .allowsHitTesting(false)
    }
}

@MainActor
final class ComposerLimitNoticeBoard {
    private let speaker: ComposerLimitSpeaking
    private let clock: () -> Date
    private var last: ComposerLimitNotice.Spoken?
    /// Le format armé par l'hôte, pour nommer le plafond de durée.
    var format: ComposerFormat = .story

    init(speaker: ComposerLimitSpeaking, clock: @escaping () -> Date = Date.init) {
        self.speaker = speaker
        self.clock = clock
    }

    nonisolated deinit {}

    func report(_ limit: StoryComposerLimit) {
        let now = clock()
        guard ComposerLimitNotice.speaks(limit, at: now, last: last) else { return }
        last = .init(limit: limit, at: now)
        speaker.say(ComposerLimitFeedback.message(for: limit, format: format))
    }
}
