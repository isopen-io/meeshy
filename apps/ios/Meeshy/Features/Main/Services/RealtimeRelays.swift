import Foundation
import MeeshySDK

/// **Les relais temps réel armés au démarrage de la session** — un site pour
/// l'iPhone et l'iPad, qui les recopiaient chacun.
///
/// `FeedSocketHandler` est le seul écrivain disque des posts, commentaires et
/// réactions (idempotent, jamais désarmé) ; le relais du `ConversationSyncEngine`
/// tient les conversations fermées à jour ; l'enregistrement automatique des
/// médias reçus (#8307) écoute la même réception, et la reprise d'un appel
/// encore en cours attend la première connexion (#9111).
enum RealtimeRelays {
    @MainActor
    static func arm() async {
        DependencyContainer.shared.feedSocketHandler.arm()
        await ConversationSyncEngine.shared.startSocketRelay()
        ReceivedMediaAutoSaver.shared.startListening { AuthManager.shared.currentUser?.id }
        CallLaunchResume.shared.arm()
    }
}
