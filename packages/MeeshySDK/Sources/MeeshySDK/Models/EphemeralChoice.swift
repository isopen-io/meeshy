import Foundation

/// **Ce que l'auteur choisit au sélecteur d'éphémère** (#8303, contrat #8302).
///
/// La flamme-œil n'est PAS une durée : le message disparaît chez chaque lecteur
/// quand il l'a vu puis a quitté la conversation. Aucune seconde ne la décrit,
/// et aucune ne voyage sur le fil — seuls les bits `EPHEMERAL` et
/// `EPHEMERAL_AFTER_READ`. D'où un type SOMME plutôt qu'un cas de plus dans
/// `EphemeralDuration`, dont chaque valeur EST un nombre de secondes.
public enum EphemeralChoice: Hashable, Sendable, Identifiable {
    case afterRead
    case duration(EphemeralDuration)

    /// L'ordre du sélecteur : la flamme-œil, puis 15 s, puis les durées.
    public static let menu: [EphemeralChoice] = [.afterRead] + EphemeralDuration.allCases.map { .duration($0) }

    /// La valeur écrite au brouillon (`DraftStore.ephemeralDurationRawValue`).
    ///
    /// Les durées y gardent leurs secondes, donc les brouillons déjà sur disque
    /// se relisent tels quels. La flamme-œil y est ZÉRO : aucune durée ne vaut
    /// zéro seconde (`MessageProtectionIntent` refuse une durée non positive),
    /// la valeur ne peut donc désigner qu'elle.
    public var storageValue: Int {
        switch self {
        case .afterRead: return 0
        case .duration(let duration): return duration.rawValue
        }
    }

    public init?(storageValue: Int) {
        if storageValue == 0 {
            self = .afterRead
            return
        }
        guard let duration = EphemeralDuration(rawValue: storageValue) else { return nil }
        self = .duration(duration)
    }

    public var id: Int { storageValue }

    /// Les secondes d'une durée ; `nil` pour la flamme-œil.
    public var durationSeconds: Int? {
        guard case .duration(let duration) = self else { return nil }
        return duration.rawValue
    }
}
