import Foundation
import UIKit
import MeeshySDK

/// #8396 — la couleur STABLE d'une personne dans un appel : dérivée de son
/// identifiant (jamais de son nom, qui change), la même pour sa ligne de
/// sous-titres et pour le liseré de sa vignette de groupe. Palette et hachage
/// sont ceux du SDK (`DynamicColorGenerator`), éclaircis pour l'écran d'appel,
/// épinglé en sombre.
///
/// Hors de l'écran d'appel (journal d'après l'appel, dans un fil clair ou
/// sombre), la MÊME couleur s'adapte au thème de l'app (#16634,
/// `docs/product/appels-vue-finale.md` loi 4) : telle quelle si elle tient
/// 4,5:1 sur les fonds du fil, sinon du plus petit pas — la même teinte que
/// le web (`AuthorInk`, #17863).
enum CallSpeakerColor {
    static func hex(for userId: String) -> String {
        DynamicColorGenerator.adaptedColor(DynamicColorGenerator.colorForName(userId), for: .dark)
    }

    static func hex(for userId: String, mode: ThemeMode) -> String {
        AuthorInk.hex(DynamicColorGenerator.colorForName(userId), for: mode)
    }
}

/// Le temps que la passerelle a pour rendre une traduction : passé ce délai, les
/// trois points d'attente retombent et la ligne reste dans sa langue d'origine
/// (la traduction a échoué ou ne viendra plus).
enum CallCaptionTranslationWait {
    static let timeout: TimeInterval = 8
}

/// Une ligne de sous-titres telle que l'écran d'appel la dessine.
///
/// Le Prisme s'applique : la parole d'un pair part tout de suite dans sa langue
/// d'origine, étiquetée « EN » (trois points tant qu'une traduction est attendue),
/// puis la traduction la rejoint, étiquetée « EN → FR ». Toucher une phrase traduite
/// déplie son original dessous, sans retirer la traduction (inversement, quand le
/// journal est réglé sur « Original », toucher montre la traduction). Ma propre
/// parole n'est jamais traduite pour moi.
struct CallCaptionLine: Equatable, Identifiable {
    let id: UUID
    let speakerId: String
    let speakerName: String
    let text: String
    let languageTag: String?
    let isFinal: Bool
    let capturedAt: Date
    let isShowingOriginal: Bool
    let canRevealOriginal: Bool
    /// #16665 — une ligne d'ÉVÉNEMENT (capture, borne d'enregistrement) :
    /// « Karim · a capturé l'écran · 12:40 », pseudo à sa couleur, la phrase
    /// en encre secondaire, jamais colorée.
    var isEvent: Bool = false
    var timeLabel: String?
    /// Loi 6 — l'original déplié sous la traduction touchée, en encre secondaire.
    var originalBelow: String?
    /// Loi 5 — tant que cette échéance n'est pas passée, une traduction est
    /// attendue : la ligne finale d'un pair dont la langue est hors du Prisme.
    var awaitingUntil: Date?
    var originLanguage: String?
    var servedLanguage: String?

    var isAwaitingTranslation: Bool { awaitingUntil != nil }

    /// La ligne à l'instant `now` : l'attente retombe à son échéance, l'étiquette
    /// de la langue d'origine reste.
    func settled(at now: Date) -> CallCaptionLine {
        guard let deadline = awaitingUntil, now >= deadline else { return self }
        var given = self
        given.awaitingUntil = nil
        return given
    }

    var speakerColorHex: String { CallSpeakerColor.hex(for: speakerId) }

    /// La couleur du TEXTE : celle de l'auteur quand la ligne sert sa
    /// TRADUCTION, `nil` (encre de l'écran d'appel) pour un original, ma
    /// parole comprise — le nom, lui, porte toujours la couleur
    /// (`docs/product/appels-vue-finale.md` loi 4).
    var textColorHex: String? { isShowingOriginal || isEvent ? nil : speakerColorHex }

    /// Ce que VoiceOver lit : la phrase FINALE seulement — une révision
    /// partielle, remplacée quelques centaines de millisecondes plus tard,
    /// n'a rien à annoncer.
    var announcement: String? {
        guard isFinal else { return nil }
        guard isEvent else { return "\(speakerName) : \(text)" }
        return [speakerName, text, timeLabel ?? ""].filter { !$0.isEmpty }.joined(separator: ", ")
    }

    /// Annoncée À LA SUITE de ce que VoiceOver lit déjà, jamais par-dessus.
    var queuedAnnouncement: NSAttributedString? {
        announcement.map {
            NSAttributedString(string: $0, attributes: [.accessibilitySpeechQueueAnnouncement: true])
        }
    }

    /// #16665 — la ligne datée d'une capture. Une borne de l'enregistrement
    /// de l'appel ne nomme personne : sa phrase est entière.
    static func capture(_ capture: CallTranscriptCapture, displayName: String, phrase: String, timeLabel: String) -> CallCaptionLine {
        CallCaptionLine(
            id: UUID(uuidString: capture.id) ?? UUID(),
            speakerId: capture.userId,
            speakerName: capture.kind.namesCapturer ? displayName : "",
            text: phrase,
            languageTag: nil,
            isFinal: true,
            capturedAt: capture.capturedAt,
            isShowingOriginal: true,
            canRevealOriginal: false,
            isEvent: true,
            timeLabel: timeLabel
        )
    }

    /// `readerPrism` : la descente stricte du lecteur (`ReaderPrism.resolve`), jamais
    /// une traduction choisie au hasard ; vide, rien n'est attendu.
    static func make(
        segment: CallTranscriptionSegment,
        isLocal: Bool,
        speakerName: String,
        prefersOriginal: Bool,
        isRevealed: Bool,
        readerPrism: [String] = []
    ) -> CallCaptionLine {
        let translation = isLocal ? nil : servedTranslation(segment)
        let showsOriginal = translation == nil || (prefersOriginal && !isRevealed)
        let origin = isLocal || segment.language.isEmpty ? nil : segment.language.uppercased()
        let outsidePrism = origin != nil && !readerPrism.contains { $0.caseInsensitiveCompare(segment.language) == .orderedSame }
        let served = showsOriginal ? nil : segment.translatedLanguage.flatMap { $0.isEmpty ? nil : $0.uppercased() }
        let tag: String? = {
            if let origin, let served { return "\(origin) → \(served)" }
            return outsidePrism && showsOriginal ? origin : nil
        }()
        let awaits = !isLocal && segment.isFinal && translation == nil && outsidePrism && !readerPrism.isEmpty
        return CallCaptionLine(
            id: segment.id,
            speakerId: segment.speakerId,
            speakerName: speakerName,
            text: showsOriginal ? segment.text : (translation ?? segment.text),
            languageTag: tag,
            isFinal: segment.isFinal,
            capturedAt: segment.capturedAt,
            isShowingOriginal: showsOriginal,
            canRevealOriginal: translation != nil,
            originalBelow: translation != nil && !prefersOriginal && isRevealed ? segment.text : nil,
            awaitingUntil: awaits ? segment.capturedAt.addingTimeInterval(CallCaptionTranslationWait.timeout) : nil,
            originLanguage: origin,
            servedLanguage: served
        )
    }

    private static func servedTranslation(_ segment: CallTranscriptionSegment) -> String? {
        guard let text = segment.translatedText,
              !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return nil }
        return text
    }
}
