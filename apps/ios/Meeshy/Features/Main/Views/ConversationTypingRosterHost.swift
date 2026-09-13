import SwiftUI
import MeeshySDK

/// **Le roster de frappe, observé sur le store VIVANT** (#5961).
///
/// `ConversationView.init` capturait son observateur ainsi :
///
/// ```swift
/// let vm = ConversationViewModel(...)                        // instance NEUVE à chaque
/// _viewModel = StateObject(wrappedValue: vm)                 // évaluation du parent ;
/// _typingObserver = ObservedObject(wrappedValue: vm.stateStore)  // SwiftUI garde la PREMIÈRE
/// ```
///
/// `@StateObject` ne retient que la première instance et **jette** toutes les
/// suivantes. L'`@ObservedObject`, lui, était réassigné à chaque passe depuis
/// le `vm` local — donc, dès la première ré-évaluation du parent, il observait
/// le store d'un ViewModel mort, qu'aucun `typing:start` n'alimente jamais.
///
/// Le défaut ne se voyait nulle part : le fil, lui, reçoit le ViewModel VIVANT
/// par `updateUIViewController`, si bien que la bulle de frappe apparaissait
/// normalement. Seule la pastille de retour en bas — qui lit la racine — restait
/// muette, quoi qu'il arrive.
///
/// Cet hôte rétablit ce que le commentaire d'origine PROMETTAIT et que la
/// capture ne faisait pas : observer le roster **sans** ré-évaluer le corps de
/// la conversation. Le store lui est passé au moment du rendu (`viewModel
/// .stateStore`, le survivant), jamais capturé à l'`init`.
struct ConversationTypingRosterHost<Content: View>: View {
    @ObservedObject var store: ConversationStateStore
    @ViewBuilder let content: ([TypingParticipant]) -> Content

    var body: some View {
        content(store.typingParticipants)
    }
}
