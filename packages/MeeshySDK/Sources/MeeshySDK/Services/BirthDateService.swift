import Foundation

// MARK: - L'âge déclaré, écrit UNE fois (#9927, #9929)
//
// `PUT /me/birth-date` pose `User.birthDate` une seule fois : une seconde
// déclaration est refusée (409), pour qu'un mineur ne se déclare pas majeur
// ensuite — une correction passe par le support. La passerelle CALCULE la
// classe d'âge à chaque lecture ; ce service ne stocke rien.

/// La classe d'âge que la passerelle déduit de la date déclarée.
public enum AgeClass: Sendable, Equatable, Decodable {
    case adult
    case minor
    /// Une classe qu'une passerelle plus récente sait nommer.
    case unknown(String)

    public init(from decoder: Decoder) throws {
        let raw = (try? decoder.singleValueContainer().decode(String.self)) ?? ""
        switch raw {
        case "adult": self = .adult
        case "minor": self = .minor
        default: self = .unknown(raw)
        }
    }
}

/// Ce que `PUT /me/birth-date` rend : la classe d'âge et ce qu'elle ferme.
public struct APIBirthDateDeclaration: Decodable, Sendable, Equatable {
    public let ageClass: AgeClass
    /// Global se lit sans s'écrire (13-17 ans).
    public let viewerWriteRestrictionGlobal: Bool

    public init(ageClass: AgeClass, viewerWriteRestrictionGlobal: Bool) {
        self.ageClass = ageClass
        self.viewerWriteRestrictionGlobal = viewerWriteRestrictionGlobal
    }

    private enum CodingKeys: String, CodingKey {
        case ageClass, viewerWriteRestrictionGlobal
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        ageClass = (try? container.decodeIfPresent(AgeClass.self, forKey: .ageClass)) ?? .unknown("")
        viewerWriteRestrictionGlobal = (try? container.decodeIfPresent(Bool.self, forKey: .viewerWriteRestrictionGlobal)) ?? false
    }
}

/// Pourquoi une déclaration n'a pas été écrite. Chaque cas appelle un geste
/// différent de l'écran : aucun ne se résume à « erreur ».
public enum BirthDateDeclarationError: Error, Sendable, Equatable {
    /// 409 `BIRTH_DATE_ALREADY_SET` — la date est déjà connue : l'étape est faite.
    case alreadySet
    /// 422 `AGE_BELOW_MINIMUM` — moins de 13 ans : Meeshy n'est pas ouvert.
    case belowMinimumAge
    /// 400 — date future, improbable ou mal formée.
    case invalidDate
    /// La passerelle ne connaît pas la route (antérieure à #9927).
    case unsupported
    /// Réseau, serveur : rien n'est dit de la date, on peut réessayer.
    case unavailable

    public static let alreadySetCode = "BIRTH_DATE_ALREADY_SET"
    public static let belowMinimumCode = "AGE_BELOW_MINIMUM"

    /// Lit un échec de transport. Le CODE prime sur le statut : c'est lui que
    /// le contrat documente.
    public static func classify(_ error: Error) -> BirthDateDeclarationError {
        guard let meeshy = error as? MeeshyError, case let .rejected(rejection) = meeshy else {
            return .unavailable
        }
        if rejection.code == alreadySetCode || rejection.statusCode == 409 { return .alreadySet }
        if rejection.code == belowMinimumCode || rejection.statusCode == 422 { return .belowMinimumAge }
        switch rejection.statusCode {
        case 404: return .unsupported
        case 400: return .invalidDate
        default: return .unavailable
        }
    }
}

public protocol BirthDateServiceProviding: Sendable {
    /// Déclare la date de naissance du compte connecté. Lève
    /// `BirthDateDeclarationError` en cas de refus.
    func setBirthDate(_ birthDate: Date) async throws -> APIBirthDateDeclaration
}

public final class BirthDateService: BirthDateServiceProviding, @unchecked Sendable {
    public static let shared = BirthDateService()
    private let api: APIClientProviding
    private let timeZone: TimeZone

    init(api: APIClientProviding = APIClient.shared, timeZone: TimeZone = .current) {
        self.api = api
        self.timeZone = timeZone
    }

    public func setBirthDate(_ birthDate: Date) async throws -> APIBirthDateDeclaration {
        let body = Body(birthDate: Self.wireDay(birthDate, timeZone: timeZone))
        do {
            let response: APIResponse<APIBirthDateDeclaration> = try await api.put(MeEndpoint.birthDate, body: body)
            return response.data
        } catch {
            throw BirthDateDeclarationError.classify(error)
        }
    }

    /// Le jour CIVIL que l'utilisateur a choisi, au format `AAAA-MM-JJ` du
    /// contrat. Lu dans le calendrier grégorien et le fuseau de l'appareil :
    /// le sélecteur montre la date dans le calendrier de l'utilisateur, mais
    /// l'instant est le même, et c'est ce jour-là qu'il a désigné.
    public static func wireDay(_ date: Date, timeZone: TimeZone = .current) -> String {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = timeZone
        let parts = calendar.dateComponents([.year, .month, .day], from: date)
        return [(parts.year ?? 0, 4), (parts.month ?? 0, 2), (parts.day ?? 0, 2)]
            .map { value, width in
                let digits = String(value)
                return String(repeating: "0", count: max(0, width - digits.count)) + digits
            }
            .joined(separator: "-")
    }

    private struct Body: Encodable {
        let birthDate: String
    }
}
