import SwiftUI
import MeeshySDK
import MeeshyUI

// **Le menu du FOND — trois actions, un site** (#5041).
//
// > Directive porteur 2026-09-04 : « Lorsqu'on a une image, vidéo de fond le
// > longpress sur le fond doit mettre le menu permettant de supprimer, ramener
// > en front ou encore d'éditer l'image. »
//
// Le canvas ROUTE (`StoryCanvasBackgroundLongPress`), ce fichier PRÉSENTE, et
// chaque action retombe sur la primitive qui existait déjà. Aucune des trois
// n'est neuve : ce qui manquait était un CHEMIN vers elles depuis un fond.
@MainActor
extension MeeshyComposerHost {

    /// **Le menu, monté sur la PILE et non sur la racine.**
    ///
    /// SwiftUI n'honore qu'UNE présentation par vue, et la racine porte déjà la
    /// feuille de partage (#4996). Le menu n'est plus une présentation depuis
    /// #8717 : c'est un calque de VERRE (`ComposerSceneContextMenu`) posé sur la
    /// pile, qui sert le fond ET les objets de la scène — le `confirmationDialog`
    /// et le `UIMenu` du canvas étaient des menus système, que le verre du
    /// composer ne peut pas habiller.
    ///
    /// Il lit la place de la carte à la même source que le viseur
    /// (`ComposerSceneCameraFrameKey`) : le point du doigt, normalisé sur la
    /// carte par le canvas, y redevient un point de l'écran.
    func backgroundMenuPresented<Contenu: View>(_ contenu: Contenu) -> some View {
        contenu.overlayPreferenceValue(ComposerSceneCameraFrameKey.self) { ancre in
            GeometryReader { proxy in
                if let demande = presentedSceneMenu, let ancre {
                    sceneMenuLayer(demande, card: proxy[ancre], container: proxy.size)
                }
            }
            .animation(.spring(response: 0.28, dampingFraction: 0.86), value: presentedSceneMenu)
        }
    }

    /// **L'identifiant se lit AVANT d'agir, et se remet à `nil` ensuite.**
    ///
    /// Le `Binding` du dialogue efface déjà l'état à la fermeture, mais l'ordre
    /// des deux n'est pas garanti : SwiftUI referme la feuille et exécute
    /// l'action dans la même passe. Lire l'identifiant en premier rend la
    /// fonction indifférente à cet ordre — sans quoi une action arriverait
    /// parfois sur un `nil`, et jamais de façon reproductible.
    func applyBackgroundMenu(_ action: ComposerBackgroundMenuAction) {
        guard let id = backgroundMenuObjectId else { return }
        backgroundMenuObjectId = nil
        switch action {
        case .edit:
            // Le MÊME éditeur que le double-tap et que le rail des
            // contrôleurs — la vue `2d` de la planche, unifiée pour les cinq
            // familles. Un second chemin d'ouverture divergerait au premier
            // outil ajouté.
            openObjectEditor(id)
        case .bringForward:
            // `toggleBackground` et NON `bringForward` : ce dernier déplace un
            // z-index parmi les objets de premier plan, et un fond se rend
            // depuis `backgroundLayer` quel que soit son z — l'entrée aurait
            // été INERTE. Ce que « ramener en avant » veut dire sur un fond,
            // c'est le faire SORTIR du plan de fond.
            viewModel.toggleBackground(id: id)
        case .delete:
            // **Le retrait du MEUBLE, jamais la primitive du SDK** (#6577).
            // Ce menu est la TROISIÈME porte de suppression, et elle est
            // arrivée après l'inventaire des deux autres : elle a hérité du
            // défaut sans figurer nulle part.
            retractMedia(objectIds: [id])
        case .retakePhoto:
            // **Le viseur s'ouvre ARMÉ, et la prise REMPLACE ce fond** (#8716).
            // L'ancien ne part qu'à la pose (`poseSceneCapture`) : refermer le
            // viseur le laisse intact.
            sceneCaptureReplacesBackgroundId = id
            armSceneCamera()
        }
        HapticFeedback.medium()
    }
}
