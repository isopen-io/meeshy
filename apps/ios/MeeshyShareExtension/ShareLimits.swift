import Foundation

/// Les plafonds du partage, et RIEN d'autre : aucune E/S, aucun état.
///
/// Ils ne sont pas des préférences de confort. Le cap produit par message est
/// bien 199 (`packages/shared/types/attachment.ts:416`), mais le rate limiting
/// le rend inatteignable depuis un partage : le seau global est de 300
/// requêtes/minute PAR IP et Fastify tourne sans `trustProxy` derrière Traefik
/// (`middleware/rate-limiter.ts:69-84`) — c'est donc un seau PLATEFORME, partagé
/// par tous les utilisateurs d'un même réseau. Chaque fichier coûte une création
/// TUS plus autant de PATCH que de tranches de 10 Mo. Le seau message, lui, est
/// de 20/minute/utilisateur (`rate-limiter.ts:20-39`) — d'où les 10 cibles.
nonisolated enum ShareLimits {

    static let maxFiles = 20
    static let maxTargets = 10

    /// 500 Mio. Au-delà, la copie App Group elle-même devient un risque de
    /// disque plein sur un appareil chargé — bien avant que le réseau ne soit
    /// en cause.
    static let maxTotalBytes = 524_288_000

    /// 128 Mio exigés AU-DELÀ des octets à copier. Sous cette marge, iOS
    /// commence à purger des caches système et une copie longue peut se
    /// retrouver tronquée en cours de route.
    static let freeSpaceMarginBytes = 134_217_728

    /// Décocher une cible déjà sélectionnée ne consomme aucun budget : la
    /// refuser au plafond enfermerait l'utilisateur dans une sélection qu'il
    /// ne pourrait plus défaire.
    static func canSelectMore(selectedCount: Int, isAlreadySelected: Bool) -> Bool {
        isAlreadySelected || selectedCount < maxTargets
    }

    static func fitsFileCount(_ count: Int) -> Bool { count <= maxFiles }

    static func fitsByteBudget(_ totalBytes: Int) -> Bool { totalBytes <= maxTotalBytes }
}
