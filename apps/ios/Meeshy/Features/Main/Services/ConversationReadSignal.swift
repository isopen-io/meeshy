import Foundation
import MeeshySDK

/// Point d'entrée UNIQUE de la lecture LOCALE d'une conversation.
///
/// « Lue localement » veut dire : l'utilisateur a consommé la conversation sur
/// CET appareil, maintenant. C'est vrai à l'ouverture de l'écran, au geste
/// « Marquer comme lu » de la liste, à la quick-action d'une bannière push et à
/// l'action du widget. Le serveur reste autoritatif sur le COMPTE exact — il
/// nous le rendra par `conversation:unread-updated` / `read-status:updated` —
/// mais aucun de ses allers-retours ne doit se voir : la pastille tombe ici,
/// dans le tour de boucle du geste.
///
/// Trois surfaces portent ce compteur, et le défaut historique était qu'aucun
/// appelant ne les touchait toutes les trois :
///
/// | Surface | Écriture | Ce qui restait faux sans elle |
/// |---|---|---|
/// | `ConversationSyncEngine` (cache GRDB + frontière `lastReadAt`) | `markConversationReadLocally` | la pastille revenait au prochain `reloadFromCache()` |
/// | `ConversationStore` (RAM, SoT de `userState`) | `.conversationMarkedRead` → `applyReadReceipt` | le store regreffait son `unreadCount` périmé sur la ligne à sa PROCHAINE republication, déclenchée par n'importe quelle mutation sur n'importe quelle AUTRE conversation |
/// | `NotificationCoordinator` (badge d'icône + widget) | `markConversationRead` | le badge d'icône gardait le compte jusqu'à un `read-status:updated` serveur — qui peut ne jamais venir sur une lecture partielle |
///
/// `ConversationViewModel.markAsRead` n'écrivait que les deux premières,
/// `NotificationActionHandler` et `WidgetActionFlusher` les trois mais chacun
/// avec sa propre copie du geste. D'où ce chokepoint : une seule définition de
/// « lue localement », et les trois surfaces bougent ensemble ou pas du tout.
///
/// Ce que ce type ne fait PAS, délibérément :
/// - **aucun appel réseau.** L'accusé de lecture serveur porte une exigence
///   d'exactitude (quels messages ont RÉELLEMENT été affichés — cf.
///   `docs/superpowers/specs/2026-07-24-read-exactness-design.md`) que le
///   compteur local n'a pas : dire aux autres « j'ai lu ton message » et
///   éteindre sa propre pastille sont deux décisions distinctes, et les
///   confondre a déjà produit les deux bugs symétriques (pastille qui reste,
///   accusé sur-déclaré). Les appelants dispatchent séparément.
/// - **rien sur la cloche** (`NotificationToastManager`). L'ouverture d'écran
///   passe déjà par `onConversationOpened` (`ConversationSocketHandler`) ; les
///   marquages SANS ouverture appellent `onConversationMarkedRead` eux-mêmes.
@MainActor
enum ConversationReadSignal {

    /// Éteint la pastille de `conversationId` sur les trois surfaces locales.
    /// Idempotent : rejouer le signal sur une conversation déjà lue ne produit
    /// aucune écriture visible.
    ///
    /// - Parameter syncEngine: le moteur à qui poser la frontière. Injecté par
    ///   les appelants qui en tiennent déjà un (`ConversationViewModel`), ce
    ///   qui garde leurs tests hors du singleton — et donc hors de GRDB.
    static func markReadLocally(
        _ conversationId: String,
        syncEngine: ConversationSyncEngineProviding = ConversationSyncEngine.shared
    ) {
        // 1. Badge d'icône + widget. Synchrone, et en premier : c'est la
        //    surface que l'utilisateur voit encore si l'app passe en
        //    arrière-plan dans la foulée du geste.
        NotificationCoordinator.shared.markConversationRead(conversationId)
        // 2. Lignes @Published de la liste + `ConversationStore`, via le bus
        //    applicatif. `ConversationListViewModel.observeMarkAsRead` est le
        //    seul abonné.
        NotificationCenter.default.post(name: .conversationMarkedRead, object: conversationId)
        // 3. Cache disque + frontière de lecture locale. Asynchrone (acteur
        //    GRDB) mais sans conséquence sur le rendu : les deux surfaces
        //    ci-dessus ont déjà rendu la ligne propre, et cette écriture-ci
        //    sert à ce qu'elle le RESTE au prochain instantané serveur.
        Task { await syncEngine.markConversationReadLocally(conversationId) }
    }
}
