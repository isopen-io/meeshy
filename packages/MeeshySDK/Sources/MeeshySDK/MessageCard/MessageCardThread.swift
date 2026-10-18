import Foundation

/// Une entrée d'un fil de commentaires : son texte (« Auteur : texte ») et son
/// niveau d'imbrication — 0 pour la racine, 1 pour une réponse, etc.
public struct MessageCardThreadLine: Equatable, Sendable {
    public let text: String
    public let level: Int

    public init(text: String, level: Int) {
        self.text = text
        self.level = min(MessageCardThread.maxLevel, max(0, level))
    }
}

/// **L'IMBRICATION D'UN FIL SUR LA CARTE** (#10915) — LOIS PURES, miroir de
/// `apps/web/src/lib/export/message-card-thread.ts`.
///
/// Une réponse se lit RETIRÉE sous sa racine : chaque niveau décale le texte de
/// `indent`, et une ligne de SÉPARATION précède chaque entrée de niveau ≥ 1.
/// Cette séparation est celle que le template configure déjà
/// (`MessageCardTemplateID.link` : orbite, filet, guillemets, flèche, fil,
/// bulles, silence) — pas de barre propre au fil. Elle est dessinée au retrait
/// du niveau, sur `separatorWidth(level:)`, dans une ligne de texte vide qui
/// donne aussi l'air entre deux entrées. Au-delà de `maxLevel` niveaux on ne
/// creuse plus. Le texte d'un niveau est coupé dans la largeur qui RESTE
/// (`minimumWidth` au moins).
public enum MessageCardThread {

    public static let indent: Double = 44
    public static let maxLevel: Int = 3
    public static let minimumWidth: Double = 240
    /// La longueur de la séparation d'une entrée de niveau 1 ; elle décroît d'un `indent` par niveau.
    public static let separatorLength: Double = 160

    /// Une ligne peinte : son texte, son niveau, et si elle porte la séparation (texte vide).
    public struct Row: Equatable, Sendable {
        public let text: String
        public let level: Int
        public let separator: Bool
    }

    /// Les lignes peintes d'un fil : chaque entrée coupée dans la largeur qui reste à son niveau,
    /// précédée d'une ligne de séparation dès le niveau 1.
    public static func rows(of lines: [MessageCardThreadLine], width: Double, font: MessageCardFont, measure: MessageCardMeasure) -> [Row] {
        lines.flatMap { line -> [Row] in
            let room = max(minimumWidth, width - Double(line.level) * indent)
            let body = MessageCardText.wrap(line.text, maxWidth: room, font: font, measure: measure).map { Row(text: $0, level: line.level, separator: false) }
            return line.level > 0 ? [Row(text: "", level: line.level, separator: true)] + body : body
        }
    }

    /// Le retrait d'un niveau, du bord de départ du bloc.
    public static func shift(level: Int) -> Double {
        Double(min(maxLevel, max(0, level))) * indent
    }

    /// La longueur de la séparation d'un niveau : `separatorLength − (niveau − 1) × indent`, au moins `indent`.
    public static func separatorWidth(level: Int) -> Double {
        max(indent, separatorLength - Double(max(1, level) - 1) * indent)
    }
}
