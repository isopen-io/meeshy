import Foundation
import Combine
import MeeshySDK

/// Une langue principale proposée à l'entrée World Wide — nommée dans sa
/// propre langue (endonyme), jamais traduite.
struct WorldGuestLanguage: Identifiable, Equatable {
    let code: String
    let endonym: String
    var id: String { code }
}

/// #10006 — l'entrée SANS COMPTE dans World Wide depuis l'écran de connexion :
/// nom → langue principale → fil. Mêmes étapes et mêmes mots que le web
/// (planche « Onboarding »).
///
/// La clé de jonction se LIT dans `GET /world` (`shareLinkIdentifier`) — elle
/// n'est jamais écrite ici — puis l'invité entre par la porte canonique des
/// liens (`POST /links/:key/members`). La session qui en sort porte les familles
/// de pièces jointes du lien (#10001) : le sélecteur de l'invité n'offre
/// qu'elles.
@MainActor
final class WorldGuestEntryViewModel: ObservableObject {
    // iOS 26.1 : deinit synthétisée isolée (SE-0466) — voir
    // `MainActorDeinitSourceGuardTests`.
    nonisolated deinit {}

    enum Step: Int, Equatable {
        case name = 0
        case language = 1
    }

    enum Availability: Equatable {
        case checking
        case open(WorldEntry)
        case unavailable
    }

    /// Les sept langues de l'interface, dans l'ordre de la planche.
    static let interfaceLanguages: [WorldGuestLanguage] = [
        WorldGuestLanguage(code: "fr", endonym: "Français"),
        WorldGuestLanguage(code: "en", endonym: "English"),
        WorldGuestLanguage(code: "es", endonym: "Español"),
        WorldGuestLanguage(code: "pt", endonym: "Português"),
        WorldGuestLanguage(code: "de", endonym: "Deutsch"),
        WorldGuestLanguage(code: "it", endonym: "Italiano"),
        WorldGuestLanguage(code: "ar", endonym: "العربية"),
    ]

    /// Le plafond du nom côté passerelle (`firstName`, 50 caractères).
    static let maxNameLength = 50

    @Published private(set) var step: Step = .name
    @Published private(set) var availability: Availability = .checking
    @Published var name = ""
    @Published var language: String
    @Published private(set) var isEntering = false
    @Published private(set) var errorMessage: String?

    let languages = WorldGuestEntryViewModel.interfaceLanguages

    private let world: WorldEntryProviding
    private let joiner: GuestLinkJoining
    private let storedSession: @MainActor (String) -> AnonymousSessionContext?

    /// - Parameter initialEntry: l'entrée que l'écran de connexion a DÉJÀ
    ///   servie — le parcours s'ouvre sans attendre le réseau, qui revalide.
    init(
        initialEntry: WorldEntry? = nil,
        world: WorldEntryProviding = WorldService.shared,
        joiner: GuestLinkJoining = WorldService.shared,
        deviceLanguage: String? = Locale.preferredLanguages.first,
        storedSession: @escaping @MainActor (String) -> AnonymousSessionContext? = { AnonymousSessionStore.load(linkId: $0) }
    ) {
        self.world = world
        self.joiner = joiner
        self.storedSession = storedSession
        self.language = Self.proposedLanguage(from: deviceLanguage)
        self.availability = initialEntry.map { Availability.open($0) } ?? .checking
    }

    // MARK: - Langue proposée

    /// « Proposée depuis votre appareil » : la langue de l'appareil quand elle
    /// est l'une des sept, sinon le français (repli du Prisme).
    static func proposedLanguage(from deviceLanguage: String?) -> String {
        let base = (deviceLanguage ?? "")
            .split(whereSeparator: { $0 == "-" || $0 == "_" })
            .first
            .map { $0.lowercased() } ?? ""
        return interfaceLanguages.contains { $0.code == base } ? base : "fr"
    }

    var trimmedName: String { name.trimmingCharacters(in: .whitespacesAndNewlines) }

    var canContinue: Bool {
        !trimmedName.isEmpty && trimmedName.count <= Self.maxNameLength
    }

    var worldTitle: String {
        guard case .open(let entry) = availability else { return "" }
        return entry.title
    }

    // MARK: - Disponibilité

    /// Lit l'entrée servie. Rend la session déjà ouverte par cet appareil sur
    /// la MÊME clé, pour y revenir sans reposer les questions.
    func load() async -> AnonymousSessionContext? {
        do {
            let entry = try await world.fetchWorldEntry()
            availability = .open(entry)
            return storedSession(entry.shareLinkIdentifier)
        } catch MeeshyError.server(let status, _) where status == 404 {
            // `WORLD_UNAVAILABLE` : aucune entrée ouverte, la porte se ferme.
            availability = .unavailable
            return nil
        } catch {
            // Hors ligne, serveur lent : l'entrée déjà servie reste valable.
            if case .open = availability { return nil }
            availability = .unavailable
            return nil
        }
    }

    // MARK: - Étapes

    func continueToLanguage() {
        guard canContinue else { return }
        errorMessage = nil
        step = .language
    }

    func back() {
        errorMessage = nil
        step = .name
    }

    // MARK: - Entrée

    /// Fait entrer l'invité. Rend sa session, ou `nil` en posant la raison.
    func enter() async -> AnonymousSessionContext? {
        guard case .open(let entry) = availability, canContinue, !isEntering else { return nil }
        isEntering = true
        errorMessage = nil
        defer { isEntering = false }
        do {
            let response = try await joiner.joinAsGuest(
                key: entry.shareLinkIdentifier,
                nickname: trimmedName,
                language: language
            )
            guard let token = response.sessionToken, !token.isEmpty else {
                errorMessage = WorldGuestEntryCopy.enterFailed
                return nil
            }
            return AnonymousSessionContext(
                sessionToken: token,
                participantId: response.participantId,
                permissions: response.entry.rights?.permissions ?? ParticipantPermissions(
                    canSendMessages: true, canSendFiles: false, canSendImages: false,
                    canSendVideos: false, canSendAudios: false, canSendLocations: false, canSendLinks: false
                ),
                linkId: entry.shareLinkIdentifier,
                conversationId: response.conversationId,
                allowedAttachmentKinds: response.entry.attachmentAllowance.kinds
            )
        } catch {
            errorMessage = Self.message(for: error)
            return nil
        }
    }

    private static func message(for error: Error) -> String {
        guard let meeshyError = error as? MeeshyError else { return WorldGuestEntryCopy.enterFailed }
        switch meeshyError {
        case .server(let status, let message) where (400..<500).contains(status) && !message.isEmpty:
            return message
        case .forbidden(let reason, _):
            return reason ?? WorldGuestEntryCopy.enterFailed
        case .network:
            return WorldGuestEntryCopy.offline
        default:
            return WorldGuestEntryCopy.enterFailed
        }
    }
}
