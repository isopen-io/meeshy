import SwiftUI
import MeeshySDK

/// **Le panneau d'options de l'outil DÉPLIÉ, sans ses bulles** (directive
/// porteur 2026-08-30).
///
/// ## Pourquoi il existe
///
/// Le composer unifié range les CONTRÔLEURS d'un outil dans le rail *leading*,
/// à la place des portes — c'est la directive : « les contrôleurs de l'outil en
/// cours REMPLACENT la ligne canonique gauche, avec en dernier un `(x)` pour
/// terminer l'outil ». Le rail porte donc les bulles.
///
/// Restent les OPTIONS : la palette de couleurs, la glissière d'épaisseur, les
/// dix-huit styles. Elles ont besoin d'une largeur que 44 pt ne donnent pas, et
/// elles se comparent latéralement — c'est la définition d'une BANDE
/// (`ComposerSceneBand`). Cette vue est ce que la bande montre.
///
/// ## Ce qu'elle N'est pas
///
/// Ni `StoryDrawingToolbar` ni `StoryTextEditToolbar` : celles-là portent
/// bulles ET options, et FLOTTENT. Les monter en plus du rail peindrait les
/// bulles deux fois. Cette vue est leur moitié BASSE, extraite pour un hôte qui
/// possède déjà l'autre moitié.
///
/// ## Une seule vue pour les deux familles, et c'est délibéré
///
/// Dessin et texte n'ont ni le même énuméré d'outils ni la même source de
/// données — l'un lit le ViewModel, l'autre un `Binding` sur l'objet texte. Un
/// hôte qui devrait choisir entre deux vues devrait d'abord savoir dans quel
/// mode il est ; ce type le sait pour lui, et rend `EmptyView` quand aucun
/// outil n'est déplié. **L'hôte demande « les options courantes », pas « les
/// options de dessin ».**
public struct MeeshyToolOptionsPanel: View {

    @ObservedObject private var viewModel: StoryComposerViewModel

    public init(viewModel: StoryComposerViewModel) {
        self.viewModel = viewModel
    }

    public var body: some View {
        if let tool = viewModel.drawingEditingMode.expandedTool,
           viewModel.drawingEditingMode.selectedStrokeId == nil {
            DrawingEditToolOptions(tool: tool, viewModel: viewModel)
        } else if case .active(let textId, let tool) = viewModel.textEditingMode,
                  let tool,
                  let binding = textObjectBinding(for: textId) {
            TextEditToolOptions(tool: tool, textObject: binding)
        }
    }

    /// Le binding vit sur le VIEWMODEL depuis le 2026-08-31 (#4634) : un
    /// troisième hôte en avait besoin — l'éditeur d'objet plein écran — et le
    /// recopier une troisième fois aurait divergé au premier champ ajouté à
    /// `StoryTextObject`, exactement ce que sa remontée ici avait déjà évité une
    /// fois.
    private func textObjectBinding(for id: String) -> Binding<StoryTextObject>? {
        viewModel.textObjectBinding(for: id)
    }
}

public extension StoryComposerViewModel {

    /// **LE binding vers un objet texte de la slide courante** — site unique.
    ///
    /// `nil` quand l'id ne désigne aucun texte : un binding fabriqué sur du vide
    /// écrirait dans un objet que personne ne rend, et l'écran paraîtrait
    /// répondre sans que rien ne change.
    func textObjectBinding(for id: String) -> Binding<StoryTextObject>? {
        guard currentEffects.textObjects.contains(where: { $0.id == id }) else { return nil }
        return Binding(
            get: { [weak self] in
                self?.currentEffects.textObjects.first(where: { $0.id == id })
                    ?? StoryTextObject(text: "")
            },
            set: { [weak self] newValue in
                guard let self else { return }
                var effects = self.currentEffects
                if let i = effects.textObjects.firstIndex(where: { $0.id == id }) {
                    effects.textObjects[i] = newValue
                    self.currentEffects = effects
                }
            }
        )
    }
}
