import Foundation

// ============================================================================
// MARK: - RecentMediaAsset
// ============================================================================

/// Un média de la photothèque résolu pour la zone d'attachement, qui garde
/// l'identifiant `PHAsset.localIdentifier` dont il vient (#9683).
///
/// Une photo voyage en OCTETS d'origine (`requestImageDataAndOrientation`),
/// jamais en `UIImage` 2048 décodée : le pipeline de préparation la compresse
/// depuis ses octets, comme une photo venue du sélecteur système. Une vidéo
/// voyage en fichier, copié dans le répertoire temporaire.
///
/// `RecentMediaPick` reste la forme de l'éditeur, qui travaille sur une image
/// décodée, et des hôtes sans zone liée.
nonisolated struct RecentMediaAsset {
    nonisolated enum Payload {
        case imageData(Data)
        case video(URL)
    }

    let assetId: String
    let payload: Payload
}

// ============================================================================
// MARK: - RecentMediaAttachmentLink
// ============================================================================

/// Le lien entre la zone d'attachement du composeur et la grille de la
/// photothèque (#9683) : une image déjà jointe est marquée dans la grille et
/// ne se choisit plus une seconde fois.
///
/// **Une seule source de vérité** : la carte `pièce jointe → asset` ne fait
/// foi que pour les pièces encore VIVANTES dans la zone (en préparation ou
/// prêtes). L'ensemble des assets joints s'en DÉRIVE — rien ne le mémorise à
/// côté. Retirer une pièce de la zone, la voir échouer ou partir à l'envoi
/// libère donc sa tuile sans qu'aucun site n'ait à y penser.
nonisolated enum RecentMediaAttachmentLink {

    /// Les assets joints, dans l'ordre des pièces de la zone, sans doublon.
    static func attachedAssetIds(links: [String: String], liveAttachmentIds: [String]) -> [String] {
        unique(liveAttachmentIds.compactMap { links[$0] })
    }

    /// Pose le lien d'une pièce neuve et élague ceux des pièces disparues :
    /// la carte reste bornée par la zone, quel que soit le nombre d'envois.
    static func linking(
        _ assetId: String,
        to attachmentId: String,
        in links: [String: String],
        liveAttachmentIds: [String]
    ) -> [String: String] {
        let live = Set(liveAttachmentIds)
        var kept = links.filter { live.contains($0.key) }
        kept[attachmentId] = assetId
        return kept
    }

    /// Ce qui reste à joindre d'une sélection : ordre conservé, assets déjà
    /// joints et doublons écartés.
    static func fresh(_ candidates: [String], excluding attached: Set<String>) -> [String] {
        unique(candidates).filter { !attached.contains($0) }
    }

    /// Les éléments rendus par le sélecteur système à ingérer. Un élément
    /// sans identifiant (photothèque non partagée) est toujours pris ; un
    /// identifiant déjà joint, ou vu plus tôt dans le même lot, ne l'est pas.
    static func ingestibleIndices(of identifiers: [String?], excluding attached: Set<String>) -> [Int] {
        var seen = attached
        return identifiers.enumerated().compactMap { index, identifier in
            guard let identifier else { return index }
            return seen.insert(identifier).inserted ? index : nil
        }
    }

    /// Présélection du sélecteur système : les assets déjà joints, puis la
    /// sélection courante de la grille, sans doublon, plafonnée.
    static func pickerPreselection(attached: [String], selection: [String], limit: Int) -> [String] {
        Array(unique(attached + selection).prefix(max(0, limit)))
    }

    /// Les assets JOINTS parmi ceux que le sélecteur reçoit cochés : eux seuls
    /// peuvent être DÉCOCHÉS — le reste de la présélection n'est pas encore
    /// dans la zone.
    static func preselectedAttached(attached: [String], preselection: [String]) -> [String] {
        let primed = Set(preselection)
        return unique(attached).filter(primed.contains)
    }

    /// Les pièces à retirer de la zone au retour du sélecteur système (#9697) :
    /// celles dont l'asset y était coché à l'ouverture et n'en revient pas. Un
    /// élément rendu sans identifiant ne permet de rien conclure : rien ne se
    /// retire.
    static func deselectedAttachmentIds(
        links: [String: String],
        liveAttachmentIds: [String],
        preselected: [String],
        returned: [String?]
    ) -> [String] {
        guard !preselected.isEmpty, !returned.contains(where: { $0 == nil }) else { return [] }
        let gone = Set(preselected).subtracting(returned.compactMap { $0 })
        return liveAttachmentIds.filter { links[$0].map(gone.contains) ?? false }
    }

    private static func unique(_ ids: [String]) -> [String] {
        var seen = Set<String>()
        return ids.filter { seen.insert($0).inserted }
    }
}

// ============================================================================
// MARK: - RecentMediaCachingWindow
// ============================================================================

/// La fenêtre de pré-chargement des vignettes autour de la dernière cellule
/// apparue : `PHCachingImageManager` prépare ce qui va défiler, et relâche ce
/// qui en est sorti.
nonisolated enum RecentMediaCachingWindow {
    nonisolated struct Delta: Equatable {
        let start: [String]
        let stop: [String]
    }

    static let rowsBefore = 2
    static let rowsAfter = 4

    static func ids(around id: String, in ids: [String], columns: Int) -> [String] {
        guard let index = ids.firstIndex(of: id) else { return [] }
        let lower = max(0, index - rowsBefore * columns)
        let upper = min(ids.count, index + (rowsAfter + 1) * columns)
        return Array(ids[lower..<upper])
    }

    static func delta(from previous: [String], to next: [String]) -> Delta {
        let before = Set(previous)
        let after = Set(next)
        return Delta(
            start: next.filter { !before.contains($0) },
            stop: previous.filter { !after.contains($0) }
        )
    }
}
