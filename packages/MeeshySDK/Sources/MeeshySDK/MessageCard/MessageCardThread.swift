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
/// `indent` et pose une barre verticale (`barWidth`, couleur d'accent) dans le
/// retrait de son niveau, sur toutes les lignes consécutives qui l'habitent.
/// Au-delà de `maxLevel` niveaux, on ne creuse plus (un fil de 9 niveaux ne
/// laisserait plus de colonne au texte). Le texte d'un niveau est coupé dans la
/// largeur qui RESTE (`minimumWidth` au moins).
public enum MessageCardThread {

    public static let indent: Double = 44
    public static let maxLevel: Int = 3
    public static let barWidth: Double = 5
    /// Le jeu de la barre dans son retrait, du bord du niveau précédent.
    public static let barInset: Double = 8
    public static let minimumWidth: Double = 240

    /// Une ligne peinte : son texte et son niveau.
    public struct Row: Equatable, Sendable {
        public let text: String
        public let level: Int
    }

    /// Les lignes peintes d'un fil : chaque entrée coupée dans la largeur qui reste à son niveau.
    public static func rows(of lines: [MessageCardThreadLine], width: Double, font: MessageCardFont, measure: MessageCardMeasure) -> [Row] {
        lines.flatMap { line -> [Row] in
            let room = max(minimumWidth, width - Double(line.level) * indent)
            return MessageCardText.wrap(line.text, maxWidth: room, font: font, measure: measure).map { Row(text: $0, level: line.level) }
        }
    }

    /// Une barre : le niveau qu'elle marque, et les lignes (premières et dernières, comprises) qu'elle couvre.
    public struct Segment: Equatable, Sendable {
        public let level: Int
        public let first: Int
        public let last: Int
    }

    /// Les barres d'un fil : pour chaque niveau k ≥ 1, une barre par suite de
    /// lignes consécutives dont le niveau est ≥ k.
    public static func segments(levels: [Int]) -> [Segment] {
        guard let deepest = levels.max(), deepest >= 1 else { return [] }
        return (1...min(deepest, maxLevel)).flatMap { level -> [Segment] in
            var runs: [Segment] = []
            var start: Int?
            for (index, value) in levels.enumerated() {
                if value >= level {
                    if start == nil { start = index }
                } else if let begun = start {
                    runs.append(Segment(level: level, first: begun, last: index - 1))
                    start = nil
                }
            }
            if let begun = start { runs.append(Segment(level: level, first: begun, last: levels.count - 1)) }
            return runs
        }
    }

    /// Le retrait d'un niveau, du bord de départ du bloc.
    public static func shift(level: Int) -> Double {
        Double(min(maxLevel, max(0, level))) * indent
    }

    /// Le bord de départ de la barre du niveau `level` (≥ 1), du bord de départ du bloc.
    public static func barOffset(level: Int) -> Double {
        shift(level: level - 1) + barInset
    }
}
