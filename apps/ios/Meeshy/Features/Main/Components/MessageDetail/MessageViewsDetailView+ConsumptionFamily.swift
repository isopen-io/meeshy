import Foundation
import MeeshySDK

/// La famille d'un attachment dans l'onglet « Qui a vu », et les libellés qui
/// en dépendent.
///
/// Extrait de la vue pour rester TESTABLE : ce que l'onglet « Consulté »
/// contient est une règle, pas une disposition, et un témoin doit pouvoir la
/// rejouer sans monter une hiérarchie SwiftUI.
extension MessageViewsDetailView {

    /// Les attachments SANS piste temporelle — images, PDF, tableurs,
    /// présentations, archives, textes, inconnus — regroupés sous « Consulté ».
    ///
    /// La famille se lit sur `AttachmentConsumptionResolver.primaryAction`, la
    /// règle UNIQUE du SDK (`image/*` → `viewed`, tout le reste hors `audio/*`
    /// et `video/*` → `downloaded`). La reconnaître par
    /// `AttachmentKind == .image || == .document` laissait dehors le document
    /// le plus courant de tous — un PDF est `.pdf`, jamais `.document` — ainsi
    /// que les tableurs, présentations, archives et fichiers texte : leur
    /// consommation était chargée puis jetée, sans onglet pour l'afficher.
    static func viewedFamilyAttachments(in attachments: [MessageAttachment]) -> [MessageAttachment] {
        attachments.filter { isViewedFamily(mimeType: $0.mimeType) }
    }

    static func isViewedFamily(mimeType: String) -> Bool {
        switch AttachmentConsumptionResolver.primaryAction(forMimeType: mimeType) {
        case .viewed, .downloaded: return true
        case .listened, .watched: return false
        }
    }

    /// « Personne n'a encore… » — un par action, et localisé : la carte servait
    /// trois familles avec deux chaînes françaises écrites en dur, sans accent
    /// et hors catalogue, donc identiques dans les sept langues.
    static func emptyConsumptionLabel(for action: AttachmentConsumptionResolver.Action) -> String {
        switch action {
        case .listened:
            return String(localized: "message-detail.views.card.not-listened", defaultValue: "Pas encore écouté", bundle: .main)
        case .watched:
            return String(localized: "message-detail.views.card.not-watched", defaultValue: "Pas encore visionné", bundle: .main)
        case .viewed, .downloaded:
            return String(localized: "message-detail.views.card.not-viewed", defaultValue: "Pas encore consulté", bundle: .main)
        }
    }
}
