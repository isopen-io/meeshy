import Foundation

/// **Un segment de prise — un FICHIER déjà écrit** (#4099, vue `4b`).
///
/// > « Chaque segment est déjà un fichier. Supprimer le dernier segment
/// > supprime un fichier, il ne rejoue rien ; valider concatène des pistes déjà
/// > encodées, ce qui rend la sortie quasi instantanée quelle que soit la
/// > durée. » — planche `4b`
///
/// C'est toute la doctrine de la vue, et elle tient dans ce que le type PORTE :
/// une URL, pas des octets ni une image décodée. Un segment qu'on garderait en
/// mémoire pour « pouvoir revenir dessus » ferait exactement le contraire de ce
/// que la planche promet.
nonisolated struct ComposerCaptureSegment: Identifiable, Equatable, Sendable {
    let id: String
    let url: URL
    let duration: TimeInterval

    init(id: String = UUID().uuidString, url: URL, duration: TimeInterval) {
        self.id = id
        self.url = url
        self.duration = duration
    }
}

nonisolated enum ComposerCaptureSegments {

    /// Ce que la capsule `●` affiche — la somme, jamais la durée du dernier.
    /// L'auteur compte le temps de sa PRISE, pas celui de son dernier geste.
    static func totalDuration(_ segments: [ComposerCaptureSegment]) -> TimeInterval {
        segments.reduce(0) { $0 + max(0, $1.duration) }
    }

    /// **`✓` n'existe que s'il y a quelque chose à poser** (loi 4). Offert sur
    /// une prise vide, il rendrait une scène inchangée après un geste explicite
    /// de validation — le pire des retours, parce qu'il ressemble à une panne.
    static func canValidate(_ segments: [ComposerCaptureSegment]) -> Bool {
        !segments.isEmpty
    }

    /// **Retirer le dernier rend le FICHIER à supprimer**, il ne recompose rien.
    ///
    /// La règle ne fait pas la suppression : elle dit QUOI supprimer, et
    /// l'appelant — qui seul a le droit de toucher au disque — s'en charge. Un
    /// effacement caché dans une fonction pure serait invisible à un témoin, et
    /// c'est précisément l'effet de bord qui coûte de l'espace quand il manque.
    ///
    /// Sur une liste vide, rien à rendre : `nil` plutôt qu'un crash, parce que
    /// le bouton peut survivre d'une frame au dernier retrait.
    static func droppingLast(_ segments: [ComposerCaptureSegment])
    -> (kept: [ComposerCaptureSegment], orphan: URL?) {
        guard let dernier = segments.last else { return (segments, nil) }
        return (Array(segments.dropLast()), dernier.url)
    }

    /// **La part de chaque segment dans le bandeau du haut.**
    ///
    /// La cible dessine une barre découpée en spans proportionnels. Les parts
    /// somment à 1 dès qu'il y a de la matière ; sur une durée totale nulle —
    /// des segments encore en cours d'écriture, ou une prise si brève qu'elle
    /// arrondit à zéro — elles se répartissent ÉGALEMENT plutôt que de diviser
    /// par zéro. Une barre à parts égales est fausse d'un cheveu ; une barre
    /// vide ferait croire que rien n'a été pris.
    static func shares(_ segments: [ComposerCaptureSegment]) -> [Double] {
        guard !segments.isEmpty else { return [] }
        let total = totalDuration(segments)
        guard total > 0 else {
            return Array(repeating: 1.0 / Double(segments.count), count: segments.count)
        }
        return segments.map { max(0, $0.duration) / total }
    }

    /// **Fusionner n'a de sens qu'à partir de DEUX.** Un segment unique est
    /// déjà le fichier final : le passer au concaténateur le ré-écrirait pour
    /// rien, et la planche promet exactement l'inverse — « quasi instantané
    /// quelle que soit la durée ».
    static func needsMerge(_ segments: [ComposerCaptureSegment]) -> Bool {
        segments.count > 1
    }
}
