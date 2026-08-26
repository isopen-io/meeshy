import Foundation
@preconcurrency import Contacts
import MeeshySDK

// MARK: - Device Contact

/// Contact du carnet d'adresses réduit aux champs utiles au matching.
struct DeviceContact: Sendable, Equatable {
    let displayName: String?
    let phoneNumbers: [String]
    let emails: [String]
    /// Pseudos portés par la fiche : surnom (`nickname`) et handles de profils
    /// sociaux. Troisième voie de rapprochement, après le numéro et l'email.
    let usernames: [String]

    /// `nonisolated` : la cible compile sous `SWIFT_DEFAULT_ACTOR_ISOLATION =
    /// MainActor`, or ce type est construit DANS le closure d'énumération du
    /// carnet, sur une queue utilitaire. Sans ce marqueur, l'init explicite
    /// hérite de `@MainActor` et chaque construction devient un appel
    /// cross-acteur (avertissement par contact énuméré).
    nonisolated init(displayName: String?, phoneNumbers: [String], emails: [String], usernames: [String] = []) {
        self.displayName = displayName
        self.phoneNumbers = phoneNumbers
        self.emails = emails
        self.usernames = usernames
    }
}

// MARK: - Protocol

protocol ContactSyncProviding: Sendable {
    func authorizationStatus() -> CNAuthorizationStatus
    func requestAccess() async -> Bool
    /// Demande l'accès si nécessaire, lit le carnet en arrière-plan et renvoie
    /// les utilisateurs Meeshy présents dans les contacts de l'utilisateur.
    /// Rapprochement PUR — rien n'est conservé côté serveur.
    func findFriendsFromContacts() async throws -> [ContactMatch]
    /// Lit le carnet et le SYNCHRONISE dans le répertoire persisté, pour qu'il
    /// soit consultable sans re-scanner l'appareil.
    func syncDirectory(mode: DirectorySyncMode) async throws -> DirectorySyncResult
}

extension ContactSyncProviding {
    func syncDirectory() async throws -> DirectorySyncResult {
        try await syncDirectory(mode: .replace)
    }
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
    // iOS 26.1 : deinit synthétisée ISOLÉE (SE-0466, isolation MainActor par
    // défaut) → double-free `pointer being freed was not allocated` (abrt)
    // au démontage hors d'une tâche (test XCTest synchrone, vue démontée).
    // Garde : MainActorDeinitSourceGuardTests / MeeshyUIDeinitSourceGuardTests.
    nonisolated deinit {}
    static let shared = ContactSyncService()

    private let store: CNContactStore
    private let matchService: ContactMatchServiceProviding
    private let directoryService: ContactDirectoryServiceProviding
    private let maxContactsPerSync: Int

    init(
        store: CNContactStore = CNContactStore(),
        matchService: ContactMatchServiceProviding = ContactMatchService.shared,
        directoryService: ContactDirectoryServiceProviding = ContactDirectoryService.shared,
        maxContactsPerSync: Int = 2000
    ) {
        self.store = store
        self.matchService = matchService
        self.directoryService = directoryService
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
        let entries = try await readEntries()
        guard !entries.isEmpty else { return [] }

        let response = try await matchService.match(
            ContactMatchRequest(contacts: entries, defaultCountry: Self.deviceRegionCode())
        )
        return response.matches
    }

    func syncDirectory(mode: DirectorySyncMode) async throws -> DirectorySyncResult {
        let entries = try await readEntries()
        return try await directoryService.sync(
            DirectorySyncRequest(
                contacts: entries,
                defaultCountry: Self.deviceRegionCode(),
                mode: mode
            )
        )
    }

    /// Demande l'accès, lit le carnet et le réduit aux fiches porteuses d'au
    /// moins un identifiant exploitable. Une fiche sans numéro, email ni pseudo
    /// ne peut être rapprochée de rien — l'envoyer ne ferait que gonfler la
    /// requête.
    private func readEntries() async throws -> [ContactMatchEntry] {
        guard await requestAccess() else { throw ContactSyncError.accessDenied }

        let contacts = try await Self.fetchDeviceContacts(store: store)
        return contacts
            .filter { !$0.phoneNumbers.isEmpty || !$0.emails.isEmpty || !$0.usernames.isEmpty }
            .prefix(maxContactsPerSync)
            .map {
                ContactMatchEntry(
                    displayName: $0.displayName,
                    phoneNumbers: $0.phoneNumbers,
                    emails: $0.emails,
                    usernames: $0.usernames
                )
            }
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
        // `nonisolated(unsafe)` : CNContactStore predates Swift concurrency and
        // isn't marked Sendable, but `enumerateContacts` below is Apple's own
        // documented contract for synchronous, off-main enumeration — the
        // exact cross-queue usage this dispatches to.
        nonisolated(unsafe) let store = store
        return try await withCheckedThrowingContinuation { continuation in
            DispatchQueue.global(qos: .userInitiated).async {
                let keys = [
                    CNContactGivenNameKey,
                    CNContactFamilyNameKey,
                    CNContactNicknameKey,
                    CNContactPhoneNumbersKey,
                    CNContactEmailAddressesKey,
                    CNContactSocialProfilesKey
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
                            emails: contact.emailAddresses.map { $0.value as String },
                            usernames: Self.pseudonyms(of: contact)
                        ))
                    }
                    continuation.resume(returning: results)
                } catch {
                    continuation.resume(throwing: error)
                }
            }
        }
    }

    /// Pseudos exploitables d'une fiche vCard : le surnom (`nickname`) et le
    /// handle de chaque profil social. La gateway écarte ensuite ceux qui ne
    /// respectent pas la charte username de la plateforme — ici on se contente
    /// de collecter sans juger.
    nonisolated static func pseudonyms(of contact: CNContact) -> [String] {
        var handles: [String] = []
        if !contact.nickname.isEmpty { handles.append(contact.nickname) }
        handles.append(contentsOf: contact.socialProfiles.compactMap { profile in
            let username = profile.value.username
            return username.isEmpty ? nil : username
        })
        return handles
    }

    nonisolated static func deviceRegionCode() -> String? {
        // No #available check needed — the app's deployment floor is iOS
        // 16.0 (project.yml), so `Locale.current.regionCode`'s pre-16
        // fallback was unreachable dead code.
        Locale.current.region?.identifier
    }
}
