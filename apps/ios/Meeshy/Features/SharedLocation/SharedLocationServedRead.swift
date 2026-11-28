import Foundation
import MeeshySDK

/// La relecture du partage servi a TROIS issues (#19928) : une réponse, une passerelle d'avant `GET /locations/mine`
/// (`nil`), ou une panne (toute autre erreur, relevée). Seules les deux premières lèvent l'attente d'un appareil
/// relancé : réduire la panne à « rien » le laissait publier toute la session à côté de l'appareil qui a repris.
/// Une passerelle d'avant se reconnaît au « route inconnue » de Fastify (`Route GET:… not found`) : un 404 d'un
/// intermédiaire (Traefik pendant un redéploiement, portail captif, proxy) est une panne (#20029).
enum SharedLocationServedRead {
    static func answer(_ read: () async throws -> SharedLocationOwnSnapshot) async throws -> SharedLocationOwnSnapshot? {
        do {
            return try await read()
        } catch MeeshyError.server(404, let served) where isUnknownRoute(served) {
            return nil
        } catch APIError.serverError(404, let served?) where isUnknownRoute(served) {
            return nil
        }
    }

    private static func isUnknownRoute(_ served: String) -> Bool {
        served.hasPrefix("Route GET:") && served.hasSuffix("not found")
    }
}
