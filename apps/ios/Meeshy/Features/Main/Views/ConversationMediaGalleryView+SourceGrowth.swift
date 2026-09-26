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

/// La règle du suivi, sans vue : la page à rétablir après une extension.
enum GalleryPagePinning {
    /// La pièce qu'on regardait, si elle est toujours là — sinon rien : une
    /// pièce retirée ne se remplace pas par une autre choisie au hasard.
    static func pageToRestore(pinned: String?, among ids: [String]) -> String? {
        guard let pinned, ids.contains(pinned) else { return nil }
        return pinned
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
        guard let pinned = GalleryPagePinning.pageToRestore(pinned: currentPageID, among: ids) else { return }
        DispatchQueue.main.async {
            if currentPageID != pinned { currentPageID = pinned }
        }
    }
}
