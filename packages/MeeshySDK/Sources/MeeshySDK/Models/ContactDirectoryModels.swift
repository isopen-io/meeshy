import Foundation

// MARK: - Répertoire (carnet d'adresses persisté)

/// Une entrée du répertoire telle que la gateway la conserve.
///
/// `isOnMeeshy` est la seule chose que l'UI a besoin de lire pour choisir
/// entre « Lui écrire » (le contact a un compte) et « Inviter ».
public struct DirectoryContact: Codable, Sendable, Identifiable, Equatable, CacheIdentifiable {
    public let id: String
    public let contactKey: String
    public let displayName: String?
    public let phoneNumbers: [String]
    public let emails: [String]
    public let usernames: [String]
    public let isOnMeeshy: Bool
    public let matchedBy: String?
    public let matchedAt: Date?
    public let lastSyncedAt: Date?
    public let matchedUser: MatchedContactUser?

    public init(
        id: String,
        contactKey: String,
        displayName: String?,
        phoneNumbers: [String] = [],
        emails: [String] = [],
        usernames: [String] = [],
        isOnMeeshy: Bool,
        matchedBy: String? = nil,
        matchedAt: Date? = nil,
        lastSyncedAt: Date? = nil,
        matchedUser: MatchedContactUser? = nil
    ) {
        self.id = id
        self.contactKey = contactKey
        self.displayName = displayName
        self.phoneNumbers = phoneNumbers
        self.emails = emails
        self.usernames = usernames
        self.isOnMeeshy = isOnMeeshy
        self.matchedBy = matchedBy
        self.matchedAt = matchedAt
        self.lastSyncedAt = lastSyncedAt
        self.matchedUser = matchedUser
    }

    /// Nom à afficher : celui du carnet d'adresses d'abord — c'est ainsi que
    /// l'utilisateur connaît la personne — puis l'identité de son compte
    /// Meeshy, puis le premier identifiant disponible.
    public var resolvedName: String {
        if let displayName, !displayName.isEmpty { return displayName }
        if let user = matchedUser {
            let composed = [user.firstName, user.lastName]
                .compactMap { $0 }
                .filter { !$0.isEmpty }
                .joined(separator: " ")
            if let display = user.displayName, !display.isEmpty { return display }
            if !composed.isEmpty { return composed }
            return "@\(user.username)"
        }
        return phoneNumbers.first ?? emails.first ?? usernames.first ?? ""
    }

    /// Identifiant secondaire affiché sous le nom (pseudo Meeshy si le contact
    /// a un compte, sinon le numéro ou l'email du carnet).
    public var subtitle: String? {
        if let user = matchedUser { return "@\(user.username)" }
        return phoneNumbers.first ?? emails.first
    }

    /// Cible d'invitation SMS pour un contact hors plateforme.
    public var invitablePhoneNumber: String? { phoneNumbers.first }

    /// Vue « rapprochement » d'une entrée de répertoire, pour les surfaces qui
    /// affichent des `ContactMatch` (Découvrir). `nil` quand le contact n'a pas
    /// de compte Meeshy — il n'y a alors rien à rapprocher.
    public var asContactMatch: ContactMatch? {
        guard let matchedUser else { return nil }
        return ContactMatch(
            user: matchedUser,
            matchedBy: matchedBy ?? "phone",
            contactDisplayName: displayName
        )
    }
}

/// Filtre serveur du répertoire.
public enum DirectoryFilter: String, Sendable, CaseIterable {
    /// Tout le répertoire.
    case all
    /// Uniquement les contacts qui ont un compte Meeshy.
    case meeshy
    /// Uniquement ceux qui restent à inviter.
    case invitable
}

/// Mode de synchronisation.
public enum DirectorySyncMode: String, Encodable, Sendable {
    /// N'efface jamais rien — pour un envoi partiel.
    case merge
    /// Purge les entrées absentes du lot — pour une synchronisation complète.
    case replace
}

/// Une requête de synchronisation. Un carnet de taille arbitraire part en
/// LOTS : les deux champs optionnels ci-dessous portent le contrat de lot.
///
/// Aucune `CodingKeys` ici — l'encodage synthétisé écrit les clés en camelCase,
/// exactement ce qu'attend la route, et il OMET les optionnels nuls
/// (`encodeIfPresent`). Une gateway antérieure au contrat de lots ne voit donc
/// littéralement aucun champ nouveau tant que le client n'envoie qu'un lot.
///
/// `mode` ne fait plus partie de l'ENCODAGE (#4163) : il choisit le VERBE
/// — `PUT` remplace, `PATCH` fusionne — et le corps n'a plus à le porter. Il
/// reste sur ce type parce que c'est l'appelant qui décide, et qu'un service
/// qui devinerait le verbe depuis le contenu se tromperait sur le lot vide.
public struct DirectorySyncRequest: Encodable, Sendable {
    public let contacts: [ContactMatchEntry]
    public let defaultCountry: String?
    public let mode: DirectorySyncMode
    /// Jeton de la synchronisation en cours : l'horloge SERVEUR renvoyée par le
    /// PREMIER lot, répétée à l'identique sur tous les suivants. Sa présence
    /// bascule le serveur en upserts `merge` — jamais de purge intermédiaire.
    /// `nil` sur le premier lot, qui n'a encore aucun jeton à répéter.
    public let syncStartedAt: String?
    /// `true` sur le DERNIER lot seulement : le serveur purge alors ce que
    /// cette synchronisation n'a pas touché (`lastSyncedAt < syncStartedAt`),
    /// au lieu de comparer au seul lot reçu. `nil` partout ailleurs.
    public let isFinalBatch: Bool?

    /// `mode` est EXCLU de l'encodage : il porte le verbe, pas le corps.
    private enum CodingKeys: String, CodingKey {
        case contacts, defaultCountry, syncStartedAt, isFinalBatch
    }

    public init(
        contacts: [ContactMatchEntry],
        defaultCountry: String? = nil,
        mode: DirectorySyncMode = .replace,
        syncStartedAt: String? = nil,
        isFinalBatch: Bool? = nil
    ) {
        self.contacts = contacts
        self.defaultCountry = defaultCountry
        self.mode = mode
        self.syncStartedAt = syncStartedAt
        self.isFinalBatch = isFinalBatch
    }
}

public struct DirectorySyncResult: Decodable, Sendable, Equatable {
    public let totalContacts: Int
    public let processedContacts: Int
    public let syncedCount: Int
    public let matchedCount: Int
    public let removedCount: Int
    /// Horloge SERVEUR prise à la réception de la requête, AVANT tout upsert :
    /// le jeton que les lots suivants doivent répéter. `nil` quand la gateway
    /// ne connaît pas le contrat de lots — le client retombe alors sur l'envoi
    /// unique historique plutôt que d'entamer une découpe qu'aucune purge par
    /// filigrane ne viendrait clore.
    public let syncStartedAt: String?
    /// Horloge SERVEUR APRÈS l'écriture — le filigrane de RELECTURE (#4163).
    ///
    /// Une synchronisation était toujours suivie d'une relecture COMPLÈTE du
    /// carnet. Repassé en `updatedSince`, ce filigrane ne rend que ce qui a
    /// bougé. `nil` quand la gateway ne le connaît pas encore.
    public let appliedAt: String?

    public init(
        totalContacts: Int,
        processedContacts: Int,
        syncedCount: Int,
        matchedCount: Int,
        removedCount: Int,
        syncStartedAt: String? = nil,
        appliedAt: String? = nil
    ) {
        self.totalContacts = totalContacts
        self.processedContacts = processedContacts
        self.syncedCount = syncedCount
        self.matchedCount = matchedCount
        self.removedCount = removedCount
        self.syncStartedAt = syncStartedAt
        self.appliedAt = appliedAt
    }
}

public struct DirectoryClearResult: Decodable, Sendable, Equatable {
    public let removedCount: Int

    public init(removedCount: Int) {
        self.removedCount = removedCount
    }
}
