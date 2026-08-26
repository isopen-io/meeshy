import Foundation
@preconcurrency import Contacts
import MeeshySDK
import os

// `nonisolated` : `os.Logger` est un type valeur thread-safe (doc Apple) et ce
// journal est écrit depuis des helpers `nonisolated` — sans le marqueur il
// hériterait de l'isolation MainActor par défaut du module.
private nonisolated let contactSyncLogger = Logger(subsystem: "me.meeshy.app", category: "contact-sync")

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

// MARK: - Lecture du carnet (injectable)

/// Le carnet de l'appareil, derrière un protocole : la découpe en lots doit
/// pouvoir être éprouvée sur des milliers de fiches, ce qu'aucun test ne peut
/// obtenir d'un `CNContactStore` réel.
/// `nonisolated` (module en isolation MainActor par défaut) : le carnet se lit
/// hors acteur, comme les helpers statiques `fetchDeviceContacts` qu'il enveloppe.
nonisolated protocol DeviceContactBookReading: Sendable {
    func authorizationStatus() -> CNAuthorizationStatus
    /// Demande brute d'autorisation — la POLITIQUE (quand demander, que faire
    /// d'un refus) reste au service qui l'appelle.
    func requestAccess() async -> Bool
    /// Toutes les fiches du carnet, sans filtre ni plafond.
    func readContacts() async throws -> [DeviceContact]
}

/// Le carnet réel, adossé à `CNContactStore`.
nonisolated final class CNDeviceContactBook: DeviceContactBookReading, @unchecked Sendable {
    private let store: CNContactStore

    /// Init hors acteur (type `nonisolated`) : il sert de VALEUR PAR DÉFAUT à
    /// `ContactSyncService.init`, donc son expression est évaluée au site
    /// d'appel — un init isolé y imposerait l'acteur à tout appelant.
    init(store: CNContactStore = CNContactStore()) {
        self.store = store
    }

    func authorizationStatus() -> CNAuthorizationStatus {
        CNContactStore.authorizationStatus(for: .contacts)
    }

    func requestAccess() async -> Bool {
        await ContactSyncService.requestContactsPermission(store: store)
    }

    func readContacts() async throws -> [DeviceContact] {
        try await ContactSyncService.fetchDeviceContacts(store: store)
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
    static let shared = ContactSyncService()

    private let book: DeviceContactBookReading
    private let matchService: ContactMatchServiceProviding
    private let directoryService: ContactDirectoryServiceProviding
    /// Taille d'un LOT réseau — plus une fenêtre de troncature : le carnet part
    /// en entier, découpé en autant de requêtes que nécessaire.
    private let batchSize: Int

    init(
        book: DeviceContactBookReading = CNDeviceContactBook(),
        matchService: ContactMatchServiceProviding = ContactMatchService.shared,
        directoryService: ContactDirectoryServiceProviding = ContactDirectoryService.shared,
        batchSize: Int = 2000
    ) {
        self.book = book
        self.matchService = matchService
        self.directoryService = directoryService
        self.batchSize = max(1, batchSize)
    }

    func authorizationStatus() -> CNAuthorizationStatus {
        book.authorizationStatus()
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
            return await book.requestAccess()
        }
    }

    /// Rapprochement pur, en lots : rien n'étant persisté côté serveur, il n'y
    /// a ni jeton ni purge — les réponses se concatènent simplement.
    func findFriendsFromContacts() async throws -> [ContactMatch] {
        let entries = try await readEntries()
        guard !entries.isEmpty else { return [] }

        let country = Self.deviceRegionCode()
        var matches: [ContactMatch] = []
        for batch in Self.batches(of: entries, size: batchSize) {
            let response = try await matchService.match(
                ContactMatchRequest(contacts: batch, defaultCountry: country)
            )
            matches += response.matches
        }
        return matches
    }

    /// Synchronise TOUT le carnet, en autant de lots que nécessaire.
    ///
    /// Contrat (partagé avec la gateway) : le premier lot part sans jeton et
    /// rapporte l'horloge SERVEUR (`syncStartedAt`) ; les lots suivants la
    /// répètent ; le dernier porte `isFinalBatch`, qui remplace la purge « tout
    /// ce qui n'est pas dans CE lot » par une purge par FILIGRANE — tout ce que
    /// cette synchronisation n'a pas touché. Aucun lot intermédiaire n'efface
    /// quoi que ce soit : **une interruption réseau en cours de route laisse
    /// donc le répertoire intact** (les fiches déjà envoyées sont à jour, les
    /// absentes restent en place) et l'erreur remonte à l'appelant.
    ///
    /// `mode` reste le VŒU de l'appelant : `.replace` demande le miroir de
    /// l'appareil, réalisé par la purge finale ; `.merge` ne purge jamais —
    /// c'est son contrat — donc aucun lot ne porte alors `isFinalBatch`.
    ///
    /// Une gateway qui ne renvoie pas `syncStartedAt` ne connaît pas le
    /// contrat : sans jeton, aucune purge finale ne viendrait clore la découpe
    /// et les lots suivants s'ajouteraient sans jamais retirer les contacts
    /// supprimés de l'appareil. On retombe alors sur l'envoi UNIQUE historique
    /// (premier lot) — dans le mode demandé UNIQUEMENT s'il n'y a rien de non
    /// envoyé ; sinon rétrogradé en `.merge`, pour ne jamais purger sur la base
    /// d'un lot tronqué. La troncature est journalisée, jamais subie en silence.
    func syncDirectory(mode: DirectorySyncMode) async throws -> DirectorySyncResult {
        let entries = try await readEntries()
        let country = Self.deviceRegionCode()
        let batches = Self.batches(of: entries, size: batchSize)
        let isSingleShot = batches.count == 1

        var totalContacts = 0
        var processedContacts = 0
        var syncedCount = 0
        var matchedCount = 0
        var removedCount = 0
        var token: String?

        for (index, batch) in batches.enumerated() {
            let isFinal = index == batches.count - 1
            let result = try await directoryService.sync(
                DirectorySyncRequest(
                    contacts: batch,
                    defaultCountry: country,
                    // Un lot d'une découpe ne peut PAS voyager en `.replace` :
                    // la gateway y purgerait tout ce qui n'est pas dans CE lot.
                    mode: isSingleShot ? mode : .merge,
                    syncStartedAt: token,
                    isFinalBatch: (isFinal && mode == .replace) ? true : nil
                )
            )

            totalContacts += result.totalContacts
            processedContacts += result.processedContacts
            syncedCount += result.syncedCount
            matchedCount += result.matchedCount
            // La purge n'a lieu qu'au lot final : c'est SON compte qui fait foi.
            if isFinal { removedCount = result.removedCount }

            if index == 0 {
                guard let serverToken = result.syncStartedAt else {
                    guard isSingleShot else {
                        return try await legacySingleShot(
                            batch,
                            country: country,
                            mode: mode,
                            unsentCount: entries.count - batch.count
                        )
                    }
                    return DirectorySyncResult(
                        totalContacts: totalContacts,
                        processedContacts: processedContacts,
                        syncedCount: syncedCount,
                        matchedCount: matchedCount,
                        removedCount: removedCount,
                        syncStartedAt: nil
                    )
                }
                token = serverToken
            }
        }

        return DirectorySyncResult(
            totalContacts: totalContacts,
            processedContacts: processedContacts,
            syncedCount: syncedCount,
            matchedCount: matchedCount,
            removedCount: removedCount,
            syncStartedAt: token
        )
    }

    /// Repli pour une gateway sans contrat de lots : le comportement historique
    /// — un seul envoi — et la troncature dite à voix haute plutôt que subie en
    /// silence. Le mode demandé n'est conservé QUE si tout le carnet tient dans
    /// ce lot (`unsentCount == 0`) ; sinon l'envoi rétrograde en `.merge`, pour
    /// ne jamais purger le répertoire sur la base d'un lot tronqué.
    private func legacySingleShot(
        _ batch: [ContactMatchEntry],
        country: String?,
        mode: DirectorySyncMode,
        unsentCount: Int
    ) async throws -> DirectorySyncResult {
        contactSyncLogger.notice(
            "Gateway sans synchronisation par lots : envoi unique, \(unsentCount, privacy: .public) fiches non synchronisées"
        )
        return try await directoryService.sync(
            DirectorySyncRequest(
                contacts: batch,
                defaultCountry: country,
                // Envoi TRONQUÉ : `.replace` ferait purger au serveur tout ce
                // qui n'est pas dans ce lot (la rétrogradation du gateway ne
                // se déclenche qu'au-DELÀ de MAX_CONTACTS_PER_SYNC, or le lot
                // vaut exactement cette borne).
                mode: unsentCount > 0 ? .merge : mode
            )
        )
    }

    /// Demande l'accès, lit le carnet et le réduit aux fiches porteuses d'au
    /// moins un identifiant exploitable. Une fiche sans numéro, email ni pseudo
    /// ne peut être rapprochée de rien — l'envoyer ne ferait que gonfler la
    /// requête. Aucun plafond : la découpe en lots se charge de la taille.
    func readEntries() async throws -> [ContactMatchEntry] {
        guard await requestAccess() else { throw ContactSyncError.accessDenied }

        let contacts = try await book.readContacts()
        return contacts
            .filter { !$0.phoneNumbers.isEmpty || !$0.emails.isEmpty || !$0.usernames.isEmpty }
            .map {
                ContactMatchEntry(
                    displayName: $0.displayName,
                    phoneNumbers: $0.phoneNumbers,
                    emails: $0.emails,
                    usernames: $0.usernames
                )
            }
    }

    /// Découpe pure. Un carnet VIDE rend un lot vide — et non zéro lot : c'est
    /// ce lot-là qui, marqué final, dit au serveur que l'appareil n'a plus
    /// aucun contact.
    nonisolated static func batches(of entries: [ContactMatchEntry], size: Int) -> [[ContactMatchEntry]] {
        guard size > 0 else { return [entries] }
        guard !entries.isEmpty else { return [[]] }
        return stride(from: 0, to: entries.count, by: size).map { start in
            Array(entries[start..<min(start + size, entries.count)])
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
