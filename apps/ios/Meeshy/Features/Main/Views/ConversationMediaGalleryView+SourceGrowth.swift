import SwiftUI
import MeeshySDK

// MARK: - La galerie s'étend sans perdre la page qu'on regarde (#8095)
//
// La source d'une galerie de conversation n'est plus figée à l'ouverture : les
// pièces des messages jamais chargés arrivent de l'index persisté puis des pages
// `view=media`, et elles arrivent AVANT la page courante — ce sont les plus
// anciennes. La page se suit par IDENTITÉ (`currentPageID`), jamais par
// position : une insertion en tête décale les positions, pas l'identité.
//
// Deux filets le garantissent. `indexByID` est reconstruit à chaque source (la
// position courante se relit donc à la nouvelle place de la même pièce), et
// `keepCurrentPageAcrossGrowth` réaffirme l'identité une fois la mise en page
// faite : le pager à `scrollPosition(id:)` d'iOS 17 garde en principe la page
// ancrée, mais une dérive d'un tour — une page réclamée par le décalage du
// contenu — se corrigerait sinon au prochain geste de l'utilisateur, sur une
// autre photo que la sienne.

/// Ce qui change quand la source S'ÉTEND — assez pour déclencher le suivi, sans
/// comparer des centaines d'identifiants à chaque rendu.
struct GallerySourceSignature: Equatable {
    let count: Int
    let firstID: String?
    let lastID: String?

    init(_ attachments: [MessageAttachment]) {
        count = attachments.count
        firstID = attachments.first?.id
        lastID = attachments.last?.id
    }
}

/// **Ce que les couloirs du plateau lisent de la source, lu UNE fois par source**
/// (#11163). Le parcours du lot vivait dans `stageCorridors`, que chaque page
/// relit pour se cadrer : une galerie de N pièces payait N × N à chaque mise en
/// page, et le journal de l'iPhone a pris le fil principal dans ce parcours
/// jusqu'au chien de garde.
struct GalleryLotShape: Equatable {
    let isSeries: Bool
    let carriesDuration: Bool

    init(_ attachments: [MessageAttachment]) {
        isSeries = attachments.count > 1
        carriesDuration = MediaGalleryStage.carriesDuration(attachments)
    }
}

/// La règle du suivi, sans vue : la page à rétablir après une extension.
enum GalleryPagePinning {
    /// **Une pièce, une page** (#11162). Le pager suit ses pages par leur
    /// identifiant : un doublon y ferait deux pages au même nom, et la position
    /// que la galerie lit (`indexByID`) divergerait de celle du pager pour
    /// toutes les pages suivantes. La première occurrence est gardée.
    static func distinct(_ attachments: [MessageAttachment]) -> [MessageAttachment] {
        attachments.reduce(into: (seen: Set<String>(), kept: [MessageAttachment]())) { acc, piece in
            guard acc.seen.insert(piece.id).inserted else { return }
            acc.kept.append(piece)
        }.kept
    }

    /// La pièce qu'on regardait, si elle est toujours là — sinon rien : une
    /// pièce retirée ne se remplace pas par une autre choisie au hasard.
    static func pageToRestore(pinned: String?, among ids: [String]) -> String? {
        guard let pinned, ids.contains(pinned) else { return nil }
        return pinned
    }

    /// La pièce regardée a QUITTÉ la source (supprimée pour tous, éphémère
    /// expiré) : la page passe à sa voisine survivante — la suivante, sinon la
    /// précédente —, jamais à la première pièce venue.
    static func pageAfterRemoval(pinned: String?, previous: [String], now ids: [String]) -> String? {
        guard let pinned, !ids.contains(pinned) else { return nil }
        let survivors = Set(ids)
        guard let position = previous.firstIndex(of: pinned) else { return ids.first }
        if let next = previous[(position + 1)...].first(where: survivors.contains) { return next }
        if let before = previous[..<position].last(where: survivors.contains) { return before }
        return ids.first
    }

    /// Sa position dans la nouvelle source.
    static func position(of id: String, among ids: [String]) -> Int? {
        ids.firstIndex(of: id)
    }
}

extension ConversationMediaGalleryView {

    /// Réaffirme la page regardée après une extension de la source.
    func keepCurrentPageAcrossGrowth() {
        let ids = allAttachments.map(\.id)
        let previous = lastPageIDs
        lastPageIDs = ids
        guard let pinned = GalleryPagePinning.pageToRestore(pinned: currentPageID, among: ids)
            ?? GalleryPagePinning.pageAfterRemoval(pinned: currentPageID, previous: previous, now: ids) else { return }
        DispatchQueue.main.async {
            if currentPageID != pinned { currentPageID = pinned }
        }
    }
}
