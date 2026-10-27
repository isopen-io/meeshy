import SwiftUI
import MeeshySDK
import MeeshyUI

/// **Les puces sonores de premier plan, peintes SUR la carte.**
///
/// > Directive porteur 2026-09-01 : « lorsqu'on a posé une scène on puisse
/// > toujours ajouter un son sur la scène, en son de fond de la scène ou en
/// > chip resizable sur la scène. »
///
/// Le meuble savait DÉJÀ répondre à cette puce — `onItemEdit` traite
/// `case .audio` depuis le #4671 — mais aucune surface ne la peignait :
/// `AudioForegroundChip` n'était monté que par l'atelier et par le viewer.
/// La branche était vivante, l'objet invisible ; le contrôle existait sans
/// être ALIMENTÉ.
///
/// **Le canvas UIKit ne peut pas les rendre, et c'est structurel** : il n'a
/// pas de couche audio (`Layers/` en compte six, aucune pour le son) et
/// `manipulable` exclut `.audio` de ce qu'un geste peut saisir. La puce est
/// donc une vue SwiftUI posée par-dessus — d'où le slot `objectOverlay`,
/// qui borne à la carte SANS éteindre les touches du canvas, à la
/// différence de celui du dessin.
///
/// **Pas de puce pendant le dessin**, comme dans l'atelier : le calque de
/// tracé capture la carte entière, et une puce qui resterait dessus
/// promettrait un doigt qu'elle ne recevrait pas.
struct ComposerSceneSoundChips: View {
    @Binding var slide: StorySlide
    let canvasSize: CGSize
    let selectedItemId: String?
    let onItemTapped: ((String, StoryCanvasUIView.CanvasItemKind) -> Void)?
    let onItemMenu: ((String, StoryCanvasUIView.CanvasItemKind, CGPoint) -> Void)?

    var body: some View {
        ForEach(foregroundSoundBindings, id: \.wrappedValue.id) { binding in
            AudioForegroundChip(
                audioObject: binding,
                canvasSize: canvasSize,
                mode: .composer,
                isSelected: selectedItemId == binding.wrappedValue.id,
                isUserMuted: binding.wrappedValue.volume <= 0,
                onDragEnd: { HapticFeedback.light() },
                onTap: { onItemTapped?(binding.wrappedValue.id, .audio) },
                onToggleMute: {
                    HapticFeedback.light()
                    var objet = binding.wrappedValue
                    objet.toggleMute()
                    binding.wrappedValue = objet
                }
            )
            // L'appui long d'une puce ouvre le MÊME menu de verre que les
            // autres objets (#8717) — la puce est une vue SwiftUI, hors du
            // canvas qui reconnaît l'appui long des quatre autres familles.
            .simultaneousGesture(LongPressGesture(minimumDuration: 0.45).onEnded { _ in
                let son = binding.wrappedValue
                onItemMenu?(son.id, .audio, CGPoint(x: son.x, y: son.y))
            })
        }
    }

    /// Un binding par son de premier plan — **résolu par IDENTIFIANT, jamais
    /// par index.**
    ///
    /// L'atelier capture l'index de l'énumération et le relit à chaque accès :
    /// c'est juste tant que la liste ne bouge pas, et un son supprimé pendant
    /// qu'un autre est saisi décale tous ceux qui le suivent — le geste finit
    /// alors sur le voisin. La recherche par `id` coûte un parcours d'une liste
    /// qui compte deux ou trois entrées, et ne peut pas se tromper de son.
    ///
    /// Une écriture dont l'objet a disparu est IGNORÉE plutôt que réinsérée :
    /// le relâchement d'un geste sur un son qu'on vient de supprimer ne doit
    /// pas le faire revenir.
    private var foregroundSoundBindings: [Binding<StoryAudioPlayerObject>] {
        SceneAudioStageRule.stagedAudios(in: slide.effects.audioPlayerObjects ?? [])
            .map { objet in
                Binding<StoryAudioPlayerObject>(
                    get: {
                        slide.effects.audioPlayerObjects?
                            .first { $0.id == objet.id } ?? objet
                    },
                    set: { nouveau in
                        guard let index = slide.effects.audioPlayerObjects?
                            .firstIndex(where: { $0.id == objet.id }) else { return }
                        slide.effects.audioPlayerObjects?[index] = nouveau
                    }
                )
            }
    }
}
