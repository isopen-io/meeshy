import SwiftUI
import MeeshySDK
import MeeshyUI

// MARK: - La scène du fil GRANDIT jusqu'au plein écran (#8598)
//
// Demande porteur du 2026-09-28 : « Le passage de la scène inline dans le post
// à la scène plein écran doit être visuellement propre, animation sans
// accroc ».
//
// La galerie s'ouvrait par la montée système d'un `fullScreenCover` : la scène
// quittait le fil, un écran noir montait du bas, et la même scène réapparaissait
// ailleurs. Rien ne disait à l'œil que c'était LA MÊME. Le lecteur de stories a
// déjà sa réponse depuis U1 — la transition ZOOM d'iOS 18
// (`zoomTransitionSource` / `zoomTransitionDestination`, MeeshyUI), dont le
// namespace est posé par la racine. La scène d'un post la reprend : la carte du
// fil est la SOURCE, la galerie la DESTINATION, et l'écran grandit depuis le
// cadre qu'on a touché — puis y revient à la fermeture.
//
// **iOS 16-17 : la montée système, inchangée** — les deux atomes y sont sans
// effet. C'est le repli assumé : aucune transition maison ne rivalise avec la
// continuité que le système donne au geste de fermeture interactif.
//
// **Le fil de lecture ne casse pas** : la position se lègue par
// `ScenePlaybackPositions` (#6580) et le média porteur joue le player PARTAGÉ
// (`SharedCarrierPlayerProvider`, O16) — la scène reprend où la carte en était.

/// **Quelle source zoome, et quand** — la règle, sans vue.
nonisolated enum SceneZoomTransition {

    /// L'identité de la carte de scène d'un post. Préfixée : le namespace est
    /// PARTAGÉ avec le plateau de stories, dont les sources sont des
    /// identifiants de groupe.
    static func sourceID(postId: String) -> String {
        "post-scene:\(postId)"
    }

    /// **La galerie ne zoome que si elle s'ouvre SUR la scène.** Un média du
    /// post ouvert depuis le carrousel n'a pas de source enregistrée — le
    /// système retomberait sur un zoom depuis nulle part. `nil` ⇒ la
    /// présentation habituelle.
    static func destinationID(postId: String, hasScene: Bool, startMediaId: String?) -> String? {
        guard hasScene, startMediaId == nil else { return nil }
        return sourceID(postId: postId)
    }
}

extension View {

    /// **La carte de scène du fil devient la SOURCE du zoom** — le namespace
    /// vient de l'environnement (posé par la racine) ; sans lui, rien.
    func sceneZoomSource(postId: String) -> some View {
        modifier(SceneZoomSourceModifier(id: SceneZoomTransition.sourceID(postId: postId)))
    }

    /// **La galerie devient la DESTINATION du zoom** quand l'opérateur l'a
    /// demandé (`SceneZoomTransition.destinationID`).
    @ViewBuilder
    func sceneZoomDestination(_ sourceID: String?, in namespace: Namespace.ID?) -> some View {
        if let sourceID {
            zoomTransitionDestination(sourceID: sourceID, in: namespace)
        } else {
            self
        }
    }
}

private struct SceneZoomSourceModifier: ViewModifier {
    let id: String
    @Environment(\.zoomTransitionNamespace) private var namespace

    func body(content: Content) -> some View {
        content.zoomTransitionSource(id: id, in: namespace)
    }
}
