import Foundation

/// Ce qu'un refus 4xx de la passerelle DIT, au-delà de sa phrase.
///
/// L'enveloppe d'erreur porte, à sa RACINE, un `code` machine et — pour les
/// refus qui visent un champ — le `field` concerné, plus les appoints propres au
/// code (`suggestions` d'un pseudo pris, `violations` d'une validation). Le
/// transport ne gardait que `message ?? error` : un écran de formulaire pouvait
/// afficher la phrase, jamais la POSER sous le bon champ, faute de savoir lequel.
///
/// Elle n'est levée que par les adresses qui DÉCLARENT servir des refus typés
/// (`MeeshyEndpoint.rejectionPolicy == .structured`). Partout ailleurs le
/// transport lève `MeeshyError.server(statusCode:message:)` comme avant — c'est
/// ce qui rend ce type additif : aucun site existant ne change de forme d'erreur.
public struct APIRejection: Error, Sendable, Equatable {
    /// Une erreur PAR CHAMP, telle que `sendError(..., { violations })` la sert.
    public struct Violation: Sendable, Equatable, Decodable {
        public let path: String
        public let message: String

        public init(path: String, message: String) {
            self.path = path
            self.message = message
        }
    }

    public let statusCode: Int
    /// Le code machine (`VALIDATION_ERROR`, `EMAIL_TAKEN`, `PHONE_INVALID`,
    /// `USERNAME_TAKEN`…). `nil` quand la route n'en a pas posé.
    public let code: String?
    /// Le champ visé par le refus, quand le code en vise un.
    public let field: String?
    /// La phrase destinée à l'utilisateur — jamais vide : à défaut de `message`
    /// et d'`error`, le transport y met son propre libellé.
    public let message: String
    /// Remplacements proposés (`USERNAME_TAKEN`).
    public let suggestions: [String]
    /// Le détail par champ d'un `VALIDATION_ERROR`.
    public let violations: [Violation]

    public init(
        statusCode: Int,
        code: String? = nil,
        field: String? = nil,
        message: String,
        suggestions: [String] = [],
        violations: [Violation] = []
    ) {
        self.statusCode = statusCode
        self.code = code
        self.field = field
        self.message = message
        self.suggestions = suggestions
        self.violations = violations
    }

    /// La phrase à poser SOUS `field`, en préférant la violation qui le nomme.
    ///
    /// Un `VALIDATION_ERROR` ne pose pas de `field` à la racine : il énumère ses
    /// violations, et c'est `path` qui désigne le champ. Sans cette lecture, un
    /// refus de validation s'afficherait en bandeau global alors qu'il vise très
    /// précisément une saisie.
    public func message(forField field: String) -> String? {
        if let violation = violations.first(where: { $0.path == field }) {
            return violation.message
        }
        guard self.field == field else { return nil }
        return message
    }

    /// Les champs que ce refus vise — racine et violations réunies, dédupliquées
    /// en préservant l'ordre de lecture.
    public var affectedFields: [String] {
        var seen: Set<String> = []
        var ordered: [String] = []
        for candidate in ([field].compactMap { $0 } + violations.map(\.path)) where !seen.contains(candidate) {
            seen.insert(candidate)
            ordered.append(candidate)
        }
        return ordered
    }
}

// MARK: - Décodage de l'enveloppe

/// L'enveloppe d'erreur de la passerelle, telle que `sendError` la compose :
/// `{ success, error, message, code, violations?, …details }` — `code`, `field`
/// et les appoints à la RACINE, jamais imbriqués.
struct APIRejectionEnvelope: Decodable {
    let error: String?
    let message: String?
    let code: String?
    let field: String?
    let suggestions: [String]?
    let violations: [APIRejection.Violation]?

    func rejection(statusCode: Int, fallbackMessage: String) -> APIRejection {
        APIRejection(
            statusCode: statusCode,
            code: code,
            field: field,
            message: message ?? error ?? fallbackMessage,
            suggestions: suggestions ?? [],
            violations: violations ?? []
        )
    }
}
