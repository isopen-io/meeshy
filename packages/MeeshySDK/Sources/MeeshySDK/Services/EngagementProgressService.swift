import Foundation

/// Ma progression — badges, série, niveau — se lit à UNE adresse,
/// `GET /me/engagement` (#5670), et cette lecture est le SEUL point de contact
/// de l'écran « Progression » (#5698) avec la passerelle. Rien n'y est écrit :
/// `EngagementService.recordActivity` (gateway) reste l'unique producteur, la
/// notification reste le canal de livraison des paliers, cet appel ne fait que
/// RELIRE l'état courant (modèle § 9).
/// La réponse de `POST /me/meesh/mint` (#5743).
public struct APIMeeshMintResult: Codable, Sendable, Equatable {
    /// « minted » | « already-minted » | « insufficient ».
    public let status: String
    public let balance: Int?
    public let mintedLifetime: Int?
    /// La réponse ÉTENDUE du Jeu (#9378) — tous OPTIONNELS : une passerelle
    /// antérieure ne les sert pas. `number` est le numéro gravé sur la pièce,
    /// `edition` sa matière (« silver » | « gold » | « prism »), `price` ce que
    /// la frappe a coûté, `gloryGained` la Gloire créditée, `levelBefore` /
    /// `levelAfter` les niveaux de part et d'autre.
    public let number: Int?
    public let edition: MeeshEdition?
    public let price: Int?
    public let gloryGained: Int?
    public let levelBefore: Int?
    public let levelAfter: Int?

    public init(
        status: String,
        balance: Int? = nil,
        mintedLifetime: Int? = nil,
        number: Int? = nil,
        edition: MeeshEdition? = nil,
        price: Int? = nil,
        gloryGained: Int? = nil,
        levelBefore: Int? = nil,
        levelAfter: Int? = nil
    ) {
        self.status = status
        self.balance = balance
        self.mintedLifetime = mintedLifetime
        self.number = number
        self.edition = edition
        self.price = price
        self.gloryGained = gloryGained
        self.levelBefore = levelBefore
        self.levelAfter = levelAfter
    }

    /// Une matière ajoutée par le serveur avant la mise à jour de l'app ne doit
    /// pas faire échouer le décodage d'une frappe DÉJÀ faite (la pièce est
    /// frappée, le solde débité) : elle se lit `nil`, la pièce reste en argent.
    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        status = try container.decode(String.self, forKey: .status)
        balance = try container.decodeIfPresent(Int.self, forKey: .balance)
        mintedLifetime = try container.decodeIfPresent(Int.self, forKey: .mintedLifetime)
        number = try container.decodeIfPresent(Int.self, forKey: .number)
        edition = (try? container.decodeIfPresent(MeeshEdition.self, forKey: .edition)) ?? nil
        price = try container.decodeIfPresent(Int.self, forKey: .price)
        gloryGained = try container.decodeIfPresent(Int.self, forKey: .gloryGained)
        levelBefore = try container.decodeIfPresent(Int.self, forKey: .levelBefore)
        levelAfter = try container.decodeIfPresent(Int.self, forKey: .levelAfter)
    }

    private enum CodingKeys: String, CodingKey {
        case status, balance, mintedLifetime, number, edition, price, gloryGained, levelBefore, levelAfter
    }
}

public protocol EngagementProgressProviding: Sendable {
    func fetchProgress() async throws -> APIEngagementProgress

    /// Frappe une Meesh. `requestId` porte l'IDEMPOTENCE : il est généré une
    /// fois par INTENTION de frappe, jamais par requête — sinon un retry
    /// deviendrait une seconde frappe, ce que cet identifiant empêche.
    func mintMeesh(requestId: String) async throws -> APIMeeshMintResult
}

public final class EngagementProgressService: EngagementProgressProviding, @unchecked Sendable {
    public static let shared = EngagementProgressService()
    private let api: APIClientProviding

    init(api: APIClientProviding = APIClient.shared) {
        self.api = api
    }

    public func fetchProgress() async throws -> APIEngagementProgress {
        let response: APIResponse<APIEngagementProgress> = try await api.request(MeEndpoint.engagement)
        return response.data
    }

    public func mintMeesh(requestId: String) async throws -> APIMeeshMintResult {
        // `post` encode le corps et pose la méthode : `request` prend une `Data`
        // déjà sérialisée, ce qui obligerait à refaire ici ce que le client sait
        // faire.
        let response: APIResponse<APIMeeshMintResult> = try await api.post(
            MeEndpoint.meeshMint,
            body: MintRequest(requestId: requestId)
        )
        return response.data
    }

    /// Le corps de la frappe — un type nommé plutôt qu'un dictionnaire : c'est
    /// lui qui fige la forme du contrat, et un `[String: String]` la laisserait
    /// dériver sans qu'aucun compilateur ne le remarque.
    private struct MintRequest: Encodable {
        let requestId: String
    }
}
