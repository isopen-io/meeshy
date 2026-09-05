import Foundation

// MARK: - Login

public struct LoginRequest: Encodable {
    public let username: String
    public let password: String
    public let rememberDevice: Bool

    public init(username: String, password: String, rememberDevice: Bool = true) {
        self.username = username
        self.password = password
        self.rememberDevice = rememberDevice
    }
}

public struct LoginResponseData: Decodable, Sendable {
    public let user: MeeshyUser?
    public let token: String?
    public let sessionToken: String?
    public let expiresIn: Int?
    public let requires2FA: Bool?
    public let twoFactorToken: String?

    /// `POST /auth/register` sert DEUX charges sous le même 200 : le compte
    /// créé, ou — quand le numéro appartient déjà à un compte vérifié — un
    /// refus qui ne crée RIEN et se signale par ce seul drapeau
    /// (`services/gateway/src/routes/auth/register.ts`). Sans ce champ, la
    /// branche du conflit se décodait en `user: nil, token: nil` et remontait
    /// en « Response missing token/user data » : un refus MOTIVÉ rendu comme
    /// une panne, donc irrattrapable par l'écran.
    public let phoneOwnershipConflict: Bool?

    public init(
        user: MeeshyUser?,
        token: String?,
        sessionToken: String?,
        expiresIn: Int?,
        requires2FA: Bool?,
        twoFactorToken: String?,
        phoneOwnershipConflict: Bool? = nil
    ) {
        self.user = user
        self.token = token
        self.sessionToken = sessionToken
        self.expiresIn = expiresIn
        self.requires2FA = requires2FA
        self.twoFactorToken = twoFactorToken
        self.phoneOwnershipConflict = phoneOwnershipConflict
    }
}

// MARK: - Register

/// La charge de `POST /auth/register`.
///
/// **#5218 — `username`, `firstName` et `lastName` ne partent plus.** La
/// passerelle les DÉRIVE de `displayName` ; les envoyer depuis le client
/// obligeait l'utilisateur à composer un pseudo unique et à découper son nom en
/// deux, soit trois écrans de wizard pour trois valeurs que le serveur sait
/// fabriquer. Ils restent déclarés — optionnels — parce que la reprise après un
/// transfert de numéro réémet une inscription dont le serveur a déjà écho ; un
/// champ `nil` est ABSENT du JSON (l'`Encodable` synthétisé encode un
/// `Optional` avec `encodeIfPresent`), donc ne rien passer ne pose rien.
public struct RegisterRequest: Encodable, Sendable {
    /// Le nom que l'utilisateur se donne. Unique champ d'identité de
    /// l'inscription : la passerelle en dérive `username`, `firstName` et
    /// `lastName`.
    public let displayName: String?
    public let email: String
    public let password: String
    /// Numéro complet (indicatif + chiffres). `nil` ⇒ absent de la charge —
    /// le téléphone n'est jamais obligatoire.
    public let phoneNumber: String?
    /// ISO 3166-1 alpha-2 du pays choisi. Voyage avec `phoneNumber` ou pas du tout.
    public let phoneCountryCode: String?
    public let systemLanguage: String
    public let regionalLanguage: String?
    public let username: String?
    public let firstName: String?
    public let lastName: String?

    public init(
        displayName: String? = nil,
        email: String,
        password: String,
        phoneNumber: String? = nil,
        phoneCountryCode: String? = nil,
        systemLanguage: String = "fr",
        regionalLanguage: String? = nil,
        username: String? = nil,
        firstName: String? = nil,
        lastName: String? = nil
    ) {
        self.displayName = displayName
        self.email = email
        self.password = password
        self.phoneNumber = phoneNumber
        self.phoneCountryCode = phoneCountryCode
        self.systemLanguage = systemLanguage
        self.regionalLanguage = regionalLanguage
        self.username = username
        self.firstName = firstName
        self.lastName = lastName
    }
}

/// Le refus « ce numéro appartient déjà à un compte vérifié ».
///
/// Servi en **200**, avec `phoneOwnershipConflict: true` et AUCUN compte créé
/// (`services/gateway/src/routes/auth/register.ts`). C'est donc un succès HTTP
/// qui n'a rien créé : sans type dédié, il ne pouvait se distinguer d'une
/// réponse tronquée, et l'écran rendait « erreur inconnue » pour un refus dont
/// il connaît pourtant le remède exact (laisser le numéro vide).
public struct PhoneOwnershipConflict: Error, Sendable, Equatable {
    public init() {}
}

// MARK: - Origine d'une session

/// D'OÙ vient la session courante — et non « y a-t-il une session », que
/// `isAuthenticated` dit déjà.
///
/// Une inscription et une connexion posent le même booléen, et pourtant elles
/// n'autorisent pas la même chose : demander la permission de notification à
/// quelqu'un qui vient de créer son compte, c'est une alerte système avant le
/// premier message. Sans ce type, le seul moyen de les distinguer était de
/// deviner — et un `isAuthenticated` ne se laisse pas interroger sur son passé.
public enum SessionOrigin: String, Sendable, Equatable {
    /// L'utilisateur s'est connecté à un compte existant (mot de passe, 2FA,
    /// lien magique).
    case login
    /// Le compte vient d'être CRÉÉ sur cet appareil.
    case registration
    /// Session relue du trousseau au démarrage, ou jeton renouvelé.
    case restored
}

// MARK: - Magic Link

public struct MagicLinkRequest: Encodable {
    public let email: String
    public let deviceFingerprint: String?

    public init(email: String, deviceFingerprint: String? = nil) {
        self.email = email
        self.deviceFingerprint = deviceFingerprint
    }
}

public struct MagicLinkResponse: Decodable {
    public let success: Bool
    public let message: String?
    public let expiresInSeconds: Int?
    public let error: String?
}

public struct MagicLinkValidateRequest: Encodable {
    public let token: String

    public init(token: String) {
        self.token = token
    }
}

// MARK: - Forgot Password

public struct ForgotPasswordRequest: Encodable {
    public let email: String

    public init(email: String) {
        self.email = email
    }
}

public struct ResetPasswordRequest: Encodable {
    public let token: String
    public let newPassword: String

    public init(token: String, newPassword: String) {
        self.token = token
        self.newPassword = newPassword
    }
}

// MARK: - Phone Verification

public struct SendPhoneCodeRequest: Encodable {
    public let phoneNumber: String

    public init(phoneNumber: String) {
        self.phoneNumber = phoneNumber
    }
}

public struct VerifyPhoneRequest: Encodable {
    public let phoneNumber: String
    public let code: String

    public init(phoneNumber: String, code: String) {
        self.phoneNumber = phoneNumber
        self.code = code
    }
}

public struct VerifyPhoneResponse: Decodable {
    public let verified: Bool?
    public let phoneTransferToken: String?
}

// MARK: - Email Verification

public struct VerifyEmailRequest: Encodable {
    public let code: String

    public init(code: String) {
        self.code = code
    }
}

public struct VerifyEmailCodeRequest: Encodable {
    public let code: String
    public let email: String

    public init(code: String, email: String) {
        self.code = code
        self.email = email
    }
}

public struct ResendVerificationRequest: Encodable {
    public let email: String

    public init(email: String) {
        self.email = email
    }
}


// MARK: - Availability Check

/// La réponse de `GET /auth/check-availability`.
///
/// **Le contrat a changé (#4158).** L'adresse et le numéro ne disent plus si un
/// compte existe : les confirmer sans authentification faisait de cette route
/// un oracle, alors que `/forgot-password` et `/magic-link/request` répondent
/// délibérément « succès » dans tous les cas pour ne rien révéler. Ils rendent
/// désormais un verdict de FORME.
///
/// Le PSEUDO, lui, répond toujours sur l'existence — c'est une clé publique,
/// déjà énumérable par `GET /u/:username`.
public struct AvailabilityResponse: Decodable {
    public let usernameAvailable: Bool?
    public let suggestions: [String]?

    /// Forme seulement. `nil` quand l'adresse n'a pas été soumise.
    public let emailValid: Bool?
    /// Forme seulement. `nil` quand le numéro n'a pas été soumis.
    public let phoneNumberValid: Bool?
    /// Le numéro normalisé, quand il est bien formé.
    public let phoneNumberE164: String?

    /// Ne parle QUE du pseudo.
    ///
    /// Elle retombait auparavant sur `emailAvailable ?? phoneNumberAvailable`,
    /// des champs que le serveur ne sert plus : la laisser ainsi ferait rendre
    /// `false` à chaque adresse, et l'écran d'inscription dirait « déjà
    /// utilisée » à tout le monde.
    public var available: Bool {
        usernameAvailable ?? false
    }

    /// L'identifiant de contact soumis est-il BIEN FORMÉ ? (jamais « libre »)
    public var wellFormed: Bool {
        emailValid ?? phoneNumberValid ?? true
    }
}

// MARK: - Phone Ownership Check (récupération de compte)

public struct PhoneOwnerMaskedInfo: Decodable, Sendable, Equatable {
    public let displayName: String?
    public let username: String?
    public let email: String?
}

/// Réponse de `/auth/phone-transfer/check`. Quand `recoverySuggested` est vrai,
/// le numéro appartient à un compte dormant dont l'identité déclarée matche —
/// le client oriente alors vers la récupération de compte plutôt que la
/// création d'un doublon.
/// La réponse de `POST /auth/phone-transfer/check`.
///
/// **`exists` a été RETIRÉ du fil (#4239).** Il confirmait, sans compte, qu'un
/// numéro appartient à un utilisateur Meeshy — le même oracle que #4158 ferme
/// sur la porte voisine. `maskedInfo` ne vient plus que lorsque la récupération
/// est suggérée, c'est-à-dire lorsque l'appelant a déjà prouvé qu'il connaît le
/// vrai nom du titulaire.
///
/// `dormant`, `dormantSince` et `nameSimilarity` n'ont jamais été servis par
/// cette route — elle les tait délibérément. Les déclarer ici les laissait
/// paraître disponibles ; ils sont retirés avec `exists`.
public struct PhoneOwnershipResponse: Decodable, Sendable, Equatable {
    public let maskedInfo: PhoneOwnerMaskedInfo?
    public let recoverySuggested: Bool?
}

// MARK: - Refresh Token

public struct RefreshTokenRequest: Encodable {
    public let token: String
    public let sessionToken: String?

    public init(token: String, sessionToken: String? = nil) {
        self.token = token
        self.sessionToken = sessionToken
    }
}

// MARK: - User Model

public struct MeeshyUser: Codable, Identifiable, Sendable {
    public let id: String
    public let username: String
    public let email: String?
    public let firstName: String?
    public let lastName: String?
    public let displayName: String?
    public let bio: String?
    public let avatar: String?
    public let avatarThumbHash: String?
    public let banner: String?
    public let bannerThumbHash: String?
    public let role: String?
    public let systemLanguage: String?
    public let regionalLanguage: String?
    public let isOnline: Bool?
    public let lastActiveAt: String?
    public let createdAt: String?
    public let updatedAt: String?
    public let blockedUserIds: [String]?

    // Account status
    public let isActive: Bool?
    public let deactivatedAt: String?
    public let isAnonymous: Bool?
    public let isMeeshyer: Bool?
    public let phoneNumber: String?
    public let emailVerifiedAt: String?
    public let phoneVerifiedAt: String?

    // Translation preferences (from GET /users/:id)
    public let customDestinationLanguage: String?
    public let autoTranslateEnabled: Bool?

    /// Locale appareil propagée par le client (iOS `Locale.current.identifier`,
    /// web `Accept-Language`) et persistée serveur dans `User.deviceLocale`.
    ///
    /// 4e priorité Prisme Linguistique (`packages/shared/utils/conversation-helpers.ts`
    /// → `resolveUserLanguagesOrdered`). Optionnel — `nil` = client legacy
    /// n'ayant pas encore envoyé `X-Device-Locale`, l'app retombe alors sur les
    /// 3 préférences in-app + fallback `"fr"`.
    public let deviceLocale: String?

    // Profile enrichment
    public let timezone: String?
    public let registrationCountry: String?
    public let profileCompletionRate: Int?
    public let signalIdentityKeyPublic: String?

    // Voice profile (from GET /users/:id). Optional — rollout-safe: older
    // responses omit these fields, which decode to `nil` via synthesized Codable.
    public let voicePublic: Bool?
    public let voiceSampleUrl: String?
    public let voiceSampleDurationMs: Int?
    public let voiceQuality: Double?

    public init(
        id: String, username: String, email: String? = nil,
        firstName: String? = nil, lastName: String? = nil,
        displayName: String? = nil, bio: String? = nil,
        avatar: String? = nil, avatarThumbHash: String? = nil, banner: String? = nil, bannerThumbHash: String? = nil, role: String? = nil,
        systemLanguage: String? = nil, regionalLanguage: String? = nil,
        isOnline: Bool? = nil, lastActiveAt: String? = nil,
        createdAt: String? = nil, updatedAt: String? = nil,
        blockedUserIds: [String]? = nil,
        isActive: Bool? = nil, deactivatedAt: String? = nil,
        isAnonymous: Bool? = nil, isMeeshyer: Bool? = nil,
        phoneNumber: String? = nil,
        emailVerifiedAt: String? = nil, phoneVerifiedAt: String? = nil,
        customDestinationLanguage: String? = nil,
        autoTranslateEnabled: Bool? = nil,
        deviceLocale: String? = nil,
        timezone: String? = nil,
        registrationCountry: String? = nil,
        profileCompletionRate: Int? = nil,
        signalIdentityKeyPublic: String? = nil,
        voicePublic: Bool? = nil,
        voiceSampleUrl: String? = nil,
        voiceSampleDurationMs: Int? = nil,
        voiceQuality: Double? = nil
    ) {
        self.id = id
        self.username = username
        self.email = email
        self.firstName = firstName
        self.lastName = lastName
        self.displayName = displayName
        self.bio = bio
        self.avatar = avatar
        self.avatarThumbHash = avatarThumbHash
        self.banner = banner
        self.bannerThumbHash = bannerThumbHash
        self.role = role
        self.systemLanguage = systemLanguage
        self.regionalLanguage = regionalLanguage
        self.isOnline = isOnline
        self.lastActiveAt = lastActiveAt
        self.createdAt = createdAt
        self.updatedAt = updatedAt
        self.blockedUserIds = blockedUserIds
        self.isActive = isActive
        self.deactivatedAt = deactivatedAt
        self.isAnonymous = isAnonymous
        self.isMeeshyer = isMeeshyer
        self.phoneNumber = phoneNumber
        self.emailVerifiedAt = emailVerifiedAt
        self.phoneVerifiedAt = phoneVerifiedAt
        self.customDestinationLanguage = customDestinationLanguage
        self.autoTranslateEnabled = autoTranslateEnabled
        self.deviceLocale = deviceLocale
        self.timezone = timezone
        self.registrationCountry = registrationCountry
        self.profileCompletionRate = profileCompletionRate
        self.signalIdentityKeyPublic = signalIdentityKeyPublic
        self.voicePublic = voicePublic
        self.voiceSampleUrl = voiceSampleUrl
        self.voiceSampleDurationMs = voiceSampleDurationMs
        self.voiceQuality = voiceQuality
    }

    /// Returns a new MeeshyUser with the specified profile fields replaced.
    /// `nil` arguments preserve the existing value (no erase) — matching the
    /// PATCH-style API contract used by the profile mutation endpoints.
    /// All other fields are carried over from `self`.
    public func withProfileChanges(
        displayName: String? = nil,
        bio: String? = nil,
        avatar: String? = nil,
        avatarThumbHash: String? = nil,
        banner: String? = nil,
        bannerThumbHash: String? = nil,
        voicePublic: Bool? = nil
    ) -> MeeshyUser {
        MeeshyUser(
            id: id, username: username, email: email,
            firstName: firstName, lastName: lastName,
            displayName: displayName ?? self.displayName,
            bio: bio ?? self.bio,
            avatar: avatar ?? self.avatar,
            avatarThumbHash: avatarThumbHash ?? self.avatarThumbHash,
            banner: banner ?? self.banner,
            bannerThumbHash: bannerThumbHash ?? self.bannerThumbHash,
            role: role,
            systemLanguage: systemLanguage, regionalLanguage: regionalLanguage,
            isOnline: isOnline, lastActiveAt: lastActiveAt,
            createdAt: createdAt, updatedAt: updatedAt,
            blockedUserIds: blockedUserIds,
            isActive: isActive, deactivatedAt: deactivatedAt,
            isAnonymous: isAnonymous, isMeeshyer: isMeeshyer,
            phoneNumber: phoneNumber,
            emailVerifiedAt: emailVerifiedAt, phoneVerifiedAt: phoneVerifiedAt,
            customDestinationLanguage: customDestinationLanguage,
            autoTranslateEnabled: autoTranslateEnabled,
            deviceLocale: deviceLocale,
            timezone: timezone,
            registrationCountry: registrationCountry,
            profileCompletionRate: profileCompletionRate,
            signalIdentityKeyPublic: signalIdentityKeyPublic,
            voicePublic: voicePublic ?? self.voicePublic,
            voiceSampleUrl: voiceSampleUrl,
            voiceSampleDurationMs: voiceSampleDurationMs,
            voiceQuality: voiceQuality
        )
    }

    /// Ordered list of preferred content languages for the Prisme Linguistique.
    /// Resolution order (extended 2026-05-26):
    /// 1. `systemLanguage`             — primary in-app preference
    /// 2. `regionalLanguage`           — secondary in-app preference
    /// 3. `customDestinationLanguage`  — per-conversation override
    /// 4. `deviceLocale`               — OS-level locale (4th priority)
    /// 5. `"fr"`                       — ultimate fallback when everything is `nil`
    ///
    /// System / regional / custom languages preserve their original casing so
    /// downstream consumers that match against language tags case-sensitively
    /// keep working. `deviceLocale` is normalised via `normalizeLanguageCode`
    /// because it arrives as `"fr_FR"` / `"zh-Hant-HK"` and needs to collapse
    /// to ISO 639-1 for NLLB-200 matching. Dedup is case-insensitive so a
    /// device locale that resolves to an already-listed code is dropped.
    public var preferredContentLanguages: [String] {
        var preferred: [String] = []
        let appendIfDistinct: (String?) -> Void = { code in
            guard let code, !code.isEmpty else { return }
            if preferred.contains(where: { $0.caseInsensitiveCompare(code) == .orderedSame }) {
                return
            }
            preferred.append(code)
        }
        appendIfDistinct(systemLanguage)
        appendIfDistinct(regionalLanguage)
        appendIfDistinct(customDestinationLanguage)
        appendIfDistinct(Self.normalizeLanguageCode(deviceLocale))
        if preferred.isEmpty {
            preferred.append("fr")
        }
        return preferred
    }

    /// Normalise un identifier de langue vers un code supporté par Meeshy.
    ///
    /// Préserve les codes supportés tels quels — y compris les codes ISO 639-3
    /// des langues sans équivalent 639-1 (`"bas"`, `"dua"`, `"ewo"`), qui NE
    /// doivent jamais être tronqués à 2 lettres (`"bas"` → `"ba"` = Bachkir,
    /// langue sans rapport, casserait la résolution du Prisme Linguistique).
    /// Un ISO 639-2/639-3 sans entrée Meeshy est réduit à son ISO 639-1 via la
    /// table EXPLICITE `iso639ReductionMap` (`"eng"` → `"en"`, `"spa"` → `"es"`,
    /// `"swe"` → `"sv"`), JAMAIS par troncature aveugle : `"swe"` (Suédois) ne
    /// devient pas `"sw"` (Swahili) et `"fil"` (Filipino, sans équivalent 639-1)
    /// n'est PAS mappé sur `"fi"` (Finnois) mais rejeté (`nil`).
    ///
    /// Miroir Swift de `normalizeLanguageCode` :
    /// - `packages/shared/utils/language-normalize.ts` (source de vérité TS)
    /// - `ConversationLanguagePreferences.normalize` (app iOS)
    ///
    /// Toute évolution de la logique de normalisation DOIT toucher les trois
    /// sites pour préserver la symétrie cross-platform.
    public static func normalizeLanguageCode(_ input: String?) -> String? {
        guard let raw = input?.trimmingCharacters(in: .whitespacesAndNewlines),
              raw.count >= 2 else { return nil }
        let primary = raw
            .split(whereSeparator: { $0 == "-" || $0 == "_" })
            .first?
            .lowercased() ?? ""
        guard primary.count >= 2,
              primary.allSatisfy({ $0.isLetter && $0.isASCII }) else {
            return nil
        }

        // Un code supporté (2 ou 3 lettres, ex. "bas") est renvoyé tel quel.
        if LanguageData.supportedCodeSet.contains(primary) {
            return primary
        }

        // ISO 639-2/639-3 sans entrée Meeshy directe : réduction via table
        // EXPLICITE (jamais par troncature — `"fil"` → `"fi"`, `"swe"` → `"sw"`
        // étaient des collisions silencieuses). Cible re-validée contre les codes
        // supportés. Miroir de `ISO_639_3_TO_1` (language-normalize.ts, TS SSOT).
        if primary.count > 2 {
            guard let reduced = Self.iso639ReductionMap[primary],
                  LanguageData.supportedCodeSet.contains(reduced) else { return nil }
            return reduced
        }

        // Alias ISO 639-1 DÉPRÉCIÉ (`iw`/`in`/`ji`) : réduit vers le code canonique
        // courant, re-validé contre les codes supportés (comme le chemin 3-lettres).
        // La JVM normalise `he→iw`, `id→in`, `yi→ji` ; un client Android émet donc
        // `iw` sur une locale hébraïque, qui verbatim ne matcherait aucune trad `he`.
        // Miroir de `LEGACY_ISO_639_1` (language-normalize.ts, TS SSOT).
        if let legacy = Self.legacyISO6391Map[primary] {
            return LanguageData.supportedCodeSet.contains(legacy) ? legacy : nil
        }

        // Code 2-lettres inconnu : conservé (comportement historique).
        return primary
    }

    /// La clé canonique sous laquelle deux identifiants de langue sont considérés
    /// comme LA MÊME — pour la déduplication et le rapprochement de clés du Prisme.
    ///
    /// Miroir FIDÈLE de `normalizeLanguageForDedup`
    /// (`packages/shared/utils/language-normalize.ts`, SSOT TS) et de
    /// `LanguageCodeNormalizer.normalizeForDedup`
    /// (`apps/android/core/model/.../lang/LanguageCodeNormalizer.kt`) :
    /// `normalizeLanguageCode` d'abord, sinon le SOUS-TAG PRIMAIRE lowercased
    /// (région strippée), sinon la chaîne entière lowercased. TOTALE — ne rend
    /// jamais `nil`, parce qu'une comparaison doit produire une clé pour CHAQUE
    /// jeton qu'on lui donne, même ceux que `normalizeLanguageCode` rejette.
    ///
    /// Le REPLI strippe la région pour TOUT code, pas seulement ceux que
    /// `normalizeLanguageCode` sait réduire. Sans lui, un code HORS CATALOGUE
    /// tagué région (`"yue-HK"`, Cantonais absent du catalogue Meeshy)
    /// canoniserait vers `"yue-hk"` avec un `.lowercased()` brut et ne
    /// matcherait pas un `"yue"` — comptant pour deux langues distinctes et
    /// rétrogradant la langue PRIMAIRE du lecteur : la violation exacte du
    /// Prisme (#3) que le rapprochement de clés combat. Les miroirs TS/Kotlin
    /// strippent déjà la région au repli ; ce site alignait un `.lowercased()`
    /// verbatim, seul divergent des trois.
    ///
    /// Toute évolution DOIT toucher les TROIS sites (TS + Kotlin + Swift).
    public static func normalizeLanguageForDedup(_ code: String) -> String {
        if let normalized = normalizeLanguageCode(code) { return normalized }
        let primary = code
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .split(omittingEmptySubsequences: false, whereSeparator: { $0 == "-" || $0 == "_" })
            .first.map { $0.lowercased() } ?? ""
        return primary.isEmpty ? code.lowercased() : primary
    }

    /// Table de réduction des codes ISO 639-1 DÉPRÉCIÉS vers leur code canonique
    /// courant (miroir de `LEGACY_ISO_639_1` dans
    /// `packages/shared/utils/language-normalize.ts`). `iw`/`in`/`ji` sont les
    /// anciens codes de l'hébreu/indonésien/yiddish, encore émis par la JVM
    /// (`java.util.Locale.getLanguage()` : `he→iw`, `id→in`, `yi→ji`). Chaque cible
    /// est re-validée contre les codes supportés. Toute évolution DOIT toucher les
    /// deux sites (TS + Swift).
    private static let legacyISO6391Map: [String: String] = [
        "iw": "he", "in": "id", "ji": "yi"
    ]

    /// Table de réduction ISO 639-2/639-3 → ISO 639-1 (miroir de `ISO_639_3_TO_1`
    /// dans `packages/shared/utils/language-normalize.ts`). Couvre les variantes
    /// 639-2/T ET 639-2/B qui diffèrent (`deu`/`ger`, `fra`/`fre`, `zho`/`chi`…).
    /// Tout code 3-lettres absent (dont `"fil"`, `"tgl"`) est rejeté — jamais
    /// tronqué. Toute évolution DOIT toucher les deux sites (TS + Swift).
    private static let iso639ReductionMap: [String: String] = [
        "afr": "af", "amh": "am", "ara": "ar", "ben": "bn", "bul": "bg",
        "ces": "cs", "cze": "cs", "dan": "da", "deu": "de", "ger": "de",
        "ell": "el", "gre": "el", "eng": "en", "ewe": "ee", "fas": "fa", "per": "fa",
        "fin": "fi", "fra": "fr", "fre": "fr", "hau": "ha", "heb": "he", "hin": "hi",
        "hrv": "hr", "hun": "hu", "hye": "hy", "arm": "hy", "ibo": "ig", "ind": "id",
        "ita": "it", "jpn": "ja", "kin": "rw", "kor": "ko", "lin": "ln", "lit": "lt",
        "lug": "lg", "mlg": "mg", "msa": "ms", "may": "ms", "nld": "nl", "dut": "nl",
        "nor": "no", "nya": "ny", "orm": "om", "pol": "pl", "por": "pt", "ron": "ro",
        "rum": "ro", "run": "rn", "rus": "ru", "sna": "sn", "som": "so", "spa": "es",
        "swa": "sw", "swe": "sv", "tha": "th", "tir": "ti", "tur": "tr", "ukr": "uk",
        "urd": "ur", "vie": "vi", "wol": "wo", "xho": "xh", "yor": "yo", "zho": "zh",
        "chi": "zh", "zul": "zu"
    ]
}

// MARK: - /auth/me Response

public struct MeResponseData: Decodable {
    public let user: MeeshyUser
}

// MARK: - Saved Account (multi-account support)

public struct SavedAccount: Codable, Identifiable, Sendable {
    public let id: String         // userId
    public let username: String
    public let displayName: String?
    public let avatarURL: String?
    public let lastActiveAt: Date

    public var shortName: String { displayName ?? username }

    public init(id: String, username: String, displayName: String?, avatarURL: String?, lastActiveAt: Date) {
        self.id = id
        self.username = username
        self.displayName = displayName
        self.avatarURL = avatarURL
        self.lastActiveAt = lastActiveAt
    }
}

// MARK: - CacheIdentifiable Conformance

extension MeeshyUser: CacheIdentifiable {}
