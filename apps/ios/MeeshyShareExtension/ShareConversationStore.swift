import Foundation

/// Une conversation proposée comme destination de partage.
///
/// Value type sans dépendance UIKit : la vue n'a besoin que d'un nom, d'une
/// couleur d'accent et d'initiales. Aucune photo n'est affichée — ni
/// `recent_conversations` (dont `contactAvatar` porte un nom de symbole SF, pas
/// une URL) ni `conversation_snapshots` (aucun champ avatar) n'en transporte,
/// et télécharger des images dans un process plafonné n'entre pas dans le lot 1.
nonisolated struct ShareTarget: Identifiable, Equatable, Sendable {
    let id: String
    let displayName: String
    let accentColorHex: String
    let unreadCount: Int

    var initials: String { Self.initials(for: displayName) }

    static func initials(for name: String) -> String {
        let words = name.split(whereSeparator: \.isWhitespace)
        guard let first = words.first else { return "" }
        guard words.count > 1, let last = words.last else {
            return String(first.prefix(1)).uppercased()
        }
        return (String(first.prefix(1)) + String(last.prefix(1))).uppercased()
    }
}

/// Ce que l'écran de partage doit montrer.
///
/// Les deux états dégradés sont EXPLICITES et sans données : c'est ce qui rend
/// visible une session absente ou un App Group vide. L'ancien repli de contacts
/// fabriqués affichait au contraire une liste crédible par-dessus une lecture
/// morte, ce qui a masqué la panne pendant trois itérations d'audit.
/// La session est portée PAR le cas `.ready` — et non à côté de l'état — pour
/// qu'il soit impossible d'afficher une liste sans jeton pour l'envoyer. Sans
/// ça, le chemin d'envoi devait se garder contre une session absente et
/// renvoyer « différé » sans rien avoir persisté : un état inatteignable, mais
/// qui aurait menti à l'utilisateur le jour où il devenait atteignable.
nonisolated enum ShareScreenState: Equatable {
    case signedOut
    case noConversations
    case ready(session: ShareSession, targets: [ShareTarget])

    static func resolve(session: ShareSession?, targets: [ShareTarget]) -> ShareScreenState {
        guard let session else { return .signedOut }
        return targets.isEmpty ? .noConversations : .ready(session: session, targets: targets)
    }
}

/// Lecture des conversations depuis l'App Group.
///
/// **Il n'existe aucun jeu de données de repli.** Une lecture impossible produit
/// une liste vide, donc un état d'interface explicite. C'est la correction de
/// la cause racine : l'ancien repli `sampleContacts` affichait trois contacts
/// crédibles par-dessus une clé que personne n'écrivait, ce qui a rendu la
/// panne invisible pendant trois itérations d'audit.
nonisolated enum ShareConversationStore {

    /// Écrite par `WidgetDataManager.publishConversations`. Porte
    /// `conv.displayName` DÉJÀ résolu — indispensable pour les conversations
    /// directes, dont le titre canonique est nul.
    static let recentConversationsKey = "recent_conversations"

    /// Écrite par `WidgetDataManager.publishConversationSnapshots`. Sert
    /// UNIQUEMENT à enrichir (renommage local, non-lus) : son `title` est le
    /// titre serveur brut, nul en conversation directe, donc inutilisable comme
    /// source de noms.
    static let conversationSnapshotsKey = "conversation_snapshots"

    // MARK: - Miroirs de décodage
    //
    // Sous-ensembles stricts des payloads producteurs : les champs non listés
    // (timestamp, isPinned, type…) sont ignorés par `JSONDecoder`. Omettre
    // `timestamp` évite au passage d'avoir à répliquer la stratégie de date de
    // l'encodeur.

    private struct RecentConversation: Decodable {
        let id: String
        let contactName: String
        let accentColor: String
    }

    private struct ConversationSnapshot: Decodable {
        let customName: String?
        let unreadCount: Int?
    }

    // MARK: - Fusion (pure, testable)

    static func targets(recentsData: Data?, snapshotsData: Data?) -> [ShareTarget] {
        guard let recentsData,
              let recents = try? JSONDecoder().decode([RecentConversation].self, from: recentsData)
        else { return [] }

        let snapshots = decodeSnapshots(snapshotsData)

        return recents.map { recent in
            let snapshot = snapshots[recent.id]
            return ShareTarget(
                id: recent.id,
                displayName: displayName(for: recent, snapshot: snapshot),
                accentColorHex: recent.accentColor,
                unreadCount: snapshot?.unreadCount ?? 0
            )
        }
    }

    /// Des snapshots illisibles dégradent l'enrichissement, jamais la liste :
    /// mieux vaut des noms canoniques sans compteur qu'un écran vide.
    private static func decodeSnapshots(_ data: Data?) -> [String: ConversationSnapshot] {
        guard let data,
              let decoded = try? JSONDecoder().decode([String: ConversationSnapshot].self, from: data)
        else { return [:] }
        return decoded
    }

    /// Le renommage LOCAL prime sur le nom canonique — même règle que
    /// `WidgetDataManager.conversationToastPresentation`.
    private static func displayName(
        for recent: RecentConversation,
        snapshot: ConversationSnapshot?
    ) -> String {
        let custom = snapshot?.customName?.trimmingCharacters(in: .whitespacesAndNewlines)
        if let custom, !custom.isEmpty { return custom }
        return recent.contactName
    }

    // MARK: - Lecture réelle

    static func liveTargets() -> [ShareTarget] {
        let defaults = UserDefaults(suiteName: ShareSession.appGroupIdentifier)
        return targets(
            recentsData: defaults?.data(forKey: recentConversationsKey),
            snapshotsData: defaults?.data(forKey: conversationSnapshotsKey)
        )
    }
}
