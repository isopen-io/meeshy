import Foundation
import MeeshySDK

/// **La garde de tout envoi qui ne part pas du fil ouvert** (#12985, #12641,
/// #12986).
///
/// Le fil scelle selon la loi de `EndToEndSendSealer.init(_:)` ; le transfert,
/// la file hors ligne, le partage (extension comprise, par son relais), la
/// réponse depuis une notification, le refus d'appel par message et la réponse
/// à une humeur ne lisaient que le mode SERVI : une passerelle qui sert sans
/// mode une conversation que cet appareil a vue chiffrée de bout en bout y
/// obtenait du clair. Cette garde lit la MÊME loi, sur la même mémoire :
/// - le mode servi que le chemin connaît (la ligne choisie, la conversation
///   rendue par la passerelle) ;
/// - la ligne relue du cache de la liste ;
/// - la mémoire du compte (`EndToEndRegimeLedger`, « vue e2ee reste e2ee ») ;
/// - le fil relu du cache : un avis d'activation ou un message chiffré de bout
///   en bout qui y est affiché (`EncryptionSwitchNoticeTrail`, #12986).
///
/// Une seule source qui dit le bout en bout scelle, et ce qui est vu est
/// retenu. Un chemin qui sait sceller scelle ; les autres refusent avant tout
/// téléversement, transport ou mise en file.
///
/// Modèle de menace : serveur compromis ou divergent qui sert sans mode une
/// conversation chiffrée. Hors modèle : un appareil qui n'a JAMAIS vu la
/// conversation chiffrée, ni dans sa mémoire, ni dans son cache (#12520).
struct EndToEndDestinationGuard {
    var ledger: EndToEndRegimeLedger = .shared
    var cache: any ConversationCacheReaderProviding = ConversationCacheReader()

    /// La garde de l'app, pour un appel hors de toute injection (file héritée).
    static func live(_ conversationId: String) async -> Bool {
        await EndToEndDestinationGuard().seals(conversationId)
    }

    func seals(_ conversationId: String, served modes: [String?] = []) async -> Bool {
        modes.forEach { ledger.learn(mode: $0, for: conversationId) }
        let row = await cache.currentConversation(id: conversationId)
        let thread = await cache.cachedThread(id: conversationId) ?? []
        return ledger.seals(
            for: conversationId,
            opening: nil,
            cached: row?.encryptionMode,
            activationShownAt: EncryptionSwitchNoticeTrail.endToEndShownAt(in: thread)
        )
    }
}
