import Foundation

/// Le budget d'ENVOI de l'extension — ce que la feuille tente elle-même avant
/// de remettre la fiche à l'app. Aucune E/S, aucun état.
///
/// Les plafonds PRODUIT (20 fichiers, 500 Mo, 10 destinataires, D10) ne sont
/// plus ici : ils sont à `MeeshySDK.ShareLimits`, miroir de
/// `packages/shared/utils/share-limits.ts`, et c'est le plan du partage
/// (`SharePlanner`) qui les applique à l'écran unique (#10947). Un second
/// `ShareLimits` local masquait celui du SDK dans cette cible et dans le bundle
/// de tests.
///
/// Ils ne sont pas des préférences de confort. Le cap produit par message est
/// bien 199 (`packages/shared/types/attachment.ts:416`), mais le rate limiting
/// le rend inatteignable depuis un partage : le seau global est de 300
/// requêtes/minute PAR IP et Fastify tourne sans `trustProxy` derrière Traefik
/// (`middleware/rate-limiter.ts:69-84`) — c'est donc un seau PLATEFORME, partagé
/// par tous les utilisateurs d'un même réseau. Chaque fichier coûte une création
/// TUS plus autant de PATCH que de tranches de 10 Mo. Le seau message, lui, est
/// de 20/minute/utilisateur (`rate-limiter.ts:20-39`) — d'où les 10 cibles.
nonisolated enum ShareUploadBudget {

    /// 128 Mio exigés AU-DELÀ des octets à copier. Sous cette marge, iOS
    /// commence à purger des caches système et une copie longue peut se
    /// retrouver tronquée en cours de route.
    static let freeSpaceMarginBytes = 134_217_728

    /// 8 Mio. Chaque fichier tient alors dans UNE tranche TUS de 10 Mio
    /// (un POST + un PATCH), le pic mémoire reste très en deçà du plafond de
    /// 120 Mo, et l'ensemble se termine en 2 à 4 s sur LTE — dans la fenêtre
    /// où la feuille de partage reste vivante. Au-delà, RIEN n'est tenté : un
    /// upload interrompu par la fermeture de la feuille laisserait des
    /// attachments orphelins jusqu'à H+24, pour un partage que l'app aurait de
    /// toute façon repris.
    static let opportunisticUploadBudgetBytes = 8_388_608

    /// Quatre fichiers au plus : au-delà, le nombre d'allers-retours devient
    /// le facteur limitant, pas le volume.
    static let opportunisticUploadMaxFiles = 4

    static func isOpportunisticUploadEligible(totalBytes: Int, fileCount: Int) -> Bool {
        fileCount > 0
            && fileCount <= opportunisticUploadMaxFiles
            && totalBytes <= opportunisticUploadBudgetBytes
    }
}
