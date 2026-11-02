import Foundation

/// Le budget d'ENVOI de l'extension — ce que la feuille tente elle-même avant
/// de remettre la fiche à l'app. Aucune E/S, aucun état.
///
/// Les plafonds PRODUIT (100 fichiers, 5 Go, 10 destinataires, D10 révisé le
/// 2026-10-25, #12974) ne sont
/// plus ici : ils sont à `MeeshySDK.ShareLimits`, miroir de
/// `packages/shared/utils/share-limits.ts`, et c'est le plan du partage
/// (`SharePlanner`) qui les applique à l'écran unique (#10947). Un second
/// `ShareLimits` local masquait celui du SDK dans cette cible et dans le bundle
/// de tests.
///
/// Ce que la passerelle borne À CÔTÉ : 199 pièces par message
/// (`MAX_ATTACHMENTS_PER_MESSAGE`), 4 Go par fichier (`UPLOAD_LIMITS`), et un
/// seau global de 300 requêtes/minute par adresse de l'APPELANT
/// (`registerGlobalRateLimiter` ; `trustProxy` est posé depuis #4137). Chaque
/// fichier coûte une création TUS plus autant de PATCH que de tranches de
/// 10 Mo : un partage de 5 Go en demande plus de 500, qu'un réseau rapide peut
/// émettre en moins d'une minute — un 429 n'est alors pas définitif, la file
/// reprend la montée depuis son point de reprise.
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
