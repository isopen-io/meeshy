import Foundation
import Combine
import CommonCrypto
import CryptoKit
import LocalAuthentication
import Security
import UIKit
import MeeshySDK

/// Où vivent les empreintes des PIN, vu comme trois fonctions : un double en
/// test (#11558). `SecretsConversationLockVault` l'adapte au coffre.
struct ConversationLockSecrets {
    let read: (String) -> String?
    let save: (String, String) -> Bool
    let delete: (String) -> Void
}

// MARK: - Le contenu masqué (#11387)

extension Notification.Name {
    /// Le jeu des conversations verrouillées a changé : ce qui publie du
    /// contenu HORS de l'app (widget, cliché lu par l'extension de
    /// notification) se republie sans attendre la prochaine mise à jour de la
    /// liste.
    static let conversationContentLocksDidChange = Notification.Name("meeshy.conversationContentLocksDidChange")
}

// MARK: - La porte du routeur (#11386)

/// La SEULE question que le routeur pose au verrou avant de poser une
/// conversation à l'écran (`Router.admitConversation`).
///
/// `true` : la conversation n'est pas verrouillée, ou le PIN — ou la
/// biométrie — vient d'en autoriser UNE ouverture. Le laissez-passer se
/// consomme : la question suivante redemande le PIN.
@MainActor
protocol ConversationLockGating: AnyObject {
    func admitsOpening(_ conversationId: String) -> Bool
}

// MARK: - La question des gestes de notification (#12655)

/// La SEULE question qu'un geste de notification (Répondre, Marquer comme lu,
/// Rejoindre, Ajouter le contact, Ouvrir dans Plans) pose au verrou :
/// `mayBeLocked`, fail-closed tant que la liste des verrous n'est pas lue.
/// `isLocked` n'y est pas : un geste ne peut pas lire une liste vide comme
/// « aucun verrou ».
@MainActor
protocol ConversationLockProbing: AnyObject {
    func mayBeLocked(_ conversationId: String) -> Bool
}

// MARK: - Le gestionnaire

@MainActor
final class ConversationLockManager: ObservableObject, ConversationLockGating, ConversationLockProbing {
    // iOS 26.1 : deinit synthétisée ISOLÉE (SE-0466, isolation MainActor par
    // défaut) → double-free `pointer being freed was not allocated` (abrt)
    // au démontage hors d'une tâche (test XCTest synchrone, vue démontée).
    // Garde : MainActorDeinitSourceGuardTests / MeeshyUIDeinitSourceGuardTests.
    nonisolated deinit {}
    static let shared = ConversationLockManager(
        contentLockMirror: UserDefaults(suiteName: UserPreferencesManager.appGroupSuiteName),
        contentLockMirrorFile: NSELockedConversationMirror.fileURL(
            inContainer: FileManager.default.containerURL(
                forSecurityApplicationGroupIdentifier: UserPreferencesManager.appGroupSuiteName
            )
        ),
        purgeDeliveredBanners: { conversationId in
            NotificationActionHandler.removeDeliveredBanners(forThreadOf: .conversation(id: conversationId))
        }
    )

    /// Durée de vie d'une ouverture autorisée et pas encore consommée.
    static let openingPassLifetime: TimeInterval = 60

    @Published private(set) var lockedConversationIds: Set<String> = []
    private var knownMasterPin: Bool?
    private var knownBiometricUnlock: Bool?

    private let vault: ConversationLockVault
    private let defaults: UserDefaults
    private let biometrics: BiometricUnlocking
    private let iterations: Int
    private let now: () -> Date
    /// #11387 — le jeu COMPLET des conversations verrouillées, miroité dans
    /// l'App Group pour l'extension de notification (le cliché de la liste
    /// n'en couvre que les pages chargées). `nil` : aucun miroir (tests).
    /// La clé `UserDefaults` est le renfort des versions antérieures ; le
    /// FICHIER est ce que l'extension lit d'abord (#12655).
    private let contentLockMirror: UserDefaults?
    private let contentLockMirrorFile: URL?
    /// #11387 — verrouiller retire du Centre de notifications les bannières
    /// DÉJÀ délivrées de la conversation : elles montraient son contenu.
    private let purgeDeliveredBanners: @MainActor (String) -> Void
    /// #12655 — `.standard` ne se lit pas tant que les données protégées sont
    /// indisponibles (lancement en arrière-plan avant le premier déverrouillage,
    /// ou appareil verrouillé) : une liste lue alors est VIDE sans le dire.
    private let isProtectedDataAvailable: @MainActor () -> Bool
    /// La liste persistée a-t-elle été lue, données protégées disponibles ?
    /// Tant que non, rien ne la réécrit.
    private var hasLoadedLockedIds = false
    /// La liste en mémoire vient-elle d'une LECTURE (liste persistée ou
    /// miroir) ? Tant que non, toute conversation peut être sous PIN.
    private var knowsLockedIds = false
    /// L'effacement du coffre que la déconnexion a demandé n'est pas acquis
    /// (trousseau avant le premier déverrouillage, erreur du système) : il se
    /// rejoue dès que les données protégées le deviennent, et avant toute
    /// lecture ou écriture, qu'il bloque tant qu'il échoue.
    private var pendingVaultWipe = false
    /// Où s'annonce `.conversationContentLocksDidChange`.
    private let notificationCenter: NotificationCenter

    private let masterPinKey = "meeshy_master_pin"
    private let lockKeyPrefix = "meeshy_lock_"
    private let throttleSuffix = ".attempts"
    private let biometricStateKey = "meeshy_lock_biometric_state"
    private let lockedIdsDefaultsKey = "meeshy.lockedConversationIds"

    private var openingPasses: [String: Date] = [:]
    private var cancellables = Set<AnyCancellable>()

    init(
        vault: ConversationLockVault = KeychainConversationLockVault(),
        defaults: UserDefaults = .standard,
        biometrics: BiometricUnlocking = DeviceBiometricUnlocker(),
        iterations: Int = ConversationPinCredential.defaultIterations,
        now: @escaping () -> Date = { Date() },
        contentLockMirror: UserDefaults? = nil,
        contentLockMirrorFile: URL? = nil,
        purgeDeliveredBanners: @escaping @MainActor (String) -> Void = { _ in },
        isProtectedDataAvailable: @escaping @MainActor () -> Bool = { UIApplication.shared.isProtectedDataAvailable },
        notificationCenter: NotificationCenter = .default
    ) {
        self.vault = vault
        self.defaults = defaults
        self.biometrics = biometrics
        self.iterations = iterations
        self.now = now
        self.contentLockMirror = contentLockMirror
        self.contentLockMirrorFile = contentLockMirrorFile
        self.purgeDeliveredBanners = purgeDeliveredBanners
        self.isProtectedDataAvailable = isProtectedDataAvailable
        self.notificationCenter = notificationCenter
        loadLockedIds()
        wireProtectedDataReload(notificationCenter)
        wireAuthLogoutHook()
    }

    convenience init(secrets: ConversationLockSecrets) {
        self.init(vault: SecretsConversationLockVault(secrets: secrets))
    }

    /// Le PIN maître est-il posé ? Lu au trousseau au PREMIER besoin (#11558) :
    /// le gestionnaire est construit pendant le rendu des premières lignes de
    /// la liste, et la valeur ne sert qu'au geste de verrouillage et aux Réglages.
    var masterPinConfigured: Bool {
        if let knownMasterPin { return knownMasterPin }
        let configured = read(masterPinKey) != nil
        knownMasterPin = configured
        return configured
    }

    /// La biométrie est-elle activée ? Même lecture paresseuse que le PIN maître.
    var biometricUnlockEnabled: Bool {
        if let knownBiometricUnlock { return knownBiometricUnlock }
        let enabled = read(biometricStateKey) != nil
        knownBiometricUnlock = enabled
        return enabled
    }

    private func noteMasterPin(_ configured: Bool) {
        objectWillChange.send()
        knownMasterPin = configured
    }

    private func noteBiometricUnlock(_ enabled: Bool) {
        objectWillChange.send()
        knownBiometricUnlock = enabled
    }

    /// La liste se relit dès que les données protégées le deviennent : un
    /// processus lancé en arrière-plan avant le premier déverrouillage (PushKit,
    /// VoIP) n'avait lu qu'une liste vide. Restée inconnue, elle se relit
    /// aussi à chaque retour au premier plan.
    private func wireProtectedDataReload(_ notificationCenter: NotificationCenter) {
        Publishers.Merge(
            notificationCenter.publisher(for: UIApplication.protectedDataDidBecomeAvailableNotification),
            notificationCenter.publisher(for: UIApplication.didBecomeActiveNotification)
        )
            .receive(on: DispatchQueue.main)
            .sink { [weak self] _ in self?.protectedDataMayBeAvailable() }
            .store(in: &cancellables)
    }

    private func protectedDataMayBeAvailable() {
        settlePendingVaultWipe()
        guard !hasLoadedLockedIds else { return }
        loadLockedIds()
    }

    /// `true` quand aucun effacement n'attend plus. Il n'est acquis que
    /// réussi données protégées disponibles : avant le premier
    /// déverrouillage, un trousseau peut répondre « aucun élément » sans rien
    /// effacer.
    @discardableResult
    private func settlePendingVaultWipe() -> Bool {
        guard pendingVaultWipe else { return true }
        let wiped = vault.deleteAll()
        pendingVaultWipe = !(wiped && isProtectedDataAvailable())
        return !pendingVaultWipe
    }

    /// P7-11 — pattern calqué sur `FeedbackToastManager.wireAuthLogoutHook` :
    /// à la déconnexion (`isAuthenticated` → false, valeur initiale ignorée),
    /// wipe des verrous + master PIN pour qu'aucun état de A ne s'applique à B.
    private func wireAuthLogoutHook() {
        AuthManager.shared.$isAuthenticated
            .removeDuplicates()
            .dropFirst()
            .filter { !$0 }
            .receive(on: DispatchQueue.main)
            .sink { [weak self] _ in self?.resetForLogout() }
            .store(in: &cancellables)
    }

    // MARK: - Master PIN (6 digits)

    func hasMasterPin() -> Bool {
        read(masterPinKey) != nil
    }

    /// `false` : rien n'est écrit — aucun PIN maître à la création, l'ancien
    /// gardé au changement.
    @discardableResult
    func setMasterPin(_ pin: String) -> Bool {
        guard store(pin, under: masterPinKey) else { return false }
        noteMasterPin(true)
        return true
    }

    func attemptMasterPin(_ pin: String) -> PinAttemptOutcome {
        attempt(pin, against: masterPinKey)
    }

    func verifyMasterPin(_ pin: String) -> Bool {
        attemptMasterPin(pin) == .granted
    }

    /// Le PIN maître peut-il partir ? Seulement quand la liste LUE ne tient
    /// aucun verrou : inconnue, elle ne dit pas qu'aucun code n'en dépend.
    var offersMasterPinRemoval: Bool {
        knowsLockedIds && lockedConversationIds.isEmpty
    }

    /// Supprime le master PIN, si `offersMasterPinRemoval`. `false` : un
    /// verrou en dépend, ou la liste ne dit pas encore qu'aucun n'en dépend.
    @discardableResult
    func removeMasterPin() -> Bool {
        guard offersMasterPinRemoval else { return false }
        forceRemoveMasterPin()
        return true
    }

    /// Supprime le master PIN sans condition : la déconnexion, et
    /// `removeMasterPin` une fois qu'aucun verrou n'en dépend. La biométrie,
    /// autorisée par lui, part avec lui.
    func forceRemoveMasterPin() {
        erase(masterPinKey)
        noteMasterPin(false)
        disableBiometricUnlock()
    }

    /// P7-11 — logout = purge cross-compte totale (invariant 9). Le keychain
    /// (`me.meeshy.app.conversation-locks`) survit au logout ET à la
    /// réinstallation, et n'est pas namespacé par compte : sans wipe, le
    /// master PIN et les verrous du compte A s'appliquent au compte B.
    /// Après logout les conversations elles-mêmes sont purgées (7 tables +
    /// prefs + URLCache) — leurs PINs n'ont plus d'objet.
    ///
    /// Le coffre s'efface EN BLOC, pas seulement les codes que la liste
    /// connaît : liste inconnue, un code laissé là, la reconstruction suivante
    /// (`loadLockedIds`) en referait un verrou du compte suivant. Tant que cet
    /// effacement n'est pas acquis, il se rejoue (`settlePendingVaultWipe`).
    func resetForLogout() {
        removeAllLocks()
        forceRemoveMasterPin()
        pendingVaultWipe = true
        settlePendingVaultWipe()
    }

    // MARK: - Per-conversation PIN (4 digits)

    /// La conversation est-elle sous PIN ? La liste LUE fait foi. Tant
    /// qu'elle est inconnue (#12655), le code que le trousseau tient pour la
    /// conversation la verrouille aussi : la rangée, l'aperçu, le balayage,
    /// l'ouverture et la porte du routeur ne traitent jamais en ouverte une
    /// conversation dont le PIN existe.
    func isLocked(_ conversationId: String) -> Bool {
        lockedConversationIds.contains(conversationId)
            || (!knowsLockedIds && vault.read(lockKey(conversationId)) != nil)
    }

    /// **La conversation PEUT-elle être sous PIN ?** (#12655) Avant que la
    /// liste des verrous soit lue (données protégées indisponibles, miroir
    /// illisible ou absent), oui, toute conversation : ce qui écrit dans une
    /// conversation depuis l'écran verrouillé se refuse (fail-closed). Une fois
    /// lue, seules les conversations de la liste.
    func mayBeLocked(_ conversationId: String) -> Bool {
        !knowsLockedIds || isLocked(conversationId)
    }

    /// **LA décision « contenu masqué »** (#11387 : le verrou PIN protège le
    /// CONTENU, pas seulement l'ouverture). Sans PIN, une conversation verrouillée ne montre ni son
    /// dernier message, ni la frappe, ni le brouillon, ni vignette, ni aperçu
    /// d'appui long, et rien ne la précharge. La rangée, le chargeur d'aperçu,
    /// le widget et le cliché de l'extension de notification la consultent ;
    /// aucun ne réécrit la règle.
    ///
    /// Un PIN donné n'ouvre qu'UNE fois (`admitsOpening`) : revenu à la liste,
    /// le contenu est de nouveau masqué.
    nonisolated static func hidesContent(of conversationId: String, lockedConversationIds: Set<String>) -> Bool {
        lockedConversationIds.contains(conversationId)
    }

    func hidesContent(of conversationId: String) -> Bool {
        isLocked(conversationId)
    }

    /// Le JEU que lisent les surfaces qui publient hors de l'app (widget) ou
    /// mettent en cache (préchargement) : la liste lue, et tant qu'elle est
    /// inconnue, les conversations dont le trousseau tient le code — même
    /// règle que `isLocked`.
    var contentLockedConversationIds: Set<String> {
        guard !knowsLockedIds, let inVault = lockedIdsInVault() else { return lockedConversationIds }
        return lockedConversationIds.union(inVault)
    }

    /// La conversation n'entre dans la liste qu'une fois son code écrit : la
    /// liste reste un sous-ensemble des codes du trousseau, ce que la
    /// reconstruction suppose. `false` : rien n'est verrouillé, et un code
    /// déjà posé reste le seul valable.
    @discardableResult
    func setLock(conversationId: String, pin: String) -> Bool {
        guard store(pin, under: lockKey(conversationId)) else { return false }
        openingPasses[conversationId] = nil
        lockedConversationIds.insert(conversationId)
        saveLockedIds()
        purgeDeliveredBanners(conversationId)
        return true
    }

    /// Un essai sur le code d'une conversation. Accordé, il vaut UNE ouverture
    /// (`admitsOpening`), dans la minute.
    func attemptLock(conversationId: String, pin: String) -> PinAttemptOutcome {
        let outcome = attempt(pin, against: lockKey(conversationId))
        if outcome == .granted { openingPasses[conversationId] = now() }
        return outcome
    }

    func verifyLock(conversationId: String, pin: String) -> Bool {
        attemptLock(conversationId: conversationId, pin: pin) == .granted
    }

    func removeLock(conversationId: String) {
        erase(lockKey(conversationId))
        openingPasses[conversationId] = nil
        lockedConversationIds.remove(conversationId)
        saveLockedIds()
    }

    /// La liste, et les codes que le trousseau tient hors d'elle : liste
    /// inconnue, elle seule ne dit pas tout.
    func removeAllLocks() {
        lockedConversationIds.union(lockedIdsInVault() ?? []).forEach { erase(lockKey($0)) }
        openingPasses.removeAll()
        lockedConversationIds.removeAll()
        saveLockedIds(wipingAll: true)
    }

    // MARK: - La porte (#11386)

    func admitsOpening(_ conversationId: String) -> Bool {
        guard isLocked(conversationId) else { return true }
        guard let grantedAt = openingPasses.removeValue(forKey: conversationId) else { return false }
        let age = now().timeIntervalSince(grantedAt)
        return age >= 0 && age < Self.openingPassLifetime
    }

    // MARK: - Biométrie (#11388)

    /// Le capteur de l'appareil, s'il est utilisable. `nil` : aucun, ou aucun
    /// visage / doigt enrôlé.
    var biometricKind: BiometricKind? {
        biometrics.availableKind()
    }

    var offersBiometricUnlock: Bool {
        biometricUnlockEnabled && biometrics.availableKind() != nil
    }

    /// L'activer exige le master PIN : un téléphone laissé déverrouillé ne
    /// suffit pas à remplacer les codes par un visage. L'état d'enrôlement est
    /// noté au même instant.
    func enableBiometricUnlock(authorizedBy masterPin: String) -> PinAttemptOutcome {
        let outcome = attemptMasterPin(masterPin)
        guard outcome == .granted, let enrollment = biometrics.enrollmentState() else { return outcome }
        noteBiometricUnlock(write(enrollment.base64EncodedString(), for: biometricStateKey))
        return outcome
    }

    func disableBiometricUnlock() {
        vault.delete(biometricStateKey)
        noteBiometricUnlock(false)
    }

    /// Un visage ou un doigt ajouté depuis l'activation (il suffit de connaître
    /// le code de l'appareil) désactive la biométrie au lieu d'ouvrir : le PIN
    /// redevient la seule porte jusqu'à une nouvelle activation.
    func unlockWithBiometrics(conversationId: String, reason: String) async -> Bool {
        guard isLocked(conversationId), let enrolled = read(biometricStateKey) else { return false }
        guard biometrics.enrollmentState()?.base64EncodedString() == enrolled else {
            disableBiometricUnlock()
            return false
        }
        guard await biometrics.authenticate(reason: reason) else { return false }
        openingPasses[conversationId] = now()
        return true
    }

    // MARK: - Private helpers

    private func lockKey(_ conversationId: String) -> String {
        lockKeyPrefix + conversationId
    }

    private func throttleKey(_ key: String) -> String {
        key + throttleSuffix
    }

    /// Les conversations dont le coffre tient un code — ni le compte
    /// biométrique, ni les compteurs d'échecs ; `nil` quand il ne s'énumère pas.
    private func lockedIdsInVault() -> Set<String>? {
        vault.accounts().map { accounts -> Set<String> in
            Set(accounts.compactMap { (account: String) -> String? in
                guard account.hasPrefix(lockKeyPrefix), account != biometricStateKey,
                      !account.hasSuffix(throttleSuffix) else { return nil }
                let conversationId = String(account.dropFirst(lockKeyPrefix.count))
                return conversationId.isEmpty ? nil : conversationId
            })
        }
    }

    private func attempt(_ pin: String, against key: String) -> PinAttemptOutcome {
        guard let stored = read(key), let credential = ConversationPinCredential.decode(stored) else {
            return .rejected(retryIn: 0)
        }
        let moment = now()
        let recorded = throttle(for: key)
        let current = recorded.anchored(at: moment)
        if current != recorded { saveThrottle(current, for: key) }
        let wait = current.retryDelay(at: moment)
        guard wait <= 0 else { return .throttled(retryIn: wait) }
        guard credential.matches(pin) else {
            let failed = current.recordingFailure(at: moment)
            saveThrottle(failed, for: key)
            return .rejected(retryIn: failed.retryDelay(at: moment))
        }
        vault.delete(throttleKey(key))
        if credential.needsUpgrade(toIterations: iterations) { store(pin, under: key) }
        return .granted
    }

    @discardableResult
    private func store(_ pin: String, under key: String) -> Bool {
        guard let credential = ConversationPinCredential.derive(pin: pin, iterations: iterations),
              write(credential.encoded, for: key) else { return false }
        vault.delete(throttleKey(key))
        return true
    }

    /// Toute lecture, et toute écriture, passe après l'effacement que la
    /// déconnexion a laissé en attente, et n'a pas lieu tant qu'il échoue : un
    /// code du compte sortant ne s'accepte plus, et rejoué après une écriture,
    /// l'effacement emporterait le code qu'elle vient de poser.
    private func read(_ key: String) -> String? {
        guard settlePendingVaultWipe() else { return nil }
        return vault.read(key)
    }

    @discardableResult
    private func write(_ value: String, for key: String) -> Bool {
        guard settlePendingVaultWipe() else { return false }
        return vault.write(value, for: key)
    }

    private func erase(_ key: String) {
        vault.delete(key)
        vault.delete(throttleKey(key))
    }

    private func throttle(for key: String) -> ConversationPinThrottle {
        guard let raw = read(throttleKey(key)),
              let recorded = try? JSONDecoder().decode(ConversationPinThrottle.self, from: Data(raw.utf8)) else {
            return ConversationPinThrottle()
        }
        return recorded
    }

    private func saveThrottle(_ throttle: ConversationPinThrottle, for key: String) {
        guard let data = try? JSONEncoder().encode(throttle) else { return }
        write(String(decoding: data, as: UTF8.self), for: throttleKey(key))
    }

    // MARK: - Persistence

    /// Une liste qui n'a pas été LUE (données protégées indisponibles) ne se
    /// réécrit pas : elle effacerait les verrous qu'elle ignore. La
    /// déconnexion, qui lève tous les verrous, est une intention, pas une
    /// lecture : elle s'écrit toujours.
    private func saveLockedIds(wipingAll: Bool = false) {
        defer { announceContentLocks() }
        guard hasLoadedLockedIds || wipingAll else { return }
        hasLoadedLockedIds = true
        knowsLockedIds = true
        defaults.set(Array(lockedConversationIds), forKey: lockedIdsDefaultsKey)
        mirrorLockedIds()
    }

    /// Le miroir se réécrit aussi au lancement : un verrou posé avant que le
    /// miroir existe (mise à jour de l'app) rejoint l'extension sans attendre
    /// le prochain changement. Données protégées indisponibles : ni lecture
    /// de `.standard`, ni écriture du miroir — la liste en mémoire reprend le
    /// miroir s'il se lit, sans rien persister.
    ///
    /// Une liste écrite l'est toujours, vide comprise : une clé ABSENTE de
    /// `.standard` ne dit donc pas « aucun verrou » mais « jamais écrite » ou
    /// « illisible » (`CFPreferences` sert encore le domaine vide d'avant le
    /// premier déverrouillage). Le miroir fait alors foi et ne se réécrit pas.
    ///
    /// Sans miroir non plus (mise à jour depuis une version qui ne l'écrivait
    /// pas, ou première installation), le TROUSSEAU tranche : `setLock` y écrit
    /// le code avant que la conversation entre dans la liste, donc ses comptes
    /// `meeshy_lock_*` reconstruisent la liste — vide seulement s'il n'en tient
    /// aucun. Un trousseau qui ne s'énumère pas laisse la liste inconnue, sans
    /// rien écrire ; le retour au premier plan la relit.
    private func loadLockedIds() {
        let mirrored = mirroredLockedIds()
        guard isProtectedDataAvailable() else {
            if let mirrored { adopt(mirrored, persisting: false) }
            return
        }
        if let stored = defaults.stringArray(forKey: lockedIdsDefaultsKey) {
            adopt(Set(stored), persisting: true)
            mirrorLockedIds()
            return
        }
        if let mirrored {
            adopt(mirrored, persisting: true)
            return
        }
        guard NSELockedConversationMirror.readFile(at: contentLockMirrorFile) == .absent,
              let inVault = lockedIdsInVault() else { return }
        adopt(inVault, persisting: true)
        mirrorLockedIds()
    }

    /// Une liste LUE : la mémoire la connaît ; `persisting` dit si elle a
    /// aussi le droit d'être réécrite. Devenue connue, ou changée, elle
    /// s'annonce : le widget masquait jusque-là un autre jeu.
    private func adopt(_ ids: Set<String>, persisting: Bool) {
        let changes = !knowsLockedIds || ids != lockedConversationIds
        lockedConversationIds = ids
        knowsLockedIds = true
        if persisting { hasLoadedLockedIds = true }
        if changes { announceContentLocks() }
    }

    private func announceContentLocks() {
        notificationCenter.post(name: .conversationContentLocksDidChange, object: nil)
    }

    /// Ce que le miroir DIT des verrous — le fichier, et la clé de renfort qui
    /// ne peut qu'en ajouter ; `nil` quand ni l'un ni l'autre ne se lit.
    private func mirroredLockedIds() -> Set<String>? {
        let legacy = contentLockMirror?.stringArray(forKey: NSELockedConversationMirror.legacyDefaultsKey)
        guard case .ids(let fromFile) = NSELockedConversationMirror.readFile(at: contentLockMirrorFile) else {
            return legacy.map(Set.init)
        }
        return Set(fromFile).union(legacy ?? [])
    }

    private func mirrorLockedIds() {
        NSELockedConversationMirror.mirror(
            lockedConversationIds, toFile: contentLockMirrorFile, defaults: contentLockMirror
        )
    }
}
