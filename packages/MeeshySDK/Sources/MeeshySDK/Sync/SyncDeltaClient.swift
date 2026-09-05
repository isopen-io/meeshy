import Foundation

// MARK: - Protocol (before implementation — iOS TDD rule)

/// LE TRANSPORT DU DELTA — la couture de test du client, et rien d'autre.
///
/// `APIClientProviding` ne rend ni statut ni en-têtes : ses verbes décodent ou
/// jettent, ce qui FOND le 304 dans les pannes — exactement le piège que le
/// critère 2 de #4172 nomme (« pas un `try?` silencieux »). Plutôt que
/// d'élargir un protocole à dix conformants pour un seul lecteur, le client
/// possède sa couture étroite : une requête part, des octets et une réponse
/// HTTP reviennent. Le conformant de production est `URLSessionSyncDeltaTransport`.
public protocol SyncDeltaTransporting: Sendable {
    func executer(_ requete: URLRequest) async throws -> (Data, HTTPURLResponse)
}

/// CE QUE LE CLIENT DEMANDE — le miroir du client web
/// (`apps/web-v3/lib/realtime/sync/delta-client.ts`), paramètre pour paramètre.
public struct SyncDeltaRequest: Sendable, Equatable {
    /// Le dernier `checkpoint` reçu, ou l'instant de la dernière ligne peinte au premier tour.
    public let since: String
    /// Le vocabulaire de `SYNC_FIELD_VOCABULARY` — `conversations` pour la liste.
    public let collections: [String]
    /// L'ObjectId d'UNE conversation — absent pour la liste, qui demande tout ce que le lecteur voit.
    public let scope: String?
    /// Le curseur global du compte. SANS LUI, LA PASSERELLE NE CALCULE AUCUN TROU
    /// (`routes/sync/index.ts` : `hasGap = seq !== undefined && …`) — l'omettre
    /// rend `hasGap` structurellement faux, jamais une économie.
    public let seq: Int?
    /// Les champs que l'appelant LIT, forme `collection.champ` (#4173, #5088) —
    /// la requête Prisma rétrécit côté passerelle, pas seulement la réponse.
    /// Vide ⇒ le défaut du serveur, la ligne entière.
    public let fields: [String]
    /// Le dernier `ETag` lu — posé en `if-none-match` pour que le 304 puisse tomber.
    public let validateur: String?
    /// L'ANCRE de pagination servie par la page précédente (`nextCursor` de la
    /// collection, #4172 seconde moitié du critère 1) — relayée VERBATIM pour
    /// que le PLEIN par `/sync` enchaîne ses pages sans rejouer la fenêtre.
    public let cursor: String?

    public init(
        since: String,
        collections: [String],
        scope: String? = nil,
        seq: Int? = nil,
        fields: [String] = [],
        validateur: String? = nil,
        cursor: String? = nil
    ) {
        self.since = since
        self.collections = collections
        self.scope = scope
        self.seq = seq
        self.fields = fields
        self.validateur = validateur
        self.cursor = cursor
    }
}

/// UNE COLLECTION DU DELTA — ajoutées, modifiées, supprimées (des identifiants).
public struct SyncDeltaCollection<Row: Decodable & Sendable>: Decodable, Sendable {
    public let added: [Row]
    public let modified: [Row]
    public let deleted: [String]

    /// L'ancre de la PAGE SUIVANTE, servie quand la fenêtre a coupé — c'est
    /// elle que la demande suivante relaie (`SyncDeltaRequest.cursor`).
    public let nextCursor: String?
    /// La fenêtre a COUPÉ cette collection (budget d'octets serveur) : la page
    /// est complète en soi mais la collection ne l'est pas.
    public let truncated: Bool

    private enum CodingKeys: String, CodingKey { case added, modified, deleted, nextCursor, truncated }

    public init(from decoder: Decoder) throws {
        let conteneur = try decoder.container(keyedBy: CodingKeys.self)
        added = try conteneur.decodeIfPresent([Row].self, forKey: .added) ?? []
        modified = try conteneur.decodeIfPresent([Row].self, forKey: .modified) ?? []
        deleted = try conteneur.decodeIfPresent([String].self, forKey: .deleted) ?? []
        nextCursor = try conteneur.decodeIfPresent(String.self, forKey: .nextCursor)
        truncated = try conteneur.decodeIfPresent(Bool.self, forKey: .truncated) ?? false
    }
}

/// LE CADRE DU DELTA — ce que `routes/sync/index.ts` rend sous `data`.
public struct SyncDelta<Row: Decodable & Sendable>: Decodable, Sendable {
    public let checkpoint: String?
    public let checkpointSeq: Int?
    public let hasGap: Bool
    public let hasMore: Bool
    public let collections: [String: SyncDeltaCollection<Row>]

    private enum CodingKeys: String, CodingKey { case checkpoint, checkpointSeq, hasGap, hasMore, collections }

    public init(from decoder: Decoder) throws {
        let conteneur = try decoder.container(keyedBy: CodingKeys.self)
        checkpoint = try conteneur.decodeIfPresent(String.self, forKey: .checkpoint)
        checkpointSeq = try conteneur.decodeIfPresent(Int.self, forKey: .checkpointSeq)
        hasGap = try conteneur.decodeIfPresent(Bool.self, forKey: .hasGap) ?? false
        hasMore = try conteneur.decodeIfPresent(Bool.self, forKey: .hasMore) ?? false
        collections = try conteneur.decodeIfPresent([String: SyncDeltaCollection<Row>].self, forKey: .collections) ?? [:]
    }
}

/// LES TROIS ISSUES D'UN APPEL — la même loi que le web, et pour la même raison.
///
/// `inchange` est le **304** : la fenêtre n'a pas bougé, le corps est vide, et
/// l'appelant ne doit RIEN avancer — ni checkpoint ni curseur. `muet` couvre le
/// reste — réseau tombé, refus, corps illisible : l'écran garde ce qu'il a.
/// Les fondre l'une dans l'autre rend le 304 indistinguable d'une panne, et
/// c'est le `try?` silencieux que le critère 2 de #4172 interdit.
public enum SyncDeltaOutcome<Row: Decodable & Sendable>: Sendable {
    case inchange
    case muet
    /// Le serveur a RÉPONDU et a DIT NON (4xx) — `code` porte son verdict
    /// (`UNSUPPORTED_COLLECTION` quand la collection n'est pas servie par ce
    /// déploiement). Distinct de `muet` parce que le critère 2 de #4172
    /// l'exige : le repli du PLEIN se déclenche sur cette condition NOMMÉE,
    /// jamais sur une panne fondue dans un silence.
    case refuse(statut: Int, code: String?)
    case delta(SyncDelta<Row>, validateur: String?)
}

/// LA CRÉANCE DE L'APPELANT, telle que la passerelle la lit : `Authorization:
/// Bearer` pour un membre, `x-session-token` pour un invité (`allowAnonymous`
/// sur `/sync` — rien à construire côté serveur pour lui).
public enum SyncDeltaCredential: Sendable, Equatable {
    case membre(jeton: String)
    case invite(session: String)
}

public protocol SyncDeltaClientProviding: Sendable {
    func demandeLeDelta<Row: Decodable & Sendable>(
        _ demande: SyncDeltaRequest,
        creance: SyncDeltaCredential,
        rangeant _: Row.Type
    ) async -> SyncDeltaOutcome<Row>
}

// MARK: - Implementation

/// LE CLIENT `/sync` DU SDK (#5089, première tranche de #4172).
///
/// `SyncEndpoint` était GÉNÉRÉ et ORPHELIN : le moteur rejouait son delta à la
/// main par `GET /conversations?updatedSince=` (≈ 100 requêtes au démarrage à
/// froid d'un gros compte). Ce client est le chemin d'un seul aller-retour ;
/// son branchement dans `ConversationSyncEngine` est la tranche suivante, avec
/// son repli nommé.
///
/// L'URL part de l'ADRESSE TYPÉE (`SyncEndpoint.root.path`, #4282) — aucun
/// chemin écrit à la main — et le validateur est LU sur la réponse : pas de
/// CORS ici, l'en-tête `ETag` est lisible nativement, et c'est ce qui rend le
/// 304 atteignable pour iOS là où le navigateur ne peut pas encore le faire.
public final class SyncDeltaClient: SyncDeltaClientProviding, Sendable {
    private let baseURL: String
    private let transport: any SyncDeltaTransporting

    public init(baseURL: String, transport: any SyncDeltaTransporting = URLSessionSyncDeltaTransport()) {
        self.baseURL = baseURL
        self.transport = transport
    }

    public func demandeLeDelta<Row: Decodable & Sendable>(
        _ demande: SyncDeltaRequest,
        creance: SyncDeltaCredential,
        rangeant _: Row.Type
    ) async -> SyncDeltaOutcome<Row> {
        guard let url = urlDeSync(demande) else { return .muet }
        var requete = URLRequest(url: url)
        requete.httpMethod = "GET"
        requete.setValue("application/json", forHTTPHeaderField: "accept")
        switch creance {
        case let .membre(jeton):
            requete.setValue("Bearer \(jeton)", forHTTPHeaderField: "authorization")
        case let .invite(session):
            requete.setValue(session, forHTTPHeaderField: "x-session-token")
        }
        if let validateur = demande.validateur {
            requete.setValue(validateur, forHTTPHeaderField: "if-none-match")
        }

        guard let (octets, reponse) = try? await transport.executer(requete) else { return .muet }
        if reponse.statusCode == 304 { return .inchange }
        if (400...499).contains(reponse.statusCode) {
            let code = (try? JSONDecoder().decode(EnveloppeDeRefus.self, from: octets))?.error?.code
            return .refuse(statut: reponse.statusCode, code: code)
        }
        guard (200...299).contains(reponse.statusCode) else { return .muet }

        // LE DÉCODEUR EST CELUI DE LA MAISON (`APIClient.makeAPIPayloadDecoder`,
        // la stratégie de dates unique) : un `JSONDecoder()` nu refuse les ISO
        // du serveur dès qu'une ligne porte une `Date` — attrapé par le témoin
        // moteur (#4172 2b) sur `Row = APIConversation`, invisible tant que les
        // témoins du client rangeaient les instants dans des `String`.
        guard let enveloppe = try? APIClient.makeAPIPayloadDecoder().decode(EnveloppeDeSync<Row>.self, from: octets),
              enveloppe.success == true,
              let delta = enveloppe.data
        else { return .muet }

        return .delta(delta, validateur: reponse.value(forHTTPHeaderField: "Etag"))
    }

    /// L'URL, composée comme le client web la compose — même ordre, mêmes absences.
    private func urlDeSync(_ demande: SyncDeltaRequest) -> URL? {
        guard var composants = URLComponents(string: baseURL + SyncEndpoint.root.path) else { return nil }
        var elements: [URLQueryItem] = [
            URLQueryItem(name: "since", value: demande.since),
            URLQueryItem(name: "collections", value: demande.collections.joined(separator: ",")),
        ]
        if let scope = demande.scope { elements.append(URLQueryItem(name: "scope", value: scope)) }
        if let seq = demande.seq { elements.append(URLQueryItem(name: "seq", value: String(seq))) }
        if let cursor = demande.cursor { elements.append(URLQueryItem(name: "cursor", value: cursor)) }
        if !demande.fields.isEmpty {
            elements.append(URLQueryItem(name: "fields", value: demande.fields.joined(separator: ",")))
        }
        composants.queryItems = elements
        return composants.url
    }
}

private struct EnveloppeDeSync<Row: Decodable & Sendable>: Decodable {
    let success: Bool?
    let data: SyncDelta<Row>?
}

private struct EnveloppeDeRefus: Decodable {
    struct Erreur: Decodable { let code: String? }
    let error: Erreur?
}

/// LE TRANSPORT DE PRODUCTION — une session SANS cache : `/sync` répond
/// `Cache-Control: no-store`, et c'est le client qui porte la revalidation
/// (`if-none-match` ci-dessus), jamais `URLCache`.
public struct URLSessionSyncDeltaTransport: SyncDeltaTransporting {
    private let session: URLSession

    public init() {
        let config = URLSessionConfiguration.ephemeral
        config.urlCache = nil
        config.timeoutIntervalForRequest = 15
        self.session = URLSession(configuration: config)
    }

    public func executer(_ requete: URLRequest) async throws -> (Data, HTTPURLResponse) {
        let (octets, reponse) = try await session.data(for: requete)
        guard let http = reponse as? HTTPURLResponse else {
            throw URLError(.badServerResponse)
        }
        return (octets, http)
    }
}
