import SwiftUI
import MeeshySDK
import MeeshyUI

/// La TEINTE du chrome haut, et — avec `TopChromeBand` — le SITE UNIQUE qui
/// peint la bande status-bar au-dessus de la barre active (#6579).
///
/// Demande porteur 2026-09-14 : « colorie tout le haut de l'application de la
/// couleur de la barre qui affiche le lecteur ou l'appel en cours, de sorte que
/// tout le haut jusqu'à la barre système soit de la même couleur ».
///
/// AVANT : la peinture de la bande était une PROPRIÉTÉ DE CHAQUE BARRE.
/// `FloatingCallPillView` la posait sur son propre dégradé ; `MiniAudioPlayerBar`
/// ne la posait pas du tout. Un appel teintait donc le haut, une écoute audio le
/// laissait au `RootThemedBackground` — et comme le mini-lecteur est le PREMIER
/// élément du `VStack` de `CallPresentationLayer` quand aucun appel n'est actif,
/// c'est exactement l'écran photographié par le porteur. Une propriété portée
/// par chaque barre est présente chez l'une et absente chez l'autre : le défaut
/// n'était pas une couleur manquante, c'était un propriétaire de trop.
///
/// APRÈS : les deux barres ne connaissent plus que leur propre hauteur. La bande
/// appartient au CONTENEUR qui les empile, monté par les DEUX racines (iPhone
/// `RootViewLayers`, iPad `iPadRootViewLayers`) — un correctif posé dans une
/// seule racine aurait manqué l'autre.
///
/// COULEUR — indigo FIXE pour les deux barres, jamais l'accent de la
/// conversation. Le chrome haut est GLOBAL : il se pose au-dessus de tous les
/// écrans, en un seul site, pas dans le contexte d'une conversation. Les arrêts
/// de `CallBannerContrast` sont calibrés WCAG et testés
/// (`CallBannerContrastTests`) ; `MiniAudioPlayerBarStyle.primaryForeground`
/// n'est prouvé que contre `indigo600`. Un accent tiré d'une palette de vingt
/// couleurs mélangée n'a aucune suite de contraste — le livrer serait une
/// régression d'accessibilité, et `ActiveAudioContext` ne porte de toute façon
/// ni accent ni type/langue/thème. L'accent reste une question de dimension 6
/// (cohérence de positionnement), à ouvrir en issue.
struct TopChromeTint: Equatable, Sendable {
    let top: Color
    let bottom: Color

    /// Le dégradé que la barre elle-même rend : même paire d'arrêts, même sens
    /// que la bannière d'appel, pour qu'aucune couture ne se voie.
    var gradient: LinearGradient {
        LinearGradient(colors: [top, bottom], startPoint: .topLeading, endPoint: .bottomTrailing)
    }

    /// La bande touche la barre SYSTÈME : elle prend l'arrêt HAUT, le seul
    /// calibré contre le blanc (6.3:1). Un dégradé étalé sur les ~59 pt de
    /// l'encart se lirait comme un second aplat posé au-dessus du premier.
    var bandColor: Color { top }

    /// Encre résolue par la LUMINANCE. `readableInk` est le point unique du
    /// dépôt (#5950) : un seuil arrondi en dur élit la mauvaise encre sur toute
    /// la plage `0,179 → seuil`.
    var foreground: Color { bandColor.readableInk }

    static let call = TopChromeTint(
        top: CallBannerContrast.bannerTop,
        bottom: CallBannerContrast.bannerBottom
    )

    /// LES MÊMES arrêts : le mini-lecteur est un aplat `indigo600`
    /// (`MiniAudioPlayerBarStyle.background`), soit exactement `bannerTop`.
    static let audio = TopChromeTint(
        top: CallBannerContrast.bannerTop,
        bottom: CallBannerContrast.bannerBottom
    )

    /// `nil` ⇒ AUCUNE barre active ⇒ AUCUNE bande. Sans ce cas, le haut de
    /// l'app resterait teinté en permanence, par-dessus le fond thématique.
    ///
    /// L'APPEL PRIME sur l'écoute — c'est l'ordre que le `VStack` tient déjà
    /// visuellement (la pilule au-dessus du mini-lecteur) : la bande prolonge
    /// donc ce qui touche le haut, jamais la barre rangée en dessous.
    static func resolve(callIsActive: Bool, audio context: ActiveAudioContext?) -> TopChromeTint? {
        if callIsActive { return .call }
        return context == nil ? nil : .audio
    }
}

/// Peint la bande status-bar, et RIEN d'autre.
///
/// `ViewModifier` NOMINAL, jamais une fonction générique `(some View) -> some
/// View` : la profondeur du type concret d'un `body` coûte ~17 Ko de pile par
/// niveau au décodeur de métadonnées Swift, et ce type est matérialisé au fond
/// de la pile de chaque vue que la racine héberge (en-tête de
/// `RootSharedLayers.swift`, #5837). Un type opaque se re-niche intégralement
/// chez l'appelant ; un modifier nominal coupe la chaîne.
///
/// `callIsActive` et le contexte audio arrivent en PRIMITIVES injectées : ni
/// `@EnvironmentObject` ni `@Environment` ne se propagent dans une closure
/// `.background`/`.overlay` — crash documenté quatre fois dans ce dépôt.
///
/// Trois propriétés, chacune pour une raison distincte :
/// • `.background`, jamais `.overlay` — posée par-dessus, la bande couvrirait
///   la pilule et le mini-lecteur qu'elle est censée prolonger ;
/// • hauteur = `DeviceLayout.safeAreaTop`, lue sur la FENÊTRE — un
///   `GeometryProxy.safeAreaInsets` rend 0 dans un sous-arbre qui ignore la
///   safe area (motif documenté `MessageListViewController.swift:567-574`) ;
/// • `.allowsHitTesting(false)` — une bande qui accepte un geste EST le voile
///   `ThreadChromeFade` retiré la veille (#6537), sous un autre nom.
struct TopChromeBand: ViewModifier {
    let callIsActive: Bool
    let audio: ActiveAudioContext?

    func body(content: Content) -> some View {
        content
            .background(alignment: .top) {
                if let tint = TopChromeTint.resolve(callIsActive: callIsActive, audio: audio) {
                    tint.bandColor
                        .frame(height: DeviceLayout.safeAreaTop)
                        .frame(maxWidth: .infinity)
                        .ignoresSafeArea(.container, edges: .top)
                        .allowsHitTesting(false)
                }
            }
    }
}
