import SwiftUI
import MeeshyUI

// **Le `body` du meuble se découpe en COUCHES NOMINALES** (#8387).
//
// Toucher « Créer une story » fermait l'app : signal 11 sur la pile de 8 Mo du
// fil principal, une trace qui bouclait sur la copie de valeur
// (`ExclusiveGesture`, sous `StoryComposerView`) depuis
// `MeeshyComposerHost.body`, dont le cadre faisait à lui seul ~100 Ko.
//
// La cause est la forme du type, pas un geste : le `body` empilait en UNE
// expression la racine, l'autosave, le viseur, le menu du fond, la pile du
// socle, les portails d'ingestion et l'aiguillage des quatre surfaces. Son type
// concret imbriquait tout cela en un seul `ModifiedContent<…>` — une
// cinquantaine de niveaux comptés sur la source —, matérialisé — et copié, une fois par fermeture qui
// capture le meuble — dans le cadre du même `body`.
//
// Une vue `struct` NOMINALE, ou un `ViewModifier` nommé, crée un nœud
// d'attribut : SwiftUI évalue son `body` à part, dans son propre cadre, après
// avoir déroulé celui du parent. C'est le seul découpage qui borne la pile ; un
// `AnyView` plafonne le type vu par l'appelant mais matérialise quand même le
// sous-arbre à la profondeur où il est appelé (leçon de
// `ConversationViewBodyTypeDepthTests`). `MeeshyComposerHostTypeDepthTests`
// mesure chaque couche.
//
// **Chaque couche reçoit le meuble ENTIER (`host`) et OBSERVE ses huit
// magasins.** Le meuble garde ses états (`@State` / `@StateObject`) — les
// déplacer serait un autre lot, et un risque de comportement que ce correctif
// n'a pas à prendre. Une copie du meuble lit ces états par leur emplacement :
// c'est ce que fait déjà chaque fermeture de feuille. Ce qu'une copie ne fait
// PAS, c'est s'abonner aux `ObservableObject` : SwiftUI ne se ré-évalue sur un
// `objectWillChange` que dans la vue qui DÉCLARE l'objet. Sans
// `ComposerHostObservation`, une publication de l'atelier re-rendrait le meuble
// (qui déclare le `@StateObject`) sans re-rendre la couche, dont la valeur
// n'aurait pas changé d'un octet — et la pile afficherait l'état d'avant.

/// Les huit magasins du meuble, observés par chaque couche. Le `body` inline
/// se ré-évaluait sur la publication de n'importe lequel ; chaque couche doit
/// en faire autant pour que le découpage ne change rien à ce qui s'affiche.
struct ComposerHostObservation: DynamicProperty {
    @ObservedObject var viewModel: StoryComposerViewModel
    @ObservedObject var sceneCapture: ComposerCaptureSession
    @ObservedObject var preUploads: ComposerPreUploadRegistry
    @ObservedObject var sceneExport: ComposerSceneExportController
    @ObservedObject var sceneMentionBox: ComposerMentionControllerBox
    @ObservedObject var mediaPorterStore: ComposerMediaPorterStore
    @ObservedObject var publishTrigger: ComposerPublishTrigger
    @ObservedObject var autosave: ComposerAutosaveController
}

/// La scène du meuble : autosave, viseur et menu du fond autour de la pile,
/// sur le fond du plateau.
struct ComposerHostStage: View {
    let host: MeeshyComposerHost
    var observation: ComposerHostObservation

    var body: some View { host.composerStage }
}

/// La pile — portails, surface, socle flottant (`composerStack`).
struct ComposerHostStack: View {
    let host: MeeshyComposerHost
    var observation: ComposerHostObservation

    var body: some View { host.composerStack }
}

/// L'aiguillage des quatre surfaces (`surface`). Nominal, il sort l'atelier
/// — `StoryComposerView` et ses gestes — du type de la pile.
struct ComposerHostSurface: View {
    let host: MeeshyComposerHost
    var observation: ComposerHostObservation

    var body: some View { host.surface }
}

/// Ce qui occupe l'encart flottant du bas — carrousel d'effets ou socle
/// (`socleSlot`). Nominal, il sort ce contenu du type de la pile.
struct ComposerHostSocleSlot: View {
    let host: MeeshyComposerHost
    var observation: ComposerHostObservation

    var body: some View { host.socleSlot }
}

/// La rangée du socle — audience · texte du post · publier (`socle`).
struct ComposerHostSocleRow: View {
    let host: MeeshyComposerHost
    var observation: ComposerHostObservation

    var body: some View { host.socle }
}

/// Le contenu d'UN portail présenté par la feuille ou le plein écran du meuble
/// (`portalContent`). Nominal, il sort les dix feuilles du type de la pile.
struct ComposerHostPortal: View {
    let host: MeeshyComposerHost
    var observation: ComposerHostObservation
    let portal: ComposerPortal

    var body: some View { host.portalContent(portal) }
}

/// Ce que la racine pose PAR-DESSUS la scène : la zone d'écriture, la feuille
/// de partage, le voile du bake (`composerChrome`).
struct ComposerHostChromeLayer: ViewModifier {
    let host: MeeshyComposerHost
    var observation: ComposerHostObservation

    func body(content: Content) -> some View { host.composerChrome(content) }
}

/// Le cycle de vie du meuble : graines, dérivations, reports
/// (`composerLifecycle`).
struct ComposerHostLifecycleLayer: ViewModifier {
    let host: MeeshyComposerHost
    var observation: ComposerHostObservation

    func body(content: Content) -> some View { host.composerLifecycle(content) }
}

extension MeeshyComposerHost {

    var observation: ComposerHostObservation {
        ComposerHostObservation(
            viewModel: viewModel,
            sceneCapture: sceneCapture,
            preUploads: preUploads,
            sceneExport: sceneExport,
            sceneMentionBox: sceneMentionBox,
            mediaPorterStore: mediaPorterStore,
            publishTrigger: publishTrigger,
            autosave: autosave
        )
    }

    /// La pile, montée comme un NŒUD : c'est ce que le viseur et le menu du
    /// fond enveloppent.
    var composerStackNode: some View {
        ComposerHostStack(host: self, observation: observation)
    }

    /// L'aiguillage, monté comme un NŒUD sous les portails.
    var surfaceNode: some View {
        ComposerHostSurface(host: self, observation: observation)
    }

    /// L'encart du bas, monté comme un NŒUD dans `composerStack`.
    var socleSlotNode: some View {
        ComposerHostSocleSlot(host: self, observation: observation)
    }

    /// La rangée du socle, montée comme un NŒUD dans `socleSlot`.
    var socleNode: some View {
        ComposerHostSocleRow(host: self, observation: observation)
    }
}
