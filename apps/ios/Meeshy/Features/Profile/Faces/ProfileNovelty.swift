import SwiftUI
import MeeshyUI

/// Les fonctions que la planche « profil, vue finale » apporte (#19619, `Sys-Boutons` § 10) : chacune porte l'étiquette
/// « Nouveau » une seule fois, à sa première apparition, pour chaque compte.
nonisolated enum ProfileNovelty: String, CaseIterable, Sendable {
    case profileLink
    case myAddresses
    case ghostMode
    case vitrinePreview
    case closeOnesMap
}

/// Ce que décide une apparition : montrer l'étiquette ou non, et ce qui est désormais vu (`nil` : rien à écrire).
nonisolated struct ProfileNoveltyClaim: Equatable, Sendable {
    let showsLabel: Bool
    let seen: Set<ProfileNovelty>?
}

/// La loi, pure : la première apparition d'une fonction pour un compte montre l'étiquette et la consomme ; les suivantes
/// ne montrent rien. Sans compte connu, rien ne se montre et rien ne s'écrit.
nonisolated enum ProfileNoveltyLaw {
    static func claim(_ feature: ProfileNovelty, accountId: String?, seen: Set<ProfileNovelty>) -> ProfileNoveltyClaim {
        guard let accountId, !accountId.isEmpty, !seen.contains(feature) else {
            return ProfileNoveltyClaim(showsLabel: false, seen: nil)
        }
        return ProfileNoveltyClaim(showsLabel: true, seen: seen.union([feature]))
    }
}

/// Ce qui garde, par compte, les fonctions déjà vues.
protocol ProfileNoveltyStorageProviding: AnyObject {
    func seen(accountId: String) -> Set<ProfileNovelty>
    func save(_ seen: Set<ProfileNovelty>, accountId: String)
}

/// Le stockage local de l'appareil, une clé par compte. Un appareil qui avait déjà ouvert la Carte de mes proches
/// (l'ancienne clé, commune à tous les comptes) ne la revoit pas « Nouveau ».
final class UserDefaultsProfileNoveltyStorage: ProfileNoveltyStorageProviding {
    static let legacyCloseOnesMapKey = "locationMap.nearby.opened"

    private let defaults: UserDefaults

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
    }

    nonisolated deinit {}

    static func key(accountId: String) -> String { "profile.novelty.seen.\(accountId)" }

    func seen(accountId: String) -> Set<ProfileNovelty> {
        let stored = (defaults.stringArray(forKey: Self.key(accountId: accountId)) ?? [])
            .compactMap { ProfileNovelty(rawValue: $0) }
        let legacy: [ProfileNovelty] = defaults.bool(forKey: Self.legacyCloseOnesMapKey) ? [.closeOnesMap] : []
        return Set(stored + legacy)
    }

    func save(_ seen: Set<ProfileNovelty>, accountId: String) {
        defaults.set(seen.map(\.rawValue).sorted(), forKey: Self.key(accountId: accountId))
    }
}

/// Le registre : applique la loi au stockage et rend s'il faut montrer l'étiquette.
final class ProfileNoveltyLedger {
    static let shared = ProfileNoveltyLedger(storage: UserDefaultsProfileNoveltyStorage())

    private let storage: ProfileNoveltyStorageProviding

    init(storage: ProfileNoveltyStorageProviding) {
        self.storage = storage
    }

    nonisolated deinit {}

    func claim(_ feature: ProfileNovelty, accountId: String?) -> Bool {
        let seen = accountId.map { storage.seen(accountId: $0) } ?? []
        let decision = ProfileNoveltyLaw.claim(feature, accountId: accountId, seen: seen)
        if let next = decision.seen, let accountId {
            storage.save(next, accountId: accountId)
        }
        return decision.showsLabel
    }
}

enum ProfileNoveltyCopy {
    static var label: String { String(localized: "profile.novelty.new", defaultValue: "Nouveau", bundle: .main) }
}

/// Lit la loi à la première apparition de son contenu et lui passe le libellé à poser (`nil` : rien). L'étiquette
/// reste le temps de l'écran, puis part en fondu (K26) quand il s'en va ; elle ne revient pas.
struct ProfileNoveltyReader<Content: View>: View {
    let feature: ProfileNovelty
    let accountId: String?
    let ledger: ProfileNoveltyLedger
    let content: (String?) -> Content

    @State private var isShown = false
    @State private var isClaimed = false

    init(feature: ProfileNovelty, accountId: String?, ledger: ProfileNoveltyLedger = .shared,
         @ViewBuilder content: @escaping (String?) -> Content) {
        self.feature = feature
        self.accountId = accountId
        self.ledger = ledger
        self.content = content
    }

    var body: some View {
        content(isShown ? ProfileNoveltyCopy.label : nil)
            .meeshyMotion(.rise, value: isShown)
            .onAppear { claim() }
            .onDisappear { isShown = false }
    }

    private func claim() {
        guard !isClaimed else { return }
        isClaimed = true
        let shows = ledger.claim(feature, accountId: accountId)
        var transaction = Transaction()
        transaction.disablesAnimations = true
        withTransaction(transaction) { isShown = shows }
    }
}

/// La pastille « Nouveau » posée en accessoire d'un titre que le kit ne compose pas lui-même : K41, à la teinte passée.
struct ProfileNoveltyTag: View {
    let text: String
    var tint: Color?

    var body: some View {
        MeeshyBadge(.label(text), surface: .solid, kind: .accent, tint: tint)
            .transition(.opacity)
    }
}
