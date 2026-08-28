import SwiftUI
import MeeshySDK

/// **Les deux accessoires de la rangée haute de l'atelier, fournis par l'app**
/// (#4124).
///
/// ## Pourquoi une injection, et pas des paramètres d'init
///
/// Ce que ces accessoires portent est une décision PRODUIT que le SDK n'a pas à
/// connaître : le chip de type de publication vit dans `ComposerFormatFan` —
/// il lit l'éventail, la mémoire de format, le plafond d'audience — et l'icône
/// de description ouvre un éditeur dont le TEXTE appartient au meuble. Les
/// passer par l'init aurait obligé les quatre `public init` de
/// `StoryComposerView` à les porter, et chaque appelant existant à les nommer.
///
/// L'environnement est le point d'injection que ce composer utilise déjà pour
/// tout ce qui est app-side — sélecteur de lieu, capture caméra, pellicule,
/// collage, bibliothèque de stickers. Même doctrine, même mécanisme.
///
/// ## Ce que chaque place SIGNIFIE
///
/// La rangée haute agit sur la PUBLICATION, jamais sur un objet de la scène —
/// c'est ce qui la distingue du rail d'outils du bas, qui outille la SCÈNE.
///
/// Le côté *leading* porte ce qui QUALIFIE ce qu'on publie — son TYPE, sa
/// DESCRIPTION — et le côté *trailing* ce qui AGIT dessus : l'audience, l'œil,
/// la flèche, le `⋯`. Cette ligne de partage n'est pas décorative, elle est ce
/// qui a résolu un débordement mesuré : la description avait d'abord été posée
/// côté trailing, portant le groupe d'actions à cinq pastilles sur 402 pt de
/// large — le sélecteur d'audience s'y tronquait en « F » et l'icône passait
/// sous la flèche. Un attribut rangé parmi les actions déborde ; rangé parmi
/// les attributs, il tient.
///
/// Un SEUL emplacement, donc, et il rend une vue OPAQUE : l'app y met ce
/// qu'elle veut, y compris plusieurs contrôles. Un second slot « trailing »
/// a existé le temps d'une mesure et a été retiré — un point d'injection que
/// personne ne sert est du code mort, et il aurait invité le prochain
/// contrôle à déborder de nouveau.
///
/// Jamais « gauche » ni « droite » (loi 12 de la planche) : en arabe, l'une des
/// sept langues servies, les deux s'échangent.
///
/// Absent (`nil`) ⇒ **rien n'est peint**. Un emplacement vide ne réserve aucune
/// place et ne dessine aucun fond — loi 4 : un contrôle sans effet est absent.
public struct StoryComposerHeaderAccessory {
    public typealias Make = @MainActor () -> AnyView

    private let make: Make

    public init(make: @escaping Make) {
        self.make = make
    }

    public func makeView() -> AnyView { make() }
}

public struct StoryComposerHeaderLeadingAccessoryKey: EnvironmentKey {
    public static let defaultValue: StoryComposerHeaderAccessory? = nil
}

extension EnvironmentValues {

    /// Posé JUSTE APRÈS la fermeture, du côté qui QUALIFIE la publication.
    public var storyComposerHeaderLeadingAccessory: StoryComposerHeaderAccessory? {
        get { self[StoryComposerHeaderLeadingAccessoryKey.self] }
        set { self[StoryComposerHeaderLeadingAccessoryKey.self] = newValue }
    }

}

extension View {

    /// Fournit l'accessoire *leading* de la rangée haute de l'atelier.
    public func storyComposerHeaderLeadingAccessory<Content: View>(
        @ViewBuilder _ content: @escaping () -> Content
    ) -> some View {
        environment(\.storyComposerHeaderLeadingAccessory,
                     StoryComposerHeaderAccessory { AnyView(content()) })
    }
}
