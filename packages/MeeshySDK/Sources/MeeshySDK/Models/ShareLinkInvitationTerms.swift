import Foundation

// MARK: - Language share

/// Une langue et sa part d'un ensemble — la barre de proportions et sa
/// légende, sur la page d'invitation comme sur la fiche du lien.
public struct LanguageShare: Equatable, Sendable, Identifiable {
    public let code: String
    /// Entre 0 et 1.
    public let fraction: Double
    /// `false` quand la source ne porte que la LISTE des langues, sans
    /// décompte : la barre reste lisible, la légende ne montre pas de
    /// pourcentage qu'elle ne pourrait pas justifier.
    public let isMeasured: Bool

    public var id: String { code }

    public init(code: String, fraction: Double, isMeasured: Bool) {
        self.code = code
        self.fraction = fraction
        self.isMeasured = isMeasured
    }

    /// Pourcentage arrondi, pour la légende.
    public var percent: Int { Int((fraction * 100).rounded()) }

    /// Parts MESURÉES, de la plus grande à la plus petite. Les décomptes nuls
    /// ou négatifs sont écartés ; un total nul ne rend rien.
    public static func weighted(_ counts: [(String, Int)]) -> [LanguageShare] {
        let kept = counts.filter { $0.1 > 0 }
        let total = kept.reduce(0) { $0 + $1.1 }
        guard total > 0 else { return [] }
        return kept
            .sorted { $0.1 == $1.1 ? $0.0 < $1.0 : $0.1 > $1.1 }
            .map { LanguageShare(code: $0.0, fraction: Double($0.1) / Double(total), isMeasured: true) }
    }

    /// Parts ÉGALES d'une simple liste de langues (l'aperçu public ne sert
    /// que `spokenLanguages`, sans décompte).
    public static func even(_ codes: [String]) -> [LanguageShare] {
        let unique = codes.reduce(into: [String]()) { if !$0.contains($1) { $0.append($1) } }
        guard !unique.isEmpty else { return [] }
        let fraction = 1.0 / Double(unique.count)
        return unique.map { LanguageShare(code: $0, fraction: fraction, isMeasured: false) }
    }
}

// MARK: - Landing choices

/// Ce que la page d'invitation propose de faire (#7795).
public enum InviteLandingChoice: Equatable, Sendable, Hashable {
    /// Rejoindre avec le compte présent sur l'appareil.
    case joinWithAccount
    /// Entrer sans compte (formulaire invité), ou reprendre la session
    /// invitée déjà ouverte sur ce lien.
    case joinAnonymously
    case signIn
    case signUp
}

/// Ce que le formulaire invité demandera.
public enum InviteRequestedField: Equatable, Sendable {
    case name
    case nickname
    case email
    case birthday
}

/// Les règles PURES de la page d'invitation : qui peut entrer, comment, et
/// combien de temps / de places il reste. Aucun I/O — la page et la fiche du
/// propriétaire (#7797) lisent les mêmes réponses.
public enum ShareLinkInvitationTerms {

    /// La matrice des choix, par ordre d'importance (le premier est l'action
    /// principale).
    ///
    /// - Sans compte : l'anonymat d'abord (sauf lien exigeant un compte), puis
    ///   se connecter et créer un compte.
    /// - Avec un compte : le compte d'abord, l'anonymat en second si le lien
    ///   l'autorise.
    /// - Lien fermé (complet ou expiré) : rien — la page le dit au lieu d'offrir
    ///   un bouton qui échouera.
    public static func choices(isSignedIn: Bool, requireAccount: Bool, isOpen: Bool = true) -> [InviteLandingChoice] {
        guard isOpen else { return [] }
        if isSignedIn {
            return requireAccount ? [.joinWithAccount] : [.joinWithAccount, .joinAnonymously]
        }
        return requireAccount ? [.signIn, .signUp] : [.joinAnonymously, .signIn, .signUp]
    }

    /// Places restantes ; `nil` = illimité.
    public static func remainingPlaces(maxUses: Int?, currentUses: Int) -> Int? {
        maxUses.map { max(0, $0 - currentUses) }
    }

    /// Jours de validité restants, arrondis AU-DESSUS (un lien qui expire dans
    /// cinq heures est valable « encore 1 jour ») ; `nil` = sans échéance,
    /// `0` = expiré.
    public static func daysLeft(until expiresAt: Date?, now: Date) -> Int? {
        guard let expiresAt else { return nil }
        let interval = expiresAt.timeIntervalSince(now)
        guard interval > 0 else { return 0 }
        return Int((interval / 86_400).rounded(.up))
    }

    /// Le lien accepte-t-il encore quelqu'un ?
    public static func isOpen(maxUses: Int?, currentUses: Int, expiresAt: Date?, now: Date) -> Bool {
        let placesLeft = remainingPlaces(maxUses: maxUses, currentUses: currentUses).map { $0 > 0 } ?? true
        let timeLeft = daysLeft(until: expiresAt, now: now).map { $0 > 0 } ?? true
        return placesLeft && timeLeft
    }

    /// Ce que le formulaire invité demandera : le nom TOUJOURS (le formulaire
    /// l'exige), puis ce que le lien ajoute.
    public static func requestedFields(requireNickname: Bool, requireEmail: Bool, requireBirthday: Bool) -> [InviteRequestedField] {
        [.name]
            + (requireNickname ? [.nickname] : [])
            + (requireEmail ? [.email] : [])
            + (requireBirthday ? [.birthday] : [])
    }
}

public extension ShareLinkInfo {
    func isOpen(now: Date = Date()) -> Bool {
        ShareLinkInvitationTerms.isOpen(maxUses: maxUses, currentUses: currentUses, expiresAt: expiresAt, now: now)
    }

    func landingChoices(isSignedIn: Bool, now: Date = Date()) -> [InviteLandingChoice] {
        ShareLinkInvitationTerms.choices(isSignedIn: isSignedIn, requireAccount: requireAccount, isOpen: isOpen(now: now))
    }

    var remainingPlaces: Int? {
        ShareLinkInvitationTerms.remainingPlaces(maxUses: maxUses, currentUses: currentUses)
    }

    func daysLeft(now: Date = Date()) -> Int? {
        ShareLinkInvitationTerms.daysLeft(until: expiresAt, now: now)
    }

    var requestedFields: [InviteRequestedField] {
        ShareLinkInvitationTerms.requestedFields(
            requireNickname: requireNickname, requireEmail: requireEmail, requireBirthday: requireBirthday
        )
    }

    /// Les langues parlées dans le groupe, en parts égales (l'aperçu ne sert
    /// pas de décompte).
    var spokenLanguageShares: [LanguageShare] {
        LanguageShare.even(stats.spokenLanguages)
    }
}

public extension MyShareLink {
    var remainingPlaces: Int? {
        ShareLinkInvitationTerms.remainingPlaces(maxUses: maxUses, currentUses: currentUses)
    }
}
