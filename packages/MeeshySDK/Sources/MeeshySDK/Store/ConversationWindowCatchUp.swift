import Foundation

/// **Ce qu'une fenêtre SANS SOCKET a emporté, et que le retour doit rattraper.**
///
/// La liste est nommée par la PROPRIÉTÉ qu'elle porte — ce que la fenêtre a
/// emporté — jamais par la branche où chaque geste est né. C'est la leçon de
/// #20336 : `CATCH_UP_PERSONAL_FAMILIES` annonçait une sous-catégorie, et un lot
/// qui ajoutait une famille d'une AUTRE sorte n'y trouvait pas sa place, donc la
/// posait dans une seule branche.
///
/// Le dépôt a payé exactement cela ici (#20341). `wireCatchUp` portait DEUX
/// branches pour une MÊME fenêtre :
///
/// | branche | ce qu'elle rejouait |
/// |---|---|
/// | `didReconnect` | l'outbox · les catégories · les préférences servies |
/// | première hydratation (#18916) | les préférences servies **seules** |
///
/// et `didReconnect` ne part PAS au premier connect
/// (`MessageSocketManager.handleConnectionEstablished` ne l'émet que
/// `if wasReconnect`). #18916 avait nommé la bonne cause et n'avait repris qu'UN
/// des trois gestes de la branche qu'il citait — faute de liste à itérer.
///
/// ## Ce que la refonte change, et pourquoi c'est plus qu'un déplacement
///
/// La fenêtre que ces gestes rattrapent est « le socket n'écoutait pas ». La
/// PREMIÈRE connexion en est un cas, pas une exception : la fenêtre va du
/// lancement de l'app à l'entrée dans les rooms. Le déclencheur juste est donc
/// `didConnect` — toute connexion, la première comprise — et non `didReconnect`,
/// qui décrit un sous-ensemble. Un seul chemin pour une seule fenêtre : il n'y a
/// plus de seconde branche d'où un geste puisse manquer.
///
/// ## Le SEUL prédicat qui sépare encore les deux branches
///
/// Reste un geste qui ne peut pas se jouer n'importe quand :
/// `requiresHydratedStore`. Il porte sa raison, et elle n'est pas de confort —
/// voir son doc-comment : jouer ce geste trop tôt ne le RETARDE pas, il PERD
/// ses lignes.
enum ConversationWindowCatchUp: CaseIterable, Sendable {
    /// Les mutations locales de la fenêtre — épingle, sourdine, archive,
    /// `deleteForUser` — que le réseau n'a pas pu emporter.
    ///
    /// **Ce geste est celui qui manquait le plus cher**, et la raison est que la
    /// file est PERSISTÉE : « Persisted in SQLite so the queue survives app
    /// kill » (`ConversationStateOutbox`). La fenêtre d'une session se rattrape
    /// donc à la SUIVANTE, et sans ce geste au premier connect, elle ne se
    /// rattrapait qu'au premier accroc réseau ou au premier aller-retour en
    /// arrière-plan (`BackgroundTransitionCoordinator`, le seul autre appelant
    /// de `flushOutbox` du dépôt). Une sourdine posée hors ligne, l'app tuée,
    /// puis relancée sur un réseau sain restait LOCALE : l'appareil la montrait
    /// comme acquise, le serveur ne l'avait jamais reçue, et les notifications
    /// de la conversation continuaient d'arriver.
    case outbox

    /// Les catégories créées, renommées ou SUPPRIMÉES depuis un autre appareil
    /// pendant la fenêtre.
    ///
    /// Le chemin de démarrage à froid relit déjà le serveur
    /// (`ConversationListViewModel.loadCategories` → `revalidateCategories`),
    /// mais il le fait AVANT l'entrée dans les rooms : ce que la fenêtre entre
    /// cette lecture et l'abonnement a emporté n'était rattrapé par personne.
    /// Le coût est une relecture de catégories par connexion — le même prix que
    /// les familles de #20336 paient, et pour la même raison.
    case categories

    /// Les préférences par conversation changées ailleurs pendant la fenêtre
    /// (#18916), relues depuis un filigrane serveur persisté par compte
    /// (#19307).
    case servedPreferences

    /// Ce geste exige-t-il que le store porte déjà ses conversations ?
    ///
    /// **C'est le seul prédicat qui sépare les deux branches, et il ne décrit
    /// pas une préférence mais une PERTE.** `applyServedPreferences` ignore une
    /// conversation que le store ne connaît pas encore, pendant que le filigrane
    /// avance sur les lignes SERVIES : jouer `servedPreferences` avant
    /// l'hydratation ne le retarde pas d'un tour — il consomme les lignes, les
    /// jette, et déclare la fenêtre rattrapée. Les préférences seraient perdues
    /// jusqu'au prochain changement, c'est-à-dire potentiellement pour toujours.
    ///
    /// Les deux autres gestes n'ont pas cette propriété : ils ne lisent rien du
    /// store (`flushOutbox` part de la file, `categories` d'une lecture serveur
    /// qui REMPLACE), donc ils se jouent dès que le socket est là.
    var requiresHydratedStore: Bool {
        switch self {
        case .outbox, .categories: return false
        case .servedPreferences: return true
        }
    }

    /// Ce qu'une connexion de socket rattrape AUSSITÔT — la fenêtre vient de se
    /// fermer, et le réseau est CONFIRMÉ (c'est ce qui rend `flushOutbox(force:)`
    /// légitime ici : sa documentation réserve le contournement du backoff aux
    /// sites « where network availability is confirmed »).
    ///
    /// `hydrated` dit si le store porte déjà ses conversations : à une
    /// RECONNEXION il les porte toujours, donc les trois gestes partent ; à la
    /// PREMIÈRE connexion il peut ne rien porter encore, et le geste qui
    /// l'exige est différé à `onFirstHydration(socketConnected:)`.
    static func onConnect(storeHydrated hydrated: Bool) -> [ConversationWindowCatchUp] {
        allCases.filter { hydrated || !$0.requiresHydratedStore }
    }

    /// Ce que la première hydratation non vide d'une activation rattrape — et
    /// seulement SI le socket est déjà connecté.
    ///
    /// **La condition n'est pas une optimisation, c'est ce qui rend la
    /// couverture EXACTE.** Les deux événements arrivent dans un ordre que
    /// personne ne contrôle : au démarrage à froid la liste vient du cache
    /// DISQUE, donc l'hydratation précède souvent la connexion. Sans la
    /// condition, l'ordre « hydratation puis connexion » jouerait
    /// `servedPreferences` deux fois ; avec elle, chaque geste part exactement
    /// une fois, quel que soit l'ordre — et c'est cette propriété que le
    /// cliquet mesure.
    ///
    /// Elle ne porte QUE les gestes qui exigent le store : les deux autres sont
    /// partis à la connexion, et les rejouer ici ferait partir un
    /// `flushOutbox(force:)` de plus par démarrage à froid.
    ///
    /// **Et c'est pourquoi `categories` n'est PAS ici** : ce déclencheur ne
    /// franchit jamais son prédicat pour un compte SANS conversation
    /// (`listPublisher()` est adossé à un `CurrentValueSubject`, et
    /// `.first { !$0.isEmpty }` ne tire pas sur une liste vide), alors que des
    /// catégories créées sur le web existent très bien sans aucune
    /// conversation. Un geste de catégories porté par ce portier-là serait muet
    /// pour cette population entière.
    static func onFirstHydration(socketConnected connected: Bool) -> [ConversationWindowCatchUp] {
        connected ? allCases.filter(\.requiresHydratedStore) : []
    }
}
