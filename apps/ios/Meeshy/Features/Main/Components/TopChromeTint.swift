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
/// # UN APLAT, pas un dégradé — et pourquoi la COUTURE l'impose
///
/// La bande et la barre se touchent : leur joint est un PIXEL, pas une intention.
/// Tant que la barre d'appel portait un dégradé DIAGONAL (`topLeading` →
/// `bottomTrailing`), le bord haut de la barre n'était pas UNE couleur mais une
/// rampe — mesurée à `#4F45E4` à gauche, `#423CC5` au milieu, `#3831A5` à droite.
/// Une bande d'aplat `#4F46E5` posée dessus ne pouvait donc raccorder qu'en UN
/// point de l'écran, et laissait jusqu'à 23 unités d'écart à l'autre bord.
///
/// Deux issues existaient. Faire porter à la bande le dégradé ÉTENDU de la barre
/// (ce que faisait `dev`, la barre débordant elle-même sous la status bar) la
/// forcerait à connaître la HAUTEUR de la barre qu'elle prolonge — hauteur qui
/// varie avec le Dynamic Type pour la pilule, qui diffère entre les deux barres,
/// et que la bande ne peut pas mesurer depuis son point de montage. C'est
/// re-fabriquer le couplage « une peinture par barre » que ce lot vient de
/// retirer. L'autre issue est celle retenue : **la barre d'appel passe à l'APLAT,
/// comme le mini-lecteur** — un SEUL producteur de couleur pour les deux barres
/// ET pour la bande, donc une couture continue par CONSTRUCTION, à toute largeur,
/// à toute hauteur de barre, sans qu'aucune vue n'ait à mesurer l'autre. C'est
/// aussi ce que la demande porteur dit littéralement : « de la MÊME couleur ».
///
/// Contraste : l'aplat retenu est `bannerTop` (`indigo600`), soit l'arrêt le
/// MOINS contrasté des deux que portait le dégradé. Toutes les teintes de la
/// bannière sont déjà calibrées et testées CONTRE lui (`CallBannerContrastTests` :
/// blanc 6.3:1, `errorSoft` 3.3:1, `indigo200` 4.2:1) — passer à l'aplat ne peut
/// donc abaisser aucun ratio sous ce que la suite prouve déjà.
///
/// COULEUR — indigo FIXE pour les deux barres, jamais l'accent de la
/// conversation. Le chrome haut est GLOBAL : il se pose au-dessus de tous les
/// écrans, en un seul site, pas dans le contexte d'une conversation. Les arrêts
/// de `CallBannerContrast` sont calibrés WCAG et testés ; un accent tiré d'une
/// palette de vingt couleurs mélangée n'a aucune suite de contraste — le livrer
/// serait une régression d'accessibilité, et `ActiveAudioContext` ne porte de
/// toute façon ni accent ni type/langue/thème. L'accent reste une question de
/// dimension 6 (cohérence de positionnement), à ouvrir en issue.
struct TopChromeTint: Equatable, Sendable {
    /// L'UNIQUE couleur du chrome haut pour cette barre : la bande la porte, et
    /// la barre qu'elle prolonge la porte AUSSI — `MiniAudioPlayerBarStyle
    /// .background` et le `.background` de `FloatingCallPillView` lisent tous
    /// deux ce membre. Un seul producteur : la couture ne peut pas dériver.
    ///
    /// Ce type n'expose QUE cette valeur. Il a porté un moment un `gradient`,
    /// un `bottom` et un `foreground` qu'aucun code de production ne lisait —
    /// et le doc-comment du premier affirmait « le dégradé que la barre
    /// elle-même rend », ce qui était faux : la barre construisait le sien en
    /// ligne. Un membre mort documenté à tort est pire qu'un membre absent, il
    /// fait croire qu'une question est réglée.
    let bandColor: Color

    /// L'arrêt HAUT du dégradé historique, seul calibré contre le blanc (6.3:1).
    static let call = TopChromeTint(bandColor: CallBannerContrast.bannerTop)

    /// LA MÊME valeur : le mini-lecteur est un aplat `indigo600`, soit exactement
    /// `bannerTop`. Les deux cas restent distincts parce qu'ils nomment deux
    /// BARRES, pas deux couleurs — et parce que c'est ce qui permettra d'en
    /// différencier une sans toucher l'autre.
    static let audio = TopChromeTint(bandColor: CallBannerContrast.bannerTop)

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
/// **`.overlay`, et pas `.background` — mesuré au simulateur, pas raisonné.**
/// Un `.background(alignment: .top)` est INVISIBLE ici : le `content` que ce
/// modifier enveloppe contient `RootThemedBackground`, qui porte
/// `.ignoresSafeArea()` et peint donc la fenêtre ENTIÈRE, bande status-bar
/// comprise. Tout ce qui se pose DERRIÈRE ce contenu disparaît dessous. La
/// preuve : un aplat ROUGE opaque de 200 pt posé en `.background` ne rend pas
/// un pixel (capture 2026-09-14, Meeshy-FullscreenCluster, appel forcé).
///
/// L'objection qui avait fait préférer `.background` — « par-dessus, la bande
/// couvrirait la pilule et le mini-lecteur » — est réelle, et c'est l'OFFSET
/// qui y répond : l'overlay est aligné sur le haut du `VStack`, donc sur la
/// limite BASSE de l'encart, puis remonté de toute sa hauteur. Il n'occupe que
/// la bande système, et pas un point de la barre qu'il prolonge. Mesuré au
/// pixel par `TopChromeBandRenderTests` — pas déduit de la géométrie.
///
/// Les deux autres propriétés, chacune pour sa raison :
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
            .overlay(alignment: .top) {
                if let tint = TopChromeTint.resolve(callIsActive: callIsActive, audio: audio) {
                    tint.bandColor
                        .frame(height: DeviceLayout.safeAreaTop)
                        .offset(y: -DeviceLayout.safeAreaTop)
                        .allowsHitTesting(false)
                }
            }
    }
}
