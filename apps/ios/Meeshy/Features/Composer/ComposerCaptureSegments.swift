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
    /// L'écriture de CE fichier vers Photos par la caméra, quand Réglages › Médias
    /// demande l'original (#9684, #10284) ; `nil` = il n'y est pas.
    let rawSave: Task<Bool, Never>?

    init(id: String = UUID().uuidString, url: URL, duration: TimeInterval, rawSave: Task<Bool, Never>? = nil) {
        self.id = id
        self.url = url
        self.duration = duration
        self.rawSave = rawSave
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

    /// **Ce que le chrono AFFICHE, prise en cours comprise.**
    ///
    /// Directive porteur du 2026-09-04 : « si on a un vrai longpress ça
    /// déclenche la capture vidéo **avec le chrono et indicateur** ».
    ///
    /// `totalDuration` ne compte que les segments CLOS — c'est sa définition, et
    /// elle est juste : un segment n'a de durée qu'une fois refermé. Un chrono
    /// bâti dessus reste donc **figé pendant toute la prise** et ne repart qu'au
    /// relâchement, c'est-à-dire au moment exact où il cesse de servir. Le
    /// défaut ne se voit pas sur une scène sans segment : à zéro plus zéro, un
    /// chrono mort et un chrono juste affichent la même chose.
    ///
    /// La somme se fait ICI et non dans la barre pour que le « + » soit
    /// éprouvable sans monter une vue — et pour qu'il n'existe qu'une fois : la
    /// barre de la carte et celle du plein écran sont la même vue depuis le
    /// 2026-09-04, mais rien ne garantissait qu'elles le restent.
    ///
    /// - Parameter live: la durée de la prise EN COURS. Elle n'entre que si la
    ///   prise est en cours : hors enregistrement, `CameraModel` garde la
    ///   dernière valeur atteinte, et l'ajouter compterait deux fois le segment
    ///   qui vient d'être clos.
    static func elapsed(segments: [ComposerCaptureSegment],
                        live: TimeInterval,
                        recording: Bool) -> TimeInterval {
        totalDuration(segments) + (recording ? max(0, live) : 0)
    }

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

    /// **Des segments en attente ne partent jamais en silence** (#9351,
    /// décision 2026-10-06) : la croix ou le glissé qui fermerait le viseur
    /// demande d'abord « Abandonner la vidéo ? ». Sans segment, rien ne se perd :
    /// la fermeture est immédiate.
    static func asksBeforeClosing(_ segments: [ComposerCaptureSegment]) -> Bool {
        !segments.isEmpty
    }
}

/// **Ce qu'une prise peut durer, et comment la barre du haut le montre**
/// (vue A9, #17109).
///
/// Chaque format a sa durée maximale : une story se lit d'un trait, un réel
/// porte un peu plus. La barre du haut découpe ce maximum en cases égales qui
/// se remplissent pendant qu'on filme, segments déjà pris compris ; l'anneau
/// rouge du déclencheur dit la même fraction. À la limite, la prise se clôt
/// d'elle-même plutôt que de produire un fichier que le format refusera.
nonisolated enum ComposerCaptureRecordingBudget {

    /// Le nombre de cases de la barre (vue A9).
    static let slots = 5

    /// La durée maximale d'une prise pour ce format ; `nil` ⇒ le format ne
    /// filme pas (un statut n'a pas de scène).
    static func maxDuration(for format: ComposerFormat) -> TimeInterval? {
        switch format {
        case .story, .post: return 60
        case .reel: return 90
        case .status: return nil
        }
    }

    /// La part du maximum déjà prise, bornée à `0...1`.
    static func fraction(elapsed: TimeInterval, budget: TimeInterval?) -> Double {
        guard let budget, budget > 0 else { return 0 }
        return min(1, max(0, elapsed / budget))
    }

    /// Le remplissage de chaque case, de gauche à droite, chacun dans `0...1`.
    static func slotFills(elapsed: TimeInterval, budget: TimeInterval?, slots: Int = slots) -> [Double] {
        guard slots > 0 else { return [] }
        let rempli = fraction(elapsed: elapsed, budget: budget) * Double(slots)
        return (0..<slots).map { min(1, max(0, rempli - Double($0))) }
    }

    /// La limite est-elle atteinte ? Sans maximum, jamais.
    static func reached(elapsed: TimeInterval, budget: TimeInterval?) -> Bool {
        guard let budget, budget > 0 else { return false }
        return elapsed >= budget
    }

    /// Une nouvelle prise peut-elle commencer ? Pas quand les segments déjà pris
    /// ont épuisé le maximum : elle se clôturerait aussitôt en un segment vide.
    static func allowsAnotherTake(taken: TimeInterval, budget: TimeInterval?) -> Bool {
        !reached(elapsed: taken, budget: budget)
    }
}

extension ComposerCaptureRecordingBudget {
    /// **La limite atteinte clôt la prise** (A9, #17109) : la durée, segments compris, a touché le
    /// maximum du format. La tenue est oubliée — la levée du doigt qui suivra ne clôt plus rien.
    /// `true` quand la prise vient d'être close.
    @MainActor @discardableResult
    static func enforce(on session: ComposerCaptureSession, elapsed: TimeInterval) -> Bool {
        guard session.stage == .recording, reached(elapsed: elapsed, budget: session.recordingBudget) else { return false }
        session.holdStartedAt = nil
        session.closeTake()
        return true
    }

    /// Les segments déjà pris, celui qui s'écrit compris, laissent-ils place à une prise de plus ?
    @MainActor
    static func allowsAnotherTake(after session: ComposerCaptureSession) -> Bool {
        allowsAnotherTake(taken: ComposerCaptureSegments.totalDuration(session.segments) + session.pendingSegmentDuration,
                          budget: session.recordingBudget)
    }
}
