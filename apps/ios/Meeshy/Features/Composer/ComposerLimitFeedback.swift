import Foundation
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

@MainActor
final class ComposerSystemLimitSpeaker: ComposerLimitSpeaking {
    func say(_ message: String) { FeedbackToastManager.shared.showNotice(message) }
    nonisolated deinit {}
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
