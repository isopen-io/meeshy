import SwiftUI
import MeeshySDK
import MeeshyUI

// MARK: - La QUATRIÈME porte : le double tap latéral d'un média à durée (#6163)
//
// Directive porteur 2026-09-12 : « le +10 et −10 peuvent être enlevés, ce sera
// posé par double tap à gauche ou à droite de la scène où se trouve la vidéo ! »
//
// La loi — quel tiers recule, lequel avance, lequel ne réclame rien, comment le
// saut se borne — vit au SDK (`MediaStageSeek`), parce qu'elle ne connaît ni vue
// ni recognizer et que quatre autres surfaces devront la partager (spec § 4,
// lots 2 à 7). Ce fichier porte la moitié qui demande un écran : OÙ les zones
// sont armées, et ce qu'un saut fait au player partagé.
//
// Fichier à part plutôt qu'une section de plus dans `+Pages.swift` : les pages
// sont propriétaires de leur transformation, la géographie d'un geste est une
// autre responsabilité — et c'est celle que #6142 a rendue la plus disputée de
// la galerie.

/// **Les deux tiers latéraux, armés ; le centre, laissé libre.**
///
/// ## Pourquoi trois régions et non un geste posé sur toute la scène
///
/// Un double tap RETARDE le tap simple : celui-ci doit attendre que le double
/// échoue, deux cent cinquante à trois cents millisecondes. Or le tap est la
/// porte la plus fréquente du plein cadre (#6142). Monté sur la scène entière,
/// ce geste ralentirait donc l'ouverture PARTOUT pour un saut qui n'a de sens
/// que sur les bords.
///
/// La zone centrale n'est pas « une zone qui rend `nil` » : c'est une zone qui
/// ne porte **aucun** `SpatialTapGesture`, et qui laisse passer ce qu'elle
/// reçoit (`allowsHitTesting(false)`). C'est la seule forme qui rende au centre
/// son tap immédiat — un `guard` dans un gestionnaire arriverait trop tard, la
/// latence étant payée par la RECONNAISSANCE, pas par la décision.
///
/// ## Pourquoi la position du doigt traverse quand même la règle
///
/// Les deux régions savent déjà laquelle est laquelle — il aurait suffi de leur
/// faire dire `.backward` et `.forward`. Elles remettent pourtant la position
/// brute à `MediaStageSeek.resolve`, dans un espace de coordonnées commun, pour
/// que le tiers ne soit jamais décidé deux fois : la largeur qu'elles occupent
/// vient de `lateralWidth(for:)`, la réponse de `zone(x:width:)`, et le témoin
/// `test_theArmedZones_andTheDecision_readTheSameThird` (SDK) lie les deux. Une
/// géographie posée au jugé couvrirait une bande que la règle ne reconnaîtrait
/// pas, et le geste y serait inerte sans qu'aucune moitié ne soit fausse.
struct MediaStageSeekZones: View {

    /// Les cotes du CADRE — celles que `MediaStageFraming` a rendues, pas celles
    /// de l'écran : « à gauche ou à droite de la scène où se trouve la vidéo »
    /// désigne le média, et le plateau autour de lui appartient aux couloirs.
    let size: CGSize
    let onDoubleTap: (CGPoint) -> Void

    /// L'espace commun aux deux régions. Sans lui, chacune rendrait une
    /// abscisse LOCALE — deux origines pour une seule règle, et la zone droite
    /// répondrait « reculer ».
    private static let space = "mediaStageSeek"

    var body: some View {
        let lateral = MediaStageSeek.lateralWidth(for: size.width)

        HStack(spacing: 0) {
            zone(width: lateral)
            Color.clear
                .frame(width: max(0, size.width - 2 * lateral))
                .allowsHitTesting(false)
            zone(width: lateral)
        }
        .frame(width: size.width, height: size.height)
        .coordinateSpace(name: Self.space)
    }

    /// `SpatialTapGesture` et non `onTapGesture(count:coordinateSpace:)` : la
    /// seconde ne rend la position qu'à partir d'iOS 17, et la cible du projet
    /// est iOS 16.
    private func zone(width: CGFloat) -> some View {
        Color.clear
            .frame(width: width)
            .contentShape(Rectangle())
            .gesture(
                SpatialTapGesture(count: 2, coordinateSpace: .named(Self.space))
                    .onEnded { onDoubleTap($0.location) }
            )
    }
}

/// **Ce qu'un double tap latéral fait au player partagé.**
///
/// Séparé de la vue parce que c'est l'orchestration — la règle de pureté du SDK
/// laisse app-side tout ce qui lit un singleton Meeshy, et cette fonction en lit
/// un : le player du PROCESSUS.
enum MediaStageSeekAction {

    /// La position et la durée se lisent sur le manager VIVANT, à l'instant du
    /// geste, jamais sur les miroirs que les pages tiennent — la page n'observe
    /// délibérément pas `currentTime`, qui publie à 5-10 Hz et re-rendrait
    /// toutes les pages de la galerie en continu. Lire ici ne coûte rien et ne
    /// crée aucune dépendance de rendu.
    ///
    /// **C'est `jump.to` qui part au player, jamais `skip(seconds:)`.** Ce
    /// dernier re-bornerait le saut sur SA durée : deux arithmétiques
    /// d'extrémités pour un seul geste, et la garantie « jamais un état
    /// invalide » perdrait son site unique.
    ///
    /// Le retour haptique est posé même quand le saut est BORNÉ — il n'a alors
    /// parcouru aucune seconde, mais le geste a bien été reçu, et se taire à la
    /// butée ferait croire à un double tap raté exactement là où l'utilisateur
    /// insiste. C'est aussi pourquoi la règle distingue un saut nul d'un `nil`.
    @MainActor
    static func apply(at point: CGPoint,
                      in frame: CGSize,
                      manager: SharedAVPlayerManager) {
        guard let jump = MediaStageSeek.resolve(x: point.x,
                                                width: frame.width,
                                                position: manager.currentTime,
                                                duration: manager.duration) else { return }

        manager.seek(to: jump.to)
        HapticFeedback.light()
    }
}
