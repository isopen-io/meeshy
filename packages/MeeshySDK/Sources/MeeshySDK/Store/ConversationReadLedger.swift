import Foundation
import Combine

// MARK: - Valeurs

/// Ce que le registre SAIT d'une conversation.
///
/// `serverLastReadAt` est une frontière de lecture **SERVEUR**, et le nom le
/// dit pour une raison : elle ne se compare qu'à une autre frontière serveur.
/// Confrontée à `Date()` — l'horloge de l'APPAREIL — elle rendrait un verdict
/// qui dépend de la dérive entre deux horloges : sur un téléphone en avance,
/// tout accusé de lecture serveur paraîtrait périmé, et la pastille ne
/// tomberait jamais.
public struct ConversationReadEntry: Sendable, Hashable {
    public var unreadCount: Int
    public var serverLastReadAt: Date?
    public var isMuted: Bool

    public init(unreadCount: Int = 0, serverLastReadAt: Date? = nil, isMuted: Bool = false) {
        self.unreadCount = max(0, unreadCount)
        self.serverLastReadAt = serverLastReadAt
        self.isMuted = isMuted
    }
}

/// Ce que le registre RESTITUE : l'entrée, plus le seul fait qui n'y est pas
/// stocké — « cette conversation est-elle celle que l'utilisateur regarde ? ».
///
/// `isOpen` est DÉRIVÉ de l'unique `openConversationId` du registre, jamais
/// recopié dans une entrée. C'est exactement la duplication que ce lot
/// supprime : deux gates « conversation ouverte » divergeaient
/// (`ConversationSyncEngine` et `MessageSocketManager`), et une troisième copie
/// par ligne aurait fait pire.
public struct ConversationReadState: Sendable, Hashable {
    public let conversationId: String
    public let unreadCount: Int
    public let serverLastReadAt: Date?
    public let isMuted: Bool
    public let isOpen: Bool
}

/// Une ligne d'instantané : ce qu'une liste (cache ou serveur) dit d'une
/// conversation en matière de lecture. Volontairement PLUS PAUVRE qu'une
/// `MeeshyConversation` — le registre n'a pas à connaître le titre, l'avatar
/// ni le dernier message pour compter des non-lus.
public struct ConversationReadRow: Sendable, Hashable {
    public let conversationId: String
    public let unreadCount: Int
    public let isMuted: Bool

    public init(conversationId: String, unreadCount: Int, isMuted: Bool) {
        self.conversationId = conversationId
        self.unreadCount = unreadCount
        self.isMuted = isMuted
    }

    public init(_ conversation: MeeshyConversation) {
        self.init(
            conversationId: conversation.id,
            unreadCount: conversation.userState.unreadCount,
            isMuted: conversation.userState.isMuted
        )
    }
}

/// D'où viennent les lignes d'un instantané — **le discriminant qui manquait**.
///
/// Le coordinateur de badge distinguait jusqu'ici `registerConversations`
/// (n'écrit que les ids inconnus) de `reconcileConversationUnreads` (écrase
/// tout), c'est-à-dire par le NOM DE L'APPELANT. Résultat : un retour au
/// premier plan après une lecture faite sur un AUTRE appareil ne remettait
/// jamais le badge à zéro — le seul chemin autoritaire ne tournait qu'après un
/// `fullSync`. La question juste n'est pas « qui appelle ? » mais **« ces
/// lignes ont-elles été lues au serveur ? »**.
public enum ConversationReadSource: Sendable, Hashable {
    /// Lignes relues du CACHE local (démarrage à froid, republication de
    /// liste). Elles ne savent rien de plus que le registre : elles SÈMENT les
    /// conversations inconnues et rafraîchissent l'état muet, sans jamais
    /// écraser un compteur déjà suivi.
    case cache
    /// Lignes issues d'une lecture SERVEUR fraîche (`fullSync`, delta,
    /// `GET /conversations`). Elles sont autoritaires sur le compteur.
    case server
}

/// L'entrée UNIQUE du registre : tout ce qui change un non-lu sur cet appareil
/// est l'une de ces formes, et aucune autre.
///
/// **Quatre nomment UNE conversation** et passent par la précédence
/// (`ConversationReadPrecedence.resolve`) : `serverUnread`, `serverReceipt`,
/// `localMarkRead`, `localMarkUnread`.
///
/// **Trois sont de niveau REGISTRE**, et ne touchent aucune entrée par la
/// précédence : `localOpen` déplace un curseur unique, `snapshot` redéfinit
/// l'ensemble des conversations connues, `forget` en retire une.
public enum ConversationReadEvent: Sendable, Hashable {
    /// `conversation:unread-updated` — le compteur servi, par destinataire.
    case serverUnread(conversationId: String, unreadCount: Int)
    /// `read-status:updated` (`type == "read"`, par NOUS) — l'accusé de lecture
    /// et son compteur, qui voyagent ensemble.
    case serverReceipt(conversationId: String, unreadCount: Int, lastReadAt: Date)
    /// L'écran de conversation s'ouvre (`conversationId`) ou se ferme (`nil`).
    case localOpen(conversationId: String?)
    /// Geste « marquer comme lu » / ouverture : optimistic update.
    case localMarkRead(conversationId: String)
    /// Geste « marquer comme non lu » : optimistic update symétrique.
    case localMarkUnread(conversationId: String)
    /// Une liste entière de conversations, et d'où elle vient.
    case snapshot(rows: [ConversationReadRow], source: ConversationReadSource)
    /// Cette conversation n'est plus à moi : quittée, supprimée, bannissement.
    ///
    /// **La septième forme, et il faut dire pourquoi les six autres ne
    /// suffisaient pas** : ce n'est pas un événement de LECTURE. Aucun
    /// compteur n'est servi, aucune frontière n'avance — la LIGNE disparaît, et
    /// son non-lu avec elle. L'exprimer par un `snapshot` obligerait chaque
    /// appelant à recomposer la liste entière pour retirer une entrée, ce qui
    /// est à la fois coûteux et faux (il ne la connaît pas forcément entière).
    /// Comme `snapshot`, elle est de niveau REGISTRE.
    case forget(conversationId: String)
}

// MARK: - Précédence

/// **La précédence du non-lu, écrite UNE fois.**
///
/// Elle vivait en cinq copies qui ne disaient pas la même chose : le cache
/// GRDB, le `ConversationStore`, `vm.conversations`, `vm.groupedConversations`
/// et `NotificationCoordinator` — plus trois formules de « total » et deux
/// gates « conversation ouverte ». Ce type est la seule règle ; tout le reste
/// en est une projection.
///
/// Les quatre rangs, dans l'ordre où ils s'appliquent :
///
/// 1. **Conversation OUVERTE ⇒ 0, quoi qu'il arrive.** L'utilisateur la
///    REGARDE : tout compteur non nul est un mensonge visuel, y compris s'il
///    vient du serveur — le gateway diffuse le même compte à tous les
///    destinataires sans savoir qui lit.
/// 2. **Un accusé de lecture SERVEUR est MONOTONE.** Un `serverReceipt` dont
///    le `lastReadAt` n'est pas STRICTEMENT postérieur à celui déjà connu est
///    un rejeu, et il est jeté EN ENTIER — son compteur avec lui. C'est la
///    seule comparaison de dates du registre, et elle oppose deux horloges
///    SERVEUR. `Date()` n'y entre jamais.
/// 3. **Hors conversation ouverte, le compteur SERVI gagne sur le local.** Un
///    `serverUnread` ne porte pas de date et s'applique tel quel : le gateway
///    l'émet par destinataire, il DÉCRIT l'état de ce lecteur.
/// 4. **Un geste LOCAL est un optimistic update.** Il pose sa valeur dans le
///    tour de boucle du geste et cède au prochain événement serveur. C'est
///    l'asymétrie voulue : l'utilisateur ne doit jamais attendre un
///    aller-retour pour voir sa pastille tomber.
public enum ConversationReadPrecedence {

    /// Applique un événement NOMMANT UNE CONVERSATION à son entrée.
    ///
    /// `localOpen` et `snapshot` rendent `current` inchangé : ils ne nomment
    /// pas une conversation unique et se résolvent au niveau du registre. Les
    /// laisser passer ici silencieusement serait un piège ; le `switch` les
    /// nomme donc explicitement.
    public static func resolve(
        _ current: ConversationReadEntry,
        event: ConversationReadEvent,
        isOpen: Bool
    ) -> ConversationReadEntry {
        var next = current
        switch event {
        case .serverUnread(_, let unreadCount):
            next.unreadCount = max(0, unreadCount)

        case .serverReceipt(_, let unreadCount, let lastReadAt):
            // Rang 2 — monotonie. `map` puis `?? true` : une première frontière
            // est toujours plus récente que l'absence de frontière.
            let isNewer = current.serverLastReadAt.map { lastReadAt > $0 } ?? true
            guard isNewer else { return current }
            next.serverLastReadAt = lastReadAt
            next.unreadCount = max(0, unreadCount)

        case .localMarkRead:
            next.unreadCount = 0

        case .localMarkUnread:
            // Le serveur reste autoritaire sur le compte EXACT ; on pose ≥ 1
            // pour que la pastille apparaisse tout de suite. Et on EFFACE la
            // frontière serveur : la garder ferait reconnaître le prochain
            // accusé rejoué comme périmé, et le geste serait sans effet.
            next.serverLastReadAt = nil
            next.unreadCount = max(1, current.unreadCount)

        case .localOpen, .snapshot, .forget:
            return current
        }

        // Rang 1, appliqué EN DERNIER et sans exception : il écrase tout ce que
        // les rangs inférieurs viennent de décider. Posé en premier, un
        // `serverUnread` arrivé juste après l'aurait annulé.
        if isOpen { next.unreadCount = 0 }
        return next
    }
}

// MARK: - Registre

/// **Le registre de lecture : une seule source, un seul total.**
///
/// Non-acteur, et c'est délibéré : le badge d'icône, la pastille « retour » et
/// le menu flottant lisent le total SYNCHRONEMENT, dans le tour de boucle du
/// rendu. Un acteur imposerait un `await` à chaque lecture, donc une frame où
/// la surface affiche la valeur d'AVANT — exactement le scintillement que ce
/// lot supprime. L'état est protégé par une file sérielle, même patron que
/// `ConversationSyncEngine`.
public final class ConversationReadLedger: @unchecked Sendable {

    public static let shared = ConversationReadLedger()

    private let stateQueue = DispatchQueue(label: "me.meeshy.read-ledger.state")
    private var entries: [String: ConversationReadEntry] = [:]
    private var _openConversationId: String?
    private let _changes = CurrentValueSubject<Void, Never>(())

    public init() {}

    // MARK: Lecture

    /// **Le seul openConversationId.** `ConversationSyncEngine` et
    /// `MessageSocketManager.activeConversationId` en tenaient chacun un, et
    /// ils divergeaient — d'où deux réponses à « la conversation est-elle
    /// ouverte ? » selon le porteur interrogé.
    public var openConversationId: String? {
        stateQueue.sync { _openConversationId }
    }

    /// Émet à l'abonnement (sémantique `CurrentValueSubject`) puis à chaque
    /// mutation. Le registre ne publie PAS un total : il y en a plusieurs, et
    /// chacun est une projection que l'abonné calcule lui-même avec les bornes
    /// qui le concernent. Publier un total, c'est en choisir un.
    public var changes: AnyPublisher<Void, Never> { _changes.eraseToAnyPublisher() }

    public func state(for conversationId: String) -> ConversationReadState? {
        stateQueue.sync {
            guard let entry = entries[conversationId] else { return nil }
            return ConversationReadState(
                conversationId: conversationId,
                unreadCount: entry.unreadCount,
                serverLastReadAt: entry.serverLastReadAt,
                isMuted: entry.isMuted,
                isOpen: conversationId == _openConversationId
            )
        }
    }

    /// Projection PAR CONVERSATION du compteur, pour les surfaces qui rendent
    /// une LIGNE plutôt qu'un agrégat (une conversation muette garde sa
    /// pastille : seul le total la tait). Aucune borne ici — ce n'est pas un
    /// total, c'est l'inventaire.
    public func counts() -> [String: Int] {
        stateQueue.sync { entries.mapValues { max(0, $0.unreadCount) } }
    }

    /// **Le total UNIQUE**, et ses deux seules bornes. Trois formules
    /// coexistaient — le moteur excluait la conversation ouverte, le
    /// coordinateur les muettes, le ViewModel n'excluait rien — si bien que
    /// trois surfaces affichaient trois nombres pour un même état.
    ///
    /// Les deux étiquettes sont OBLIGATOIRES, sans valeur par défaut : une
    /// surface qui appelle ce total DÉCLARE ce qu'elle compte. Un défaut
    /// ferait de l'oubli le cas nominal, et c'est de là que venaient les trois
    /// formules.
    ///
    /// - `excludingOpen` : la conversation affichée. Vrai pour toute surface
    ///   INTER-conversations (badge d'icône, pastille « retour », widget).
    /// - `excludingMuted` : les conversations muettes gardent leur pastille de
    ///   ligne mais ne doivent pas gonfler l'agrégat qu'on les a mises en
    ///   sourdine pour faire taire.
    public func total(excludingOpen: Bool, excludingMuted: Bool) -> Int {
        stateQueue.sync {
            let openId = _openConversationId
            return entries.reduce(0) { acc, element in
                if excludingOpen, element.key == openId { return acc }
                if excludingMuted, element.value.isMuted { return acc }
                // Badge counts conversations (not summing messages) — D-L1 #7236
                return (element.value.unreadCount > 0) ? acc + 1 : acc
            }
        }
    }

    // MARK: Écriture

    /// L'entrée UNIQUE. Rend l'entrée telle qu'elle était AVANT l'événement
    /// pour la conversation qu'il nomme — `nil` pour `localOpen` / `snapshot`,
    /// qui n'en nomment pas une, et `nil` pour un `forget` visant une
    /// conversation inconnue (l'appelant y lit « rien n'a bougé », ce dont il a
    /// besoin pour ne pas réveiller un débounce pour rien).
    ///
    /// **C'est aussi l'affordance de ROLLBACK**, et elle ne demande AUCUN cas
    /// de plus : un `markAsRead` refusé par le serveur (4xx) se défait en
    /// réappliquant `.serverUnread` avec le compteur rendu ici. Le rollback
    /// n'est donc pas un mode du registre — c'est une écriture de plus, qui
    /// passe par la même précédence que toutes les autres.
    @discardableResult
    public func apply(_ event: ConversationReadEvent) -> ConversationReadEntry? {
        let previous: ConversationReadEntry? = stateQueue.sync { () -> ConversationReadEntry? in
            switch event {
            case .localOpen(let conversationId):
                _openConversationId = conversationId
                // Ouvrir, c'est lire : la ligne tombe à zéro DANS CE TOUR DE
                // BOUCLE, sans attendre l'accusé. La refermer ne ressuscite
                // rien — le compteur reviendra du serveur s'il y a lieu.
                if let conversationId, entries[conversationId] != nil {
                    entries[conversationId]?.unreadCount = 0
                }
                return nil

            case .snapshot(let rows, let source):
                applySnapshotLocked(rows: rows, source: source)
                return nil

            case .forget(let conversationId):
                let before = entries.removeValue(forKey: conversationId)
                if _openConversationId == conversationId { _openConversationId = nil }
                return before

            case .serverUnread(let conversationId, _),
                 .serverReceipt(let conversationId, _, _),
                 .localMarkRead(let conversationId),
                 .localMarkUnread(let conversationId):
                let before = entries[conversationId] ?? ConversationReadEntry()
                entries[conversationId] = ConversationReadPrecedence.resolve(
                    before,
                    event: event,
                    isOpen: conversationId == _openConversationId
                )
                return before
            }
        }
        _changes.send(())
        return previous
    }

    /// Purge au logout — isolation des comptes sur un même appareil.
    public func reset() {
        stateQueue.sync {
            entries.removeAll()
            _openConversationId = nil
        }
        _changes.send(())
    }

    // MARK: Interne

    /// Appelée SOUS `stateQueue` — jamais depuis l'extérieur.
    private func applySnapshotLocked(rows: [ConversationReadRow], source: ConversationReadSource) {
        var known: [String: ConversationReadEntry] = [:]
        for row in rows {
            var entry = entries[row.conversationId] ?? ConversationReadEntry()
            // L'état MUET vient toujours de l'instantané, quelle que soit sa
            // source : c'est une préférence, pas un compteur, et elle bascule
            // sur n'importe quelle liste republiée.
            entry.isMuted = row.isMuted
            let isTracked = entries[row.conversationId] != nil
            if source == .server || !isTracked {
                entry.unreadCount = max(0, row.unreadCount)
            }
            if row.conversationId == _openConversationId {
                entry.unreadCount = 0
            }
            known[row.conversationId] = entry
        }
        // Un instantané dit aussi QUI existe : une conversation qui n'y figure
        // plus a été quittée, supprimée ou bannie, et son non-lu ne doit plus
        // peser sur aucun agrégat. Les instantanés de CACHE, eux, peuvent être
        // partiels (une page) — ils n'ont pas le droit de retirer.
        if source == .server {
            entries = known
        } else {
            for (id, entry) in known { entries[id] = entry }
        }
    }
}
