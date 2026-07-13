import Foundation
import Contacts
import MeeshySDK

// MARK: - Device Contact

/// Contact du carnet d'adresses réduit aux champs utiles au matching.
struct DeviceContact: Sendable, Equatable {
    let displayName: String?
    let phoneNumbers: [String]
    let emails: [String]
}

// MARK: - Protocol

protocol ContactSyncProviding: Sendable {
    func authorizationStatus() -> CNAuthorizationStatus
    func requestAccess() async -> Bool
    /// Demande l'accès si nécessaire, lit le carnet en arrière-plan et renvoie
    /// les utilisateurs Meeshy présents dans les contacts de l'utilisateur.
    func findFriendsFromContacts() async throws -> [ContactMatch]
}

enum ContactSyncError: LocalizedError {
    case accessDenied

    var errorDescription: String? {
        switch self {
        case .accessDenied:
            return String(localized: "contacts.sync.access-denied",
                          defaultValue: "Accès aux contacts refusé. Tu peux l'activer dans Réglages.")
        }
    }
}

// MARK: - Service

final class ContactSyncService: ContactSyncProviding, @unchecked Sendable {
    static let shared = ContactSyncService()

    private let store: CNContactStore
    private let matchService: ContactMatchServiceProviding
    private let maxContactsPerSync: Int

    init(
        store: CNContactStore = CNContactStore(),
        matchService: ContactMatchServiceProviding = ContactMatchService.shared,
        maxContactsPerSync: Int = 2000
    ) {
        self.store = store
        self.matchService = matchService
        self.maxContactsPerSync = maxContactsPerSync
    }

    func authorizationStatus() -> CNAuthorizationStatus {
        CNContactStore.authorizationStatus(for: .contacts)
    }

    func requestAccess() async -> Bool {
        switch authorizationStatus() {
        case .authorized:
            return true
        case .denied, .restricted:
            return false
        default:
            // .notDetermined — et .limited (iOS 18+, hors plancher iOS 16) où
            // requestAccess répond true immédiatement avec l'ensemble limité.
            return await Self.requestContactsPermission(store: store)
        }
    }

    func findFriendsFromContacts() async throws -> [ContactMatch] {
        guard await requestAccess() else { throw ContactSyncError.accessDenied }

        let contacts = try await Self.fetchDeviceContacts(store: store)
        let entries = contacts
            .filter { !$0.phoneNumbers.isEmpty || !$0.emails.isEmpty }
            .prefix(maxContactsPerSync)
            .map { ContactMatchEntry(displayName: $0.displayName,
                                     phoneNumbers: $0.phoneNumbers,
                                     emails: $0.emails) }

        guard !entries.isEmpty else { return [] }

        let response = try await matchService.match(
            ContactMatchRequest(contacts: Array(entries), defaultCountry: Self.deviceRegionCode())
        )
        return response.matches
    }

    // MARK: - Off-main-actor permission & fetch

    /// Demande la permission Contacts HORS de tout acteur.
    ///
    /// Même doctrine que `AVAudioSession.requestMicrophonePermission` :
    /// `CNContactStore.requestAccess` rappelle sur une queue TCC hors main.
    /// Sous `defaultIsolation(MainActor)`, un closure littéral hériterait de
    /// `@MainActor` et son check d'exécuteur traperait (`EXC_BREAKPOINT`) à
    /// l'entrée du callback. Le helper `nonisolated` confine le callback à un
    /// `resume` de continuation — aucun accès acteur, aucun check inséré.
    nonisolated static func requestContactsPermission(store: CNContactStore) async -> Bool {
        await withCheckedContinuation { continuation in
            let completion: @Sendable (Bool, Error?) -> Void = { granted, _ in
                continuation.resume(returning: granted)
            }
            store.requestAccess(for: .contacts, completionHandler: completion)
        }
    }

    /// Énumère le carnet d'adresses sur une queue utilitaire — jamais sur le
    /// MainActor : `enumerateContacts` est synchrone et peut parcourir des
    /// milliers d'entrées.
    nonisolated static func fetchDeviceContacts(store: CNContactStore) async throws -> [DeviceContact] {
        try await withCheckedThrowingContinuation { continuation in
            DispatchQueue.global(qos: .userInitiated).async {
                let keys = [
                    CNContactGivenNameKey,
                    CNContactFamilyNameKey,
                    CNContactPhoneNumbersKey,
                    CNContactEmailAddressesKey
                ] as [CNKeyDescriptor]
                let request = CNContactFetchRequest(keysToFetch: keys)
                var results: [DeviceContact] = []
                do {
                    try store.enumerateContacts(with: request) { contact, _ in
                        let name = [contact.givenName, contact.familyName]
                            .filter { !$0.isEmpty }
                            .joined(separator: " ")
                        results.append(DeviceContact(
                            displayName: name.isEmpty ? nil : name,
                            phoneNumbers: contact.phoneNumbers.map { $0.value.stringValue },
                            emails: contact.emailAddresses.map { $0.value as String }
                        ))
                    }
                    continuation.resume(returning: results)
                } catch {
                    continuation.resume(throwing: error)
                }
            }
        }
    }

    nonisolated static func deviceRegionCode() -> String? {
        if #available(iOS 16, *) {
            return Locale.current.region?.identifier
        }
        return Locale.current.regionCode
    }
}
