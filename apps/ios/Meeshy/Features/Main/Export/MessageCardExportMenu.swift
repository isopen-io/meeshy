import Foundation
import MeeshySDK

/// Les entrées des menus qui mènent à l'atelier « Imagine » — libellés,
/// symboles et le fait qui ouvre « Export rapide ». Un seul site pour tous
/// leurs lecteurs : liste verticale, overlay, menu natif, menu du double tap,
/// feuille « Plus… » et menu d'un commentaire (#8692).
enum MessageCardExportMenu {

    static let imageSymbol = "photo.on.rectangle.angled"
    static let quickSymbol = "bolt"
    /// Le (>) du menu du double tap : il déplie « Composer » ET « Imager ».
    static let createSymbol = "wand.and.stars"

    /// « Imager » — directive porteur 2026-09-29 : l'action s'appelle ainsi
    /// partout ; l'atelier qu'elle ouvre est titré « Imagine ».
    static var imageLabel: String {
        String(localized: "message.menu.export", defaultValue: "Imager", bundle: .main)
    }

    static var quickLabel: String {
        String(localized: "message.menu.exportQuick", defaultValue: "Export rapide", bundle: .main)
    }

    static var createLabel: String {
        String(localized: "message.action.create", defaultValue: "Créer", bundle: .main)
    }

    /// Un format par défaut est-il enregistré sur l'appareil ? « Export rapide »
    /// n'existe qu'avec lui.
    static var hasDefaultFormat: Bool {
        MessageCardFormat.readDefault(from: UserDefaultsMessageCardStore()) != nil
    }

    /// **Un commentaire devient une carte** : le texte que le lecteur a sous
    /// les yeux (`showOriginal` suit la puce de langue de la ligne), son auteur,
    /// ses médias. `nil` pour un commentaire protégé ou vide. Une réponse
    /// emporte sa racine (`quoting`) en citation — l'arbre de réponses (#8709).
    static func request(comment: FeedComment, showOriginal: Bool, accentColor: String, viewer: MessageCardSubject.Viewer, handle: String?, quoting root: FeedComment? = nil) -> MessageCardExportRequest? {
        guard let subject = MessageCardSubject.of(comment: comment, viewer: viewer, showOriginal: showOriginal, quoting: root) else { return nil }
        return MessageCardExportRequest(
            subject: subject,
            languages: [],
            subjectIn: { _ in nil },
            handle: handle,
            conversationTitle: nil,
            accentColor: accentColor,
            quick: false
        )
    }
}
