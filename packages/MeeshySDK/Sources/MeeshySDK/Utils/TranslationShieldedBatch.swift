import Foundation

// MARK: - Un lot traduit sans qu'un moteur touche aux identités (#14333)
//
// Le déroulé de `TranslatorEngine.translate_text` / `_keeping_placeholders`
// (translator, #14327), sans moteur : l'appelant donne `requests` à son moteur,
// remet ce qu'il a rendu à `settle`, puis — s'il en reste — fait de même avec
// `retry`. Aucune fermeture : le moteur reste chez l'appelant.
//
// 1. chaque texte est masqué ; un texte sans rien à traduire (une adresse seule)
//    est servi tel quel, sans passer par le moteur ;
// 2. une sortie qui porte chaque marqueur est rendue avec ses entités ;
// 3. une sortie qui en a perdu ou altéré un repart en morceaux : seul le texte
//    libre ENTRE les marqueurs est traduit, chaque entité restant à sa place ;
// 4. si même ce repli ne rend pas chaque marqueur, ou si un morceau manque, le
//    texte n'est PAS servi : l'appelant retombe sur l'original (ou le rang
//    suivant du prisme), jamais sur une phrase qui a perdu un nom ou un lien.

public struct TranslationShieldedPiece: Equatable, Sendable {
    public let id: String
    public let text: String

    public init(id: String, text: String) {
        self.id = id
        self.text = text
    }
}

public struct TranslationShieldedBatch: Sendable {

    public struct Settlement: Sendable {
        /// Les textes servis, par identifiant de la demande.
        public let served: [String: String]
        /// Les morceaux à redonner au moteur ; `nil` s'il n'y a rien à reprendre.
        public let retry: Retry?
    }

    public struct Retry: Sendable {
        public let requests: [TranslationShieldedPiece]
        fileprivate let shields: [String: Shield]
        fileprivate let parts: [String: [Part]]

        public func settle(_ translated: [String: String]) -> [String: String] {
            parts.reduce(into: [:]) { served, entry in
                guard let shield = shields[entry.key] else { return }
                let pieces = entry.value.map { $0.rendered(with: translated) }
                guard pieces.allSatisfy({ $0 != nil }) else { return }
                let reassembled = pieces.compactMap { $0 }.joined()
                guard TranslationProtectedEntities.placeholdersKept(masked: shield.masked.text, translated: reassembled)
                else { return }
                served[entry.key] = TranslationProtectedEntities.restore(reassembled, entities: shield.masked.entities)
            }
        }
    }

    /// Ce que l'appelant donne à son moteur : les textes MASQUÉS.
    public let requests: [TranslationShieldedPiece]
    private let shields: [String: Shield]
    private let untouched: [String: String]

    public init(_ texts: [TranslationShieldedPiece]) {
        let masked = texts.map { Shield(original: $0.text, masked: TranslationProtectedEntities.protect($0.text), id: $0.id) }
        let translatable = masked.filter { TranslationProtectedEntities.hasTranslatableText($0.masked.text) }
        requests = translatable.map { TranslationShieldedPiece(id: $0.id, text: $0.masked.text) }
        shields = Dictionary(translatable.map { ($0.id, $0) }, uniquingKeysWith: { first, _ in first })
        untouched = Dictionary(
            masked.filter { !TranslationProtectedEntities.hasTranslatableText($0.masked.text) }.map { ($0.id, $0.original) },
            uniquingKeysWith: { first, _ in first }
        )
    }

    /// `translated` : ce que le moteur a rendu pour `requests`, par identifiant.
    /// Un texte que le moteur n'a pas rendu n'est ni servi, ni repris.
    public func settle(_ translated: [String: String]) -> Settlement {
        var served = untouched
        var lost: [String: Shield] = [:]
        for request in requests {
            guard let shield = shields[request.id], let output = translated[request.id],
                  !output.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { continue }
            if TranslationProtectedEntities.placeholdersKept(masked: shield.masked.text, translated: output) {
                served[request.id] = TranslationProtectedEntities.restore(output, entities: shield.masked.entities)
            } else {
                lost[request.id] = shield
            }
        }
        return Settlement(served: served, retry: Self.retry(for: lost))
    }

    private static func retry(for lost: [String: Shield]) -> Retry? {
        guard !lost.isEmpty else { return nil }
        let parts = lost.mapValues { shield in
            TranslationProtectedEntities.splitOnPlaceholders(shield.masked.text).enumerated().map { index, part in
                Part(text: part, pieceId: "\(shield.id)\u{1F}\(index)")
            }
        }
        let requests = parts.keys.sorted().flatMap { id in
            (parts[id] ?? []).compactMap { $0.request }
        }
        return Retry(requests: requests, shields: lost, parts: parts)
    }
}

private struct Shield: Sendable {
    let original: String
    let masked: TranslationProtectedEntities.Masked
    let id: String
}

/// Un morceau du texte masqué : un marqueur ou du texte sans lettre reste tel
/// quel ; du texte libre se traduit sans ses blancs de bord, qui sont rendus.
private struct Part: Sendable {
    let text: String
    let pieceId: String

    private var isFree: Bool {
        !TranslationProtectedEntities.isPlaceholder(text) && TranslationProtectedEntities.hasTranslatableText(text)
    }

    private var core: String { text.trimmingCharacters(in: .whitespacesAndNewlines) }

    var request: TranslationShieldedPiece? {
        isFree ? TranslationShieldedPiece(id: pieceId, text: core) : nil
    }

    func rendered(with translated: [String: String]) -> String? {
        guard isFree else { return text }
        guard let output = translated[pieceId] else { return nil }
        let lead = text.prefix { $0.isWhitespace || $0.isNewline }
        let trail = String(text.reversed().prefix { $0.isWhitespace || $0.isNewline }.reversed())
        return lead + output.trimmingCharacters(in: .whitespacesAndNewlines) + trail
    }
}
