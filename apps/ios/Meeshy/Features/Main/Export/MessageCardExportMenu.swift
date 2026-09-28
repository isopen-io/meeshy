import Foundation
import MeeshySDK

/// Les deux entrées du menu d'un message qui mènent à la carte d'export —
/// libellés, symboles et le fait qui ouvre « Export rapide ». Un seul site pour
/// les trois lecteurs du menu (liste verticale, overlay, menu natif).
enum MessageCardExportMenu {

    static let imageSymbol = "photo.on.rectangle.angled"
    static let quickSymbol = "bolt"

    static var imageLabel: String {
        String(localized: "message.menu.export", defaultValue: "Exporter en image", bundle: .main)
    }

    static var quickLabel: String {
        String(localized: "message.menu.exportQuick", defaultValue: "Export rapide", bundle: .main)
    }

    /// Un format par défaut est-il enregistré sur l'appareil ? « Export rapide »
    /// n'existe qu'avec lui.
    static var hasDefaultFormat: Bool {
        MessageCardFormat.readDefault(from: UserDefaultsMessageCardStore()) != nil
    }
}
