import SwiftUI

/// **Où la pastille de synchronisation se pose : dans la bande de la barre
/// d'état, hors du contenu** (#9680, demande porteur 2026-10-08 : « trop
/// centrée dans l'écran, elle devrait être plus haut »).
///
/// Elle se posait SOUS le chrome de son hôte — 64 + 8 pt sous la zone sûre à
/// la racine, 114 + 8 pt en conversation, 8 pt ailleurs, 0 sur iPad : quatre
/// marges écrites à quatre endroits, et une pastille qui flottait au tiers
/// haut du fil. Elle se pose désormais là où vit l'état du système, au-dessus
/// de tout contenu :
///
/// | appareil | bande | où |
/// |---|---|---|
/// | iPhone à îlot / à encoche | `underSensorHousing` | juste sous le capteur, à cheval sur le bord haut de la zone sûre |
/// | iPad | `statusBarCenter` | au centre de la barre d'état, libre (heure à gauche, batterie à droite) |
/// | iPhone à bouton d'accueil, paysage | `belowStatusBar` | sous la barre d'état, dont l'heure occupe le centre |
///
/// Le titre des écrans à en-tête flottant (#5835) et les boutons du chrome de
/// conversation commencent à `safeAreaTop + 8` au plus tôt : la pastille ne
/// déborde de la zone sûre que de `maximumIntrusionIntoSafeArea`, le haut d'une
/// cible tactile de 44 pt, jamais un titre.
///
/// Fonction PURE : c'est la DÉCISION qui se teste (`SyncPillPlacementTests`) ;
/// le rendu n'a qu'un point de montage, `inSyncPillBand()`.
nonisolated enum SyncPillPlacement {
    enum Band: Equatable, Sendable {
        case underSensorHousing
        case statusBarCenter
        case belowStatusBar
    }

    /// Plus petit encart haut d'un iPhone à capteur : 44 pt (encoche du X) ;
    /// 47–50 sur les encoches suivantes, 59–62 sous un îlot. Un iPhone à bouton
    /// d'accueil en a 20.
    static let sensorHousingMinimumInset: CGFloat = 44

    /// Écart entre le bas du capteur et le haut de la zone sûre (îlot : bas à
    /// 48 pt, zone sûre à 59 pt). La pastille se pose juste sous le capteur.
    static let sensorToSafeAreaGap: CGFloat = 11

    /// Air laissé entre le capteur (ou la barre d'état) et la pastille.
    static let clearance: CGFloat = 1

    /// Ce que la pastille s'autorise sous le haut de la zone sûre — moins que
    /// la marge de 8 pt sous laquelle commencent les chromes et les titres.
    static var maximumIntrusionIntoSafeArea: CGFloat {
        SyncPillMetrics.height - sensorToSafeAreaGap + clearance
    }

    static func band(safeAreaTop: CGFloat, isPad: Bool) -> Band {
        if isPad {
            return safeAreaTop >= SyncPillMetrics.height ? .statusBarCenter : .belowStatusBar
        }
        return safeAreaTop >= sensorHousingMinimumInset ? .underSensorHousing : .belowStatusBar
    }

    /// **L'encart haut de l'ÉCRAN, depuis deux cadres globaux** — celui du
    /// conteneur qui ignore la zone sûre, celui du même conteneur qui la
    /// respecte (motif `FloatingButtonGeometry.measured`, #9679).
    ///
    /// La première version lisait `safeAreaInsets` sur un `GeometryReader`
    /// portant `.ignoresSafeArea()` : il rend une zone sûre NULLE, et la
    /// pastille se posait à y = 1, entièrement SOUS l'îlot (recette 2026-10-08,
    /// iPhone 17 Pro). L'écart des deux cadres n'a pas ce défaut.
    ///
    /// Un conteneur qui ne touche pas le haut de l'écran (poussé par une
    /// bannière) n'a pas de capteur au-dessus de lui : encart nul, et la
    /// pastille se pose en haut du conteneur.
    static func screenSafeAreaTop(container: CGRect, safeRegion: CGRect, reportedTop: CGFloat) -> CGFloat {
        guard container.minY <= 0.5 else { return 0 }
        return max(reportedTop, safeRegion.minY - container.minY, 0)
    }

    /// **Où poser la pastille dans son conteneur — ou `nil` tant que la zone
    /// sûre n'est pas encore mesurée.**
    ///
    /// Un iPhone en PORTRAIT a toujours un encart haut (20 pt au moins, sous la
    /// barre d'état) : en lire 0 sur un conteneur qui touche le haut de l'écran
    /// est une mesure transitoire (première passe de mise en page), pas un
    /// appareil. Se poser à y = 1 la mettrait sous l'îlot : on attend la
    /// passe suivante plutôt que de se montrer au mauvais endroit.
    static func topOffset(container: CGRect, safeRegion: CGRect, reportedTop: CGFloat, isPad: Bool) -> CGFloat? {
        let safeAreaTop = screenSafeAreaTop(container: container, safeRegion: safeRegion, reportedTop: reportedTop)
        let isPortrait = container.height > container.width
        let touchesTop = container.minY <= 0.5
        if !isPad, isPortrait, touchesTop, safeAreaTop <= 0 { return nil }
        return topOffset(safeAreaTop: safeAreaTop, isPad: isPad)
    }

    /// Distance entre le bord HAUT DE L'ÉCRAN (de l'hôte, zone sûre comprise)
    /// et le haut de la pastille.
    static func topOffset(safeAreaTop: CGFloat, isPad: Bool) -> CGFloat {
        switch band(safeAreaTop: safeAreaTop, isPad: isPad) {
        case .underSensorHousing:
            return safeAreaTop - sensorToSafeAreaGap + clearance
        case .statusBarCenter:
            return ((safeAreaTop - SyncPillMetrics.height) / 2).rounded(.down)
        case .belowStatusBar:
            return safeAreaTop + clearance
        }
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
                if let top = SyncPillPlacement.topOffset(
                    container: full.frame(in: .global),
                    safeRegion: safeRegion,
                    reportedTop: reportedTop,
                    isPad: UIDevice.current.userInterfaceIdiom == .pad
                ) {
                    content
                        .padding(.top, top)
                        .frame(maxWidth: .infinity, alignment: .top)
                }
            }
            .ignoresSafeArea(.container, edges: .top)
        }
    }
}

extension View {
    /// Pose la pastille de synchronisation dans la bande de la barre d'état
    /// (`SyncPillPlacement`). À appliquer à `ConnectionBanner` dans un
    /// `.overlay(alignment: .top)` de l'hôte.
    func inSyncPillBand() -> some View {
        modifier(SyncPillBandMount())
    }
}
