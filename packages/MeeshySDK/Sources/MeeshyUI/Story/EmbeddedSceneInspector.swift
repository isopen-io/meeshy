import SwiftUI
import MeeshySDK

/// **La zone contextuelle NEUVE de l'état INSPECTEUR (lot 3A du composer
/// unifié, #4035 — planche P4 §3).**
///
/// Quand un objet de la scène incrustée (`EmbeddedSceneCanvas`, Phase 1/2) est
/// sélectionné, l'écran document fait paraître SES contrôles juste au-dessus
/// de la rangée d'outils. Aucune sélection — ou une sélection dont ce lot ne
/// sert aucun contrôle — ⇒ la zone reste ABSENTE : jamais un panneau vide,
/// jamais un contrôle grisé (loi 4, planche P4 §3).
///
/// **L'ABSENCE est portée par l'INIT, pas par l'appelant.** `init?` échoue pour
/// tout `CanvasItemKind` que ce lot ne sert pas — un hôte ne PEUT donc pas
/// monter une zone vide, même par erreur. La loi 4 devient une propriété du
/// type plutôt qu'une discipline de site d'appel.
///
/// **Un seul contrôle réel pour ce premier lot : le panneau filtres**
/// (`StoryFilterGridView`), et il est monté pour la seule sélection `.media` —
/// la planche range les 8 filtres à l'« Inspecteur média » (§ P7, ligne
/// « Filtres … Inspecteur média, liste inchangée »). Un texte, un sticker ou un
/// lieu sélectionné ne rend donc RIEN tant qu'un lot suivant n'aura pas
/// EXTRAIT leur corps de contrôle en vue partagée publique — jamais une copie :
/// « un corps, deux montages » (règle d'emprunt, lot 3A).
///
/// **Composant NEUF — jamais un recouplage à la coquille plein écran**
/// (arbitrage porteur, lot 3A). `StoryComposerView`, `ComposerControlsLayer`,
/// `ComposerBottomBand` et `ComposerToolPanelHost` forment l'atelier PLEIN
/// ÉCRAN, en production et encore atteignable par d'autres portes (tray
/// stories « + »). Tant que le composer unifié est en bêta, la surface
/// document ne doit RIEN pouvoir casser de ce chemin — cette vue ne les
/// importe, ne les monte et ne les référence JAMAIS ; la garde négative de
/// `EmbeddedSceneInspectorTests` le mesure sur la SOURCE.
///
/// **Le modèle reste UNIQUE.** Cette vue lit et mute le MÊME
/// `StoryComposerViewModel` que l'atelier — jamais une jumelle divergente
/// (`StorySlide` / `StoryEffects` n'ont qu'une source de vérité, ce qui garde
/// publication, reader et export d'accord sur ce qu'EST une story). Ce qui
/// n'est PAS réemployé, c'est la coquille — un conteneur, pas une brique —
/// exactement le sillon déjà tracé par `EmbeddedSceneCanvas`.
public struct EmbeddedSceneInspector: View {
    @ObservedObject public var viewModel: StoryComposerViewModel

    /// Rend `nil` — donc AUCUNE zone — pour toute sélection dont ce lot ne sert
    /// aucun contrôle (`nil`, `.text`, `.sticker`, `.location`). Seul `.media`
    /// a un inspecteur en v1.
    public init?(viewModel: StoryComposerViewModel, kind: StoryCanvasUIView.CanvasItemKind?) {
        guard kind == .media else { return nil }
        self.viewModel = viewModel
    }

    public var body: some View {
        StoryFilterGridView(
            viewModel: viewModel,
            previewImage: viewModel.currentSlideBackgroundImage
        )
    }
}
