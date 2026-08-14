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

public struct DirectorySyncRequest: Encodable, Sendable {
    public let contacts: [ContactMatchEntry]
    public let defaultCountry: String?
    public let mode: DirectorySyncMode

    public init(
        contacts: [ContactMatchEntry],
        defaultCountry: String? = nil,
        mode: DirectorySyncMode = .replace
    ) {
        self.contacts = contacts
        self.defaultCountry = defaultCountry
        self.mode = mode
    }
}

public struct DirectorySyncResult: Decodable, Sendable, Equatable {
    public let totalContacts: Int
    public let processedContacts: Int
    public let syncedCount: Int
    public let matchedCount: Int
    public let removedCount: Int

    public init(
        totalContacts: Int,
        processedContacts: Int,
        syncedCount: Int,
        matchedCount: Int,
        removedCount: Int
    ) {
        self.totalContacts = totalContacts
        self.processedContacts = processedContacts
        self.syncedCount = syncedCount
        self.matchedCount = matchedCount
        self.removedCount = removedCount
    }
}

public struct DirectoryClearResult: Decodable, Sendable, Equatable {
    public let removedCount: Int

    public init(removedCount: Int) {
        self.removedCount = removedCount
    }
}
