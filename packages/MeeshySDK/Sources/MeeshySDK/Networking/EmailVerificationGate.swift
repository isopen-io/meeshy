import Foundation
import os

/// Pourquoi une action attend une adresse prouvée (#8365) — la vue de
/// validation le DIT (« Pour publier, validez votre adresse »).
public enum EmailGateReason: String, Sendable, Identifiable {
    case publish
    case invite
    case link

    public var id: String { rawValue }
}

/// Celui qui sait si l'adresse du compte courant est prouvée, et qui sait la
/// faire prouver. Le SDK n'en connaît que ce contrat : la vue, le moment où
/// elle se présente et ce qu'elle dit restent l'affaire de l'app.
@MainActor
public protocol EmailVerificationGating: AnyObject, Sendable {
    /// L'adresse est CONNUE non prouvée — la validation s'ouvre avant l'envoi.
    func emailKnownUnproven() async -> Bool
    /// Présente la validation ; `true` quand le code est validé, `false` quand
    /// le lecteur la ferme (ou quand rien ne peut la présenter).
    func verifyEmail(for reason: EmailGateReason) async -> Bool
}

/// **UN REFUS `EMAIL_NOT_VERIFIED` MÈNE À LA VALIDATION, PUIS L'ACTION REPART**
/// (#8365). La garde serveur de #6437 reste en place
/// (`EMAIL_VERIFICATION_GATED_ROUTES`, `services/gateway/src/middleware/auth.ts`) :
/// `POST /posts`, `/posts/from-attachment`, `/invitations/email`, `/links`,
/// `/conversations/:id/new-link` exigent une adresse prouvée.
///
/// `APIClient` est le SEUL site par lequel ces cinq routes passent : c'est donc
/// là — une fois, pour tous les écrans et toutes les files (story, outbox,
/// liens) — que le refus ouvre la validation puis REJOUE la requête. Même
/// corps : le brouillon n'est jamais perdu, et l'appelant reçoit la réponse de
/// la requête rejouée.
///
/// Prévenir plutôt que guérir : quand l'adresse est connue non prouvée, la
/// validation s'ouvre AVANT l'envoi ; fermée, le refus est rendu sans
/// aller-retour. Une STORY n'est jamais retenue d'avance : la première est
/// permise sans adresse prouvée (#7907) — seul le serveur sait si c'est la
/// première, donc seul son refus ouvre la validation.
///
/// Miroir web : `apps/web/src/lib/activation/email-gated-transport.ts`.
public enum EmailVerificationGate {
    public static let refusalCode = "EMAIL_NOT_VERIFIED"

    private static let registry = OSAllocatedUnfairLock<(any EmailVerificationGating)?>(initialState: nil)

    /// Le gardien de l'app — posé par l'hôte de la vue de validation. `nil` :
    /// aucune vue ne peut se présenter, le refus passe tel quel.
    public static var current: (any EmailVerificationGating)? {
        get { registry.withLock { $0 } }
        set { registry.withLock { $0 = newValue } }
    }

    /// Les routes gardées, lues dans le CATALOGUE — jamais recopiées en
    /// littéral (`ApiPathLiteralGuardTests`).
    private static let guardedRoutes: [(path: String, reason: EmailGateReason)] = [
        (PostsEndpoint.root.path, .publish),
        (PostsEndpoint.fromAttachment.path, .publish),
        (InvitationsEndpoint.email.path, .invite),
        (LinksEndpoint.root.path, .link),
    ]

    /// Le préfixe d'API du catalogue (`/api/v1`), déduit d'une de ses routes.
    private static let apiPrefix: String = {
        let root = PostsEndpoint.root.path
        return root.lastIndex(of: "/").map { String(root[..<$0]) } ?? ""
    }()

    /// `…/conversations/<id>/new-link` : le préfixe et le suffixe autour de
    /// l'identifiant, lus dans le catalogue.
    private static let newLinkShape: (prefix: String, suffix: String) = {
        let marker = "\u{1}"
        let parts = ConversationsEndpoint.byIdNewLink(id: marker).path.components(separatedBy: marker)
        return (parts.first ?? "", parts.last ?? "")
    }()

    /// La raison d'une requête gardée, `nil` pour toute autre. Le chemin peut
    /// être complet (`/api/v1/posts`) ou relatif au préfixe d'API (`/posts`,
    /// un chemin persisté de la file hors-ligne).
    public static func reason(method: String, path: String) -> EmailGateReason? {
        guard method.uppercased() == "POST" else { return nil }
        let route = routePath(path)
        if let hit = guardedRoutes.first(where: { $0.path == route }) { return hit.reason }
        let (prefix, suffix) = newLinkShape
        guard route.hasPrefix(prefix), route.hasSuffix(suffix), route.count > prefix.count + suffix.count else { return nil }
        let id = route.dropFirst(prefix.count).dropLast(suffix.count)
        return id.contains("/") ? nil : .link
    }

    /// Le corps demande une STORY — jamais retenue d'avance (#7907).
    public static func isStory(body: Data?) -> Bool {
        guard let body,
              let object = try? JSONSerialization.jsonObject(with: body) as? [String: Any] else { return false }
        return object["type"] as? String == "STORY"
    }

    /// Le refus local rendu quand le lecteur ferme la validation AVANT l'envoi :
    /// la même forme qu'un 403 de la passerelle, sans aller-retour.
    public static func localRefusal() -> MeeshyError {
        let body = Data(#"{"success":false,"error":"Email verification required","code":"EMAIL_NOT_VERIFIED"}"#.utf8)
        return .forbidden(reason: "Email verification required", body: body)
    }

    public static func isRefusal(_ error: Error) -> Bool {
        StoryPublishRetryPolicy.rejectionCode(error) == refusalCode
    }

    /// La règle, sans réseau : `perform` est la requête, rejouable telle quelle.
    public static func run<T>(
        method: String,
        path: String,
        body: Data?,
        gate: (any EmailVerificationGating)?,
        perform: () async throws -> T
    ) async throws -> T {
        guard let gate, let reason = reason(method: method, path: path) else { return try await perform() }
        if !isStory(body: body), await gate.emailKnownUnproven(), !(await gate.verifyEmail(for: reason)) {
            throw localRefusal()
        }
        do {
            return try await perform()
        } catch where isRefusal(error) {
            guard await gate.verifyEmail(for: reason) else { throw error }
            return try await perform()
        }
    }

    private static func routePath(_ path: String) -> String {
        let withoutQuery = path.split(separator: "?", maxSplits: 1).first.map(String.init) ?? path
        let absolute = withoutQuery.hasPrefix("http") ? (URLComponents(string: withoutQuery)?.path ?? withoutQuery) : withoutQuery
        return absolute.hasPrefix(apiPrefix + "/") ? absolute : apiPrefix + absolute
    }
}

extension APIClient {
    /// Toute requête passe par la garde de l'e-mail (#8365) — seules les cinq
    /// routes gardées y trouvent quelque chose à faire.
    func requestWithHeaders<T: Decodable>(
        resolved: ResolvedEndpoint,
        method: String,
        body: Data?,
        queryItems: [URLQueryItem]?,
        headers: [String: String]?
    ) async throws -> T {
        try await EmailVerificationGate.run(
            method: method,
            path: resolved.logLabel,
            body: body,
            gate: EmailVerificationGate.current
        ) {
            try await performRequestWithHeaders(
                resolved: resolved, method: method, body: body, queryItems: queryItems, headers: headers
            )
        }
    }
}
