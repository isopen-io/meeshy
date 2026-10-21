import Foundation
import MeeshySDK

/// Le pont de l'écran unique, dans l'extension de partage (#10947) — le jumeau
/// de `ShareSheetHostBridge` de l'app (`ShareSheetHost+App.swift`), qui y pose
/// un toast LOCAL.
///
/// L'extension n'a pas de toast : sa feuille se ferme dès que l'envoi est
/// servi, et chaque ligne a déjà dit « Envoyé » ou « En file » avant. Une
/// confirmation d'ici serait montrée à une feuille qui disparaît.
enum ShareSheetHostBridge {
    static func announce(_ title: String, open: (() -> Void)?) {}

    /// « Imager la discussion » n'est jamais offert ici : l'extension ne
    /// branche pas `onImageDiscussion`, donc la pastille n'est pas rendue.
    static var imagerLabel: String { "" }
    static var imagerSymbol: String { "photo" }
}
