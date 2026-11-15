import SwiftUI

/// **Une case photo se recharge quand son original arrive** (#11550).
///
/// Le bouton « télécharger » d'une photo passe par `AttachmentDownloadCenter`,
/// que la vue d'image n'observe pas : la case gardait son aperçu flou jusqu'au
/// plein écran ou à un défilement. Site UNIQUE de l'attente, pour toutes les
/// surfaces qui montrent la photo et son bouton (grille de bulle, rangée
/// Focal, carrousel) : `content` reçoit `true` dès que l'original est posé,
/// à passer en `reloadToken` de `ProgressiveCachedImage`.
struct OriginalLandingReload<Content: View>: View {
    let fileUrl: String
    var center: AttachmentDownloadCenter = .shared
    @ViewBuilder let content: (_ originalLanded: Bool) -> Content

    @State private var originalLanded = false

    var body: some View {
        content(originalLanded)
            .task(id: fileUrl) { await watchOriginalLanding() }
    }

    private func watchOriginalLanding() async {
        guard !originalLanded, !fileUrl.isEmpty, !fileUrl.hasPrefix("file://") else { return }
        let key = AttachmentDownloadCenter.key(for: fileUrl)
        guard await center.firstEvent(for: key, where: BubbleImageSourceLaw.marksOriginalLanding) != nil else {
            return
        }
        originalLanded = true
    }
}
