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
        .modifier(ComposerSceneMediaRetouchCover(request: $sceneMediaRetouch) { completeSceneMediaRetouch($0, $1) })
    }

    /// **L'identifiant se lit AVANT d'agir, puis se remet à `nil`** : SwiftUI referme la feuille et
    /// exécute l'action dans la même passe, sans garantir l'ordre.
    func applyBackgroundMenu(_ action: ComposerBackgroundMenuAction) {
        guard let id = backgroundMenuObjectId else { return }
        backgroundMenuObjectId = nil
        switch action {
        case .edit:
            // Le MÊME éditeur que le double-tap et le rail, la retouche unique pour une image ou une vidéo.
            if !requestSceneMediaRetouch(id) { openObjectEditor(id) }
        case .bringForward:
            // `toggleBackground` et NON `bringForward` : un fond se rend depuis `backgroundLayer` quel que soit son z.
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
