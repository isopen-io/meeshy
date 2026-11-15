import Foundation

/// **La TÊTE amorcée de la fenêtre lointaine (#11288)** — ajout iOS à la loi
/// jumelle, qui n'en retranche rien : `primeBytes` garde ses constantes, le web
/// les lit à l'identique.
///
/// Le palier « amorcé » (N±3…N±R) ne télécharge plus le fichier entier : une
/// plage `bytes=0-<n>` lui suffit, de quoi porter l'atome `moov` et le premier
/// GOP. Le reste arrive en flux quand le réel est ÉLU (palier monté ou décode,
/// ou lecture) : le transfert qui l'élit reprend la tête là où elle s'est
/// arrêtée, dans le même fichier lisible.
///
/// La taille est celle de la jumelle, bornée par le tier de l'appareil : un
/// appareil modeste garde moins d'octets d'avance par réel, et ne voit de
/// toute façon que quatre réels de chaque côté (`radius(for:)`). Le plafond ne
/// relève jamais une amorce déjà petite (données économisées, 2G).
extension ReelPreloadWindow {

    /// En deçà, une tête ne porte plus sûrement `moov` et une première image.
    public static let minimumHeadBytes = 192 * 1_024

    static let lowTierHeadCap = 256 * 1_024
    static let midTierHeadCap = 512 * 1_024

    /// Les octets de tête à demander pour un réel du palier `tier` ; `0` hors du
    /// palier « amorcé » — les paliers proches prennent le fichier entier.
    public static func headBytes(tier: Tier, distance: Int, network: Network, device: DeviceMediaTier?) -> Int {
        guard tier == .prime else { return 0 }
        return min(primeBytes(tier: tier, distance: distance, network: network), headCap(for: device))
    }

    private static func headCap(for device: DeviceMediaTier?) -> Int {
        switch device {
        case .low: return lowTierHeadCap
        case .mid: return midTierHeadCap
        case .high, .pro, nil: return Int.max
        }
    }
}
