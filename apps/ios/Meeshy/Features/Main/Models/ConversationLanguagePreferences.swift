import Foundation
import MeeshySDK

/// Strict Prisme Linguistique resolution for a single user.
///
/// `MeeshyUser.preferredContentLanguages` (SDK source of truth) appends a
/// `"fr"` fallback when nothing is configured. That fallback makes sense for
/// composing UI defaults, but it would FORCE selection of a French
/// translation in `ConversationViewModel.preferredTranslation(for:)` even
/// when the user has set no language preference at all. The Prisme rule
/// (`CLAUDE.md`) is "no match → display the original", not "no match →
/// French", so the conversation surface needs a stricter helper.
///
/// ### Why a struct, not a `MeeshyUser` extension
/// - The `"fr"` fallback contract on the SDK extension is intentional and
///   used elsewhere (composer language fill, country picker defaults). We
///   don't want to silently change that contract.
/// - This struct is `Equatable + Sendable` so it can be cached / diffed
///   inside the ViewModel without revalidating the underlying `MeeshyUser`
///   on every read.
///
/// ### First extraction step toward splitting `ConversationViewModel`
/// (cf. `tasks/todo.md` P4.2). The struct replaces the
/// `_cachedPreferredLanguages` ad-hoc memo inside the ViewModel.
///
/// ### Phase 3 — device locale 4th priority (2026-05-26)
/// `resolved` now appends a 4th slot derived from the device locale:
///   1. `systemLanguage`
///   2. `regionalLanguage`
///   3. `customDestinationLanguage`
///   4. `deviceLocale` — server-persisted (preferred) OR `Locale.current.languageCode`
///      as the cold-start fallback when `init(user:)` is used in production.
/// The legacy test initializer
/// (`init(userId:systemLanguage:regionalLanguage:customDestinationLanguage:)`)
/// keeps the strict 3-level behaviour for determinism in unit tests that
/// don't opt in to the 4th axis.
///
/// ### UNE descente (2026-09-03) — `ReaderPrism`, au SDK
/// La descente elle-même ne vit plus ici : `resolved` projette
/// `ReaderPrism.resolve(...)`, la fonction que le chemin SOCKET
/// (`MessagePersistenceActor.readerPrism()`) emploie pour graver
/// `replyToJson`. Deux boucles jumelles gravaient deux citations pour un
/// même message dès que la locale appareil manquait au serveur ou qu'aucune
/// langue n'était configurée — et chaque ouverture rejouait un changement de
/// ligne pour un contenu identique. Ce type garde ce qui est à lui : le
/// cache `Equatable` du ViewModel et la sentinelle de test.
struct ConversationLanguagePreferences: Equatable, Sendable {

    /// The user identity these preferences were derived from. Used by the
    /// ViewModel to invalidate its cache when a user switch happens.
    let userId: String?

    /// Configured primary content language (`systemLanguage` in the SDK).
    let systemLanguage: String?

    /// Configured secondary content language.
    let regionalLanguage: String?

    /// Optional per-conversation override that the user typed in. Lowest
    /// auto-priority — only consulted when neither of the configured
    /// languages produced a translation match.
    let customDestinationLanguage: String?

    /// Device locale carried into the resolution as the 4th slot. Three sources:
    /// 1. Explicit override passed by tests (deterministic)
    /// 2. `user.deviceLocale` persisted by the gateway middleware
    /// 3. `Locale.current.languageCode` as the cold-start fallback when the
    ///    server has not seen the client yet
    /// An empty-string override means "explicitly opt out of the 4th slot".
    private let resolvedDeviceLocaleRaw: String?

    init(user: MeeshyUser?, deviceLocaleOverride: String? = nil) {
        self.userId = user?.id
        self.systemLanguage = user?.systemLanguage
        self.regionalLanguage = user?.regionalLanguage
        self.customDestinationLanguage = user?.customDestinationLanguage
        // Production order: explicit override (tests) > server-persisted
        // value > Locale.current. The empty-string override is a sentinel
        // for "skip the 4th slot entirely" so unit tests stay deterministic.
        if let override = deviceLocaleOverride {
            self.resolvedDeviceLocaleRaw = override.isEmpty ? nil : override
        } else {
            // Serveur d'abord, appareil ensuite — la règle vit au SDK, la
            // même que celle du chemin socket.
            self.resolvedDeviceLocaleRaw = ReaderPrism.deviceLocale(for: user)
        }
    }

    /// Internal-only initializer used by tests so we don't have to assemble
    /// a full `MeeshyUser` for every fixture.
    ///
    /// Two initializer flavours coexist on purpose:
    /// - The legacy 4-arg form keeps the deterministic 3-level behaviour
    ///   (no `Locale.current` fallback) so existing tests stay green.
    /// - Pass `deviceLocaleOverride:` to opt into the 4th slot. An empty
    ///   string opts out (mirrors the production sentinel).
    init(
        userId: String?,
        systemLanguage: String?,
        regionalLanguage: String?,
        customDestinationLanguage: String?,
        deviceLocaleOverride: String? = nil
    ) {
        self.userId = userId
        self.systemLanguage = systemLanguage
        self.regionalLanguage = regionalLanguage
        self.customDestinationLanguage = customDestinationLanguage
        if let override = deviceLocaleOverride {
            self.resolvedDeviceLocaleRaw = override.isEmpty ? nil : override
        } else {
            // No override supplied → preserve legacy strict 3-level
            // contract. Tests that need the 4th axis must pass an explicit
            // override (or use `init(user:)`).
            self.resolvedDeviceLocaleRaw = nil
        }
    }

    /// Ordered language priority for translation resolution.
    ///
    /// The order is `systemLanguage → regionalLanguage →
    /// customDestinationLanguage → deviceLocale`, deduplicated
    /// case-insensitively. Empty when nothing is configured — callers are
    /// expected to treat that as "show the original".
    ///
    /// Pure / O(1) (max 4 elements). No "fr" fallback by design — that is
    /// the difference with `MeeshyUser.preferredContentLanguages`.
    var resolved: [String] {
        ReaderPrism.resolve(
            systemLanguage: systemLanguage,
            regionalLanguage: regionalLanguage,
            customDestinationLanguage: customDestinationLanguage,
            deviceLocale: resolvedDeviceLocaleRaw
        )
    }

    /// Normalise un identifier de langue vers ISO 639-1 (2 lettres lowercase).
    ///
    /// Miroir Swift de :
    /// - `packages/shared/utils/language-normalize.ts` (source de vérité TS)
    /// - `MeeshyUser.normalizeLanguageCode` (SDK)
    ///
    /// Toute évolution de la logique de normalisation DOIT toucher les trois
    /// sites pour préserver la symétrie cross-platform. La parité Swift est
    /// vérifiée par `test_normalize_isMirrorOf_MeeshyUserHelper`.
    static func normalize(_ input: String?) -> String? {
        MeeshyUser.normalizeLanguageCode(input)
    }
}
