import SwiftUI

/// **Où la pastille de synchronisation se pose : sous la zone sûre, nettement
/// décollée du capteur** (#10371, retour porteur 2026-10-12).
///
/// > « Il est trop proche de la Dynamic Island ! Et il n'est pas destiné à être
/// > là-bas ! Il faut redescendre d'environ 2 fois la hauteur de ce composant. »
///
/// **Cette règle SUPPLANTE celle de #9680** (2026-10-08), qui posait la pastille
/// « dans la bande de la barre d'état » — juste sous l'îlot, à cheval sur le haut
/// de la zone sûre (`safeAreaTop − 11 + 1`), au centre de la barre d'état sur
/// iPad. Collée au capteur, elle se lisait comme un élément du SYSTÈME, ce
/// qu'elle n'est pas : c'est un état de l'APP.
///
/// La pose est désormais UNE règle pour tous les appareils — iPhone à îlot, à
/// encoche, à bouton d'accueil, iPad : le haut de la pastille se place à
/// `seatBelowSafeArea` sous le haut de la zone sûre. C'est l'ancienne pose sous
/// l'îlot descendue de `descent` (2 × les 22 pt de l'ancienne capsule). Plus
/// bas, elle peut passer sur un titre ou un chrome : c'est un calque
/// TRANSITOIRE, centré, au-dessus du contenu, accepté comme tel par le porteur.
///
/// Fonction PURE : c'est la DÉCISION qui se teste (`SyncPillPlacementTests`) ;
/// le rendu n'a qu'un point de montage, `inSyncPillBand()`.
nonisolated enum SyncPillPlacement {

    /// Hauteur de la capsule AVANT #10371 — l'unité dans laquelle le porteur a
    /// exprimé la descente.
    static let formerPillHeight: CGFloat = 22

    /// Écart, sous un îlot, entre le bas du capteur et le haut de la zone sûre
    /// (bas à 48 pt, zone sûre à 59 pt) : l'ancienne pose s'y logeait.
    static let sensorToSafeAreaGap: CGFloat = 11

    /// Air que l'ancienne pose laissait sous le capteur.
    static let formerClearance: CGFloat = 1

    /// « Redescendre d'environ 2 fois la hauteur de ce composant. »
    static let descent: CGFloat = 2 * formerPillHeight

    /// Où le haut de la pastille se pose, sous le haut de la zone sûre : l'ancienne
    /// pose sous l'îlot (`− 11 + 1`), descendue de `descent` — 34 pt.
    static let seatBelowSafeArea: CGFloat = formerClearance - sensorToSafeAreaGap + descent

    /// **L'encart haut de l'ÉCRAN, depuis deux cadres globaux** — celui du
    /// conteneur qui ignore la zone sûre, celui du même conteneur qui la
    /// respecte (motif `FloatingButtonGeometry.measured`, #9679).
    ///
    /// Un lecteur qui ignore la zone sûre rend des `safeAreaInsets` NULS : la
    /// pastille se posait à y = 1, sous l'îlot (recette 2026-10-08, iPhone 17
    /// Pro). L'écart des deux cadres n'a pas ce défaut.
    ///
    /// Un conteneur qui ne touche pas le haut de l'écran (poussé par une
    /// bannière) n'a pas de capteur au-dessus de lui : encart nul.
    static func screenSafeAreaTop(container: CGRect, safeRegion: CGRect, reportedTop: CGFloat) -> CGFloat {
        guard container.minY <= 0.5 else { return 0 }
        return max(reportedTop, safeRegion.minY - container.minY, 0)
    }

    /// Encart supposé quand la mesure rend 0 sur un iPhone en portrait : le
    /// plus haut des îlots (iPhone 16/17 Pro). Supposer le plus bas la
    /// rapprocherait du capteur, ce que #10371 refuse.
    static let unmeasuredPortraitInset: CGFloat = 62

    /// **Où poser la pastille dans son conteneur.**
    ///
    /// Un iPhone en PORTRAIT a toujours un encart haut (20 pt au moins) : en lire
    /// 0 sur un conteneur qui touche le haut de l'écran est une mesure ratée —
    /// transitoire, ou hôte qui a consommé la zone sûre. La pastille prend alors
    /// `unmeasuredPortraitInset` au lieu de remonter sous l'îlot.
    static func topOffset(container: CGRect, safeRegion: CGRect, reportedTop: CGFloat, isPad: Bool) -> CGFloat {
        let measured = screenSafeAreaTop(container: container, safeRegion: safeRegion, reportedTop: reportedTop)
        let isPortrait = container.height > container.width
        let touchesTop = container.minY <= 0.5
        let unmeasured = !isPad && isPortrait && touchesTop && measured <= 0
        return topOffset(safeAreaTop: unmeasured ? unmeasuredPortraitInset : measured)
    }

    /// Distance entre le bord HAUT DE L'ÉCRAN (de l'hôte, zone sûre comprise)
    /// et le haut de la pastille — la même règle sur tout appareil.
    static func topOffset(safeAreaTop: CGFloat) -> CGFloat {
        max(safeAreaTop, 0) + seatBelowSafeArea
    }
}

/// Le SEUL point de montage de la position de la pastille (#9680) : il lit
/// l'encart haut de l'ÉCRAN par l'écart de deux cadres (un lecteur qui
/// respecte la zone sûre, un lecteur intérieur qui l'ignore) — jamais par la
/// fenêtre clé, dont la lecture depuis l'intérieur fige SwiftUI (cycle
/// AttributeGraph), ni par les `safeAreaInsets` d'un lecteur qui ignore la
/// zone sûre, qui valent 0.
private struct SyncPillBandMount: ViewModifier {
    func body(content: Content) -> some View {
        GeometryReader { safe in
            let safeRegion = safe.frame(in: .global)
            let reportedTop = safe.safeAreaInsets.top
            GeometryReader { full in
                content
                    .padding(.top, SyncPillPlacement.topOffset(
                        container: full.frame(in: .global),
                        safeRegion: safeRegion,
                        reportedTop: reportedTop,
                        isPad: UIDevice.current.userInterfaceIdiom == .pad
                    ))
                    .frame(maxWidth: .infinity, alignment: .top)
            }
            .ignoresSafeArea(.container, edges: .top)
        }
    }
}

extension View {
    /// Pose la pastille de synchronisation sous la zone sûre, décollée du
    /// capteur (`SyncPillPlacement`, #10371). À appliquer à `ConnectionBanner`
    /// dans un `.overlay(alignment: .top)` de l'hôte.
    func inSyncPillBand() -> some View {
        modifier(SyncPillBandMount())
    }
}
