import Foundation

/// **Loi pure de la fenêtre d'accent de la pastille** (issue #4050, directive
/// porteur 2026-08-27 : « la pill doit s'afficher, rester bien visible avant de
/// reprendre la forme normale au bout d'au moins 6 secondes si l'utilisateur
/// écrit encore ; si un nouvel utilisateur écrit entre-temps — donc nouvelle
/// entrée dans la file — il faut qu'elle grossisse encore aussi pendant 6 s, et
/// ainsi de suite »).
///
/// **Elle amende #4026**, qui liait l'accent à la PRÉSENCE du signal : une
/// frappe tenait l'accent tant qu'elle durait et le rendait à la seconde où
/// elle s'arrêtait. Les deux bords étaient faux, et c'est la même erreur des
/// deux côtés — avoir fait dépendre une durée d'AFFICHAGE de la durée d'un
/// ÉVÉNEMENT. Ce que l'œil doit voir n'a pas la même horloge que ce que le
/// réseau raconte.
///
/// La règle est donc une **fenêtre glissante réarmable**, gouvernée par le
/// temps seul :
/// - **borne haute** — au bout de `accentWindow`, retour à la forme normale
///   même si la personne écrit encore ; la pastille RESTE visible, c'est
///   l'accent qui retombe (l'effacement, lui, est la loi voisine #4017) ;
/// - **borne basse** — l'accent tient sa fenêtre même si le signal qui l'a
///   armée disparaît avant ; seule l'échéance l'éteint ;
/// - **réarmement** — toute entrée NEUVE relance une fenêtre PLEINE depuis SON
///   arrivée, jamais le reliquat de la précédente.
///
/// Type pur, `nonisolated`, sans horloge murale : la peau injecte l'instant —
/// même patron que `ScrollTimePillLaw` et `FocalMagnificationLaw`.
nonisolated enum SyncPillAccentLaw {

    /// Durée pendant laquelle la pastille reste dans sa forme accentuée après
    /// l'arrivée d'une entrée neuve.
    ///
    /// **Six secondes, et c'est un nombre que porte AUSSI `idleHideDelay`**
    /// (#4017, l'effacement au repos). Les deux sont nommées séparément à
    /// dessein : elles répondent à deux questions différentes — « combien de
    /// temps la pastille est-elle GROSSE » et « au bout de combien de temps
    /// sans rien disparaît-elle ». Régler l'une ne doit jamais bouger l'autre
    /// par accident.
    static let accentWindow: TimeInterval = 6.0

    /// L'échéance d'accent après un changement de la file.
    ///
    /// - Parameters:
    ///   - previous: l'échéance courante, `nil` si aucun accent n'est armé.
    ///   - hasNewEntries: au moins un identifiant d'entrée est NEUF. Une frappe
    ///     qui continue garde le même id (`typing.<conv>`) : elle n'est pas
    ///     neuve et ne réarme donc rien — c'est ce qui donne la borne haute.
    ///   - entriesAreEmpty: la file est vide (plus rien à montrer).
    ///   - now: l'instant du changement.
    static func deadline(
        previous: Date?,
        hasNewEntries: Bool,
        entriesAreEmpty: Bool,
        now: Date
    ) -> Date? {
        guard !entriesAreEmpty else { return nil }
        guard hasNewEntries else { return previous }
        return now.addingTimeInterval(accentWindow)
    }

    /// La pastille est-elle dans sa forme accentuée à cet instant ?
    ///
    /// Strictement AVANT l'échéance : à l'instant même de l'échéance, l'accent
    /// est retombé. Une arrivée à ce même instant réarme (cf. `deadline`), donc
    /// aucun signal ne se perd dans cette frontière.
    static func isAccented(deadline: Date?, now: Date) -> Bool {
        guard let deadline else { return false }
        return now < deadline
    }

    /// Délai avant l'effacement au repos (#4017), mesuré depuis MAINTENANT.
    ///
    /// **La forme normale doit être VISIBLE.** L'effacement de #4017 et la
    /// fenêtre d'accent de #4050 valent tous deux six secondes et partaient
    /// tous deux de l'arrivée d'une entrée : la pastille aurait donc quitté sa
    /// forme accentuée et disparu au MÊME instant, et « reprendre la forme
    /// normale » n'aurait jamais rien voulu dire à l'écran — le porteur aurait
    /// vu la grosse pastille s'évanouir, pas rétrécir.
    ///
    /// L'effacement se compte donc depuis la FIN de l'accent : accentuée
    /// pendant la fenêtre, puis normale pendant `idleHideDelay`, puis effacée.
    /// Chaque nouvelle entrée repousse les deux d'un coup, puisqu'elle repousse
    /// l'échéance dont ce délai dérive.
    static func hideDelay(deadline: Date?, now: Date, idleHideDelay: TimeInterval) -> TimeInterval {
        let remainingAccent = deadline.map { max(0, $0.timeIntervalSince(now)) } ?? 0
        return remainingAccent + idleHideDelay
    }
}
