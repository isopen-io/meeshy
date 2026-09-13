import Foundation
@testable import Meeshy

/// **Le LOT que les témoins du plateau de lecture passent au solveur.**
///
/// `MediaGalleryStage.corridors` a cessé de prendre un COMPTE au #6162 : elle
/// prend le lot entier, parce qu'elle y lit deux choses — combien de médias (le
/// rail) et si l'un d'eux porte une durée (la bande de progression). Deux
/// paramètres posés côte à côte au site d'appel auraient fini par diverger, et
/// c'est celui du milieu qu'on oublie.
///
/// La fabrique vit ici, en UN exemplaire, parce que quatre suites en ont besoin
/// et qu'un lot recopié quatre fois est un lot qui finira par ne plus dire la
/// même chose dans les quatre.
enum MediaGalleryLot {

    /// Un lot d'images — donc SANS aucune durée : le cas où la bande de
    /// progression ne se réserve pas. C'est le lot de référence de toutes les
    /// suites écrites avant #6162, dont les cotes (603 pt de zone libre) ont été
    /// calculées sans elle.
    static func imagesOnly(_ count: Int) -> [MessageAttachment] {
        (0..<max(0, count)).map { index in
            MessageAttachment(
                id: "fixture-image-\(index)",
                mimeType: "image/jpeg",
                fileSize: 204_800,
                fileUrl: "https://cdn.meeshy.me/fixture-\(index).jpg",
                width: 1_600,
                height: 1_200,
                uploadedBy: "u-fixture"
            )
        }
    }
}
