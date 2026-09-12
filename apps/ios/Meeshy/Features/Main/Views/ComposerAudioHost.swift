import SwiftUI

/// **L'UNIQUE ABONNÉ AU VUMÈTRE** (#6226) — jumeau de `ComposerTextHost`.
///
/// ## Ce qu'il ferme
///
/// `AudioRecorderManager` publie `duration` et `audioLevels` (quinze valeurs)
/// **vingt fois par seconde** — c'est ce qu'il faut pour qu'un vumètre bouge.
/// Six vues le tenaient en `@StateObject`, dont `ConversationView`
/// (2 746 lignes) et `PostDetailView` (2 297) : pendant l'enregistrement d'un
/// vocal, **tout l'écran se ré-évaluait vingt fois par seconde**, y compris le
/// pont UIKit de la liste de messages, pour trois valeurs que seule la barre
/// de composition affiche.
///
/// ## Pourquoi `@State` à la racine et `@ObservedObject` ici
///
/// `@StateObject` fait DEUX choses : il possède l'objet et il s'y abonne. La
/// racine n'a besoin que de la première — elle appelle `startRecording()`,
/// `stopRecording()`, `cancelRecording()`, et lit `duration` une fois à
/// l'arrêt. Appeler une méthode n'exige aucun abonnement. `@State` possède
/// sans souscrire ; cet hôte souscrit sans posséder.
///
/// C'est mot pour mot le dispositif que `ConversationComposerTextModel` (#4105)
/// a posé pour la FRAPPE, et pour la même raison — le lot d'origine avait
/// traité le texte et laissé l'audio, qui bat pourtant vingt fois plus vite
/// qu'on ne tape.
///
/// ## Pourquoi il rend `AnyView`
///
/// Un hôte GÉNÉRIQUE ajouterait une couche au type composite du composer, que
/// `themedComposer` porte déjà sous garde anti-débordement (#6221 : une vue
/// SwiftUI est un type valeur, et sa largeur se paie sur la pile). En rendant
/// `AnyView`, cette frontière nominale BORNE le type au lieu de l'allonger :
/// elle corrige la cadence et allège la pile du même geste.
struct ComposerAudioHost: View {

    @ObservedObject var recorder: AudioRecorderManager

    /// Reçoit les trois seules valeurs réactives du vumètre.
    let content: (Bool, TimeInterval, [CGFloat]) -> AnyView

    var body: some View {
        content(recorder.isRecording, recorder.duration, recorder.audioLevels)
    }
}
