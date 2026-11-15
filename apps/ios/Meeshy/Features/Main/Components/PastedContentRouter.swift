import Foundation
import UniformTypeIdentifiers
import MeeshySDK

/// Ce que le presse-papier remet au champ du composer, une fois classé.
nonisolated enum PastedContent: Equatable, Sendable {
    case text(String)
    case media(ComposerIngestPipeline)
}

/// La nature d'un élément collé, lue sur ses seuls types — sans le charger.
nonisolated enum PastedKind: Equatable, Sendable {
    case text
    case media(ComposerIngestPipeline)
}

/// Ce que le composer fait de ce qu'on colle (#9037).
nonisolated enum PastedContentDecision: Equatable, Sendable {
    /// Le texte tient dans la limite d'un message : il entre dans le champ.
    case insertText
    /// Le texte ferait dépasser la limite : il part en document `.txt`, le champ reste intact.
    case attachText
    /// Une image, une vidéo, un son ou un document : l'OBJET devient pièce jointe.
    case attachMedia(ComposerIngestPipeline)
}

/// **Ce qu'on colle part toujours** (#9037) — la règle, pure : aucun UIKit,
/// aucun disque. L'intercepteur du champ (`ComposerPasteInterceptor`) et le
/// filet du changement de texte (`handleClipboardCheck`) la lisent tous deux.
nonisolated enum PastedContentRouter {

    /// La longueur telle que JavaScript la mesure (`content.length`, UTF-16).
    static func length(_ text: String) -> Int { text.utf16.count }

    /// - Parameters:
    ///   - currentLength: la longueur actuelle du champ, en unités UTF-16.
    ///   - replacedLength: la sélection que le collage remplace.
    ///   - limit: la limite d'un message (`MessageLimits.maxMessageLength`).
    static func decide(_ content: PastedContent, currentLength: Int, replacedLength: Int = 0, limit: Int) -> PastedContentDecision {
        switch content {
        case .media(let pipeline):
            return .attachMedia(pipeline)
        case .text(let text):
            let resulting = max(0, currentLength - replacedLength) + length(text)
            return resulting > limit ? .attachText : .insertText
        }
    }

    /// Le classement d'un élément collé. Un média n'est un média que s'il ne
    /// porte pas aussi du texte brut : un passage de Notes illustré se colle
    /// comme du texte ; une image copiée depuis Safari, qui porte aussi son
    /// adresse, se colle comme l'image. Un fichier copié depuis Fichiers (son
    /// URL `file://`, ou un document) part en pièce jointe — jamais en chemin.
    static func classify(_ types: [UTType]) -> PastedKind {
        let conforms: (UTType) -> Bool = { family in types.contains { $0.conforms(to: family) } }
        if conforms(.plainText) { return .text }
        if conforms(.image) { return .media(.image) }
        if conforms(.movie) || conforms(.video) { return .media(.video) }
        if conforms(.audio) { return .media(.audio) }
        if conforms(.fileURL) { return .media(.file) }
        if conforms(.url) || conforms(.text) { return .text }
        if conforms(.data) || conforms(.content) { return .media(.file) }
        return .text
    }

    /// Ce qu'une écriture du champ a INSÉRÉ d'un seul coup, et le texte d'avant
    /// à restaurer — `nil` quand rien n'a été inséré (frappe nulle, effacement).
    static func insertion(from old: String, to new: String) -> (inserted: String, restored: String)? {
        guard new.count > old.count else { return nil }
        let prefix = zip(old, new).prefix { $0 == $1 }.count
        let maxSuffix = old.count - prefix
        let suffix = zip(old.reversed(), new.reversed()).prefix { $0 == $1 }.prefix(maxSuffix).count
        let inserted = String(new.dropFirst(prefix).dropLast(suffix))
        guard !inserted.isEmpty, new.count - inserted.count == old.count else { return nil }
        return (inserted, old)
    }
}

/// Le document `.txt` qui porte un texte trop long pour un message (#9037).
nonisolated enum PastedTextFile {

    /// `texte-colle-AAAAMMJJ-HHMMSS.txt` — lisible dans une conversation, sans rien du contenu.
    static func fileName(at date: Date, calendar: Calendar = .current) -> String {
        let parts = calendar.dateComponents([.year, .month, .day, .hour, .minute, .second], from: date)
        let pad: (Int?) -> String = { String(format: "%02d", $0 ?? 0) }
        return "texte-colle-\(parts.year ?? 0)\(pad(parts.month))\(pad(parts.day))-\(pad(parts.hour))\(pad(parts.minute))\(pad(parts.second)).txt"
    }

    /// Écrit le texte en UTF-8 dans un dossier à soi (deux collages dans la même
    /// seconde ne s'écrasent pas) et le rend comme un dépôt : l'appelant devient
    /// propriétaire du fichier, comme de tout `ComposerIngest.file`.
    static func write(_ text: String, at date: Date = Date(), in directory: URL = FileManager.default.temporaryDirectory) throws -> ComposerIngest {
        let folder = directory.appendingPathComponent("paste_\(UUID().uuidString)", isDirectory: true)
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        let name = fileName(at: date)
        let url = folder.appendingPathComponent(name)
        try Data(text.utf8).write(to: url, options: .atomic)
        return .file(url: url, name: name, mime: "text/plain")
    }
}
