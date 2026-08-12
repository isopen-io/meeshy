import Foundation

/// C5 — quelle publication les surfaces d'avatar mettent-elles en avant quand
/// plusieurs sont empilées ? Décision UX produit, pure et testable seule (même
/// patron que `MyStoriesTabResolver`).
enum StoryUploadPresentation {

    struct Surfaced {
        let upload: StoryViewModel.StoryUploadState
        /// Les AUTRES entrées, tous états confondus — jamais l'entrée mise en
        /// avant elle-même (la pastille « +N » ne se compte pas).
        let stackedCount: Int
    }

    /// Un échec l'emporte : il porte la seule action utile (réessayer), et le
    /// laisser derrière une barre de progression le rendrait invisible. Sinon,
    /// la tête de file — l'ordre des taps « Publier ».
    static func surfaced(in uploads: [StoryViewModel.StoryUploadState]) -> Surfaced? {
        guard !uploads.isEmpty else { return nil }
        let failed = uploads.first { upload in
            if case .failed = upload.phase { return true }
            return false
        }
        guard let surfaced = failed ?? uploads.first else { return nil }
        return Surfaced(upload: surfaced, stackedCount: uploads.count - 1)
    }

    /// Libellé d'état lu par les DEUX surfaces d'upload (la ligne de « Mes
    /// stories » et l'anneau du tray). Les clés recopiées d'une vue à l'autre
    /// dérivent au premier renommage : elles se lisent ici.
    static func statusTitle(for phase: StoryViewModel.StoryUploadState.UploadPhase) -> String {
        if phase.isFailed {
            return String(localized: "story.mine.upload.failedTitle", defaultValue: "Échec de la publication")
        }
        if phase.isWaiting {
            return String(localized: "story.upload.queued", defaultValue: "En attente")
        }
        return String(localized: "story.mine.upload.title", defaultValue: "Publication en cours…")
    }

    /// Libellé VoiceOver de l'anneau du tray. Le pourcentage n'accompagne QUE
    /// la branche d'un transfert réellement en vol : sur un échec il décrirait
    /// un upload qui n'existe plus, sur une attente il annoncerait « 0 % » pour
    /// une entrée qui n'a envoyé aucun octet. Chaque branche est complète —
    /// un `isFailed ? a : b + suffixe` s'appuierait sur la précédence de `+`
    /// sur `?:` et attacherait silencieusement un futur suffixe au mauvais cas.
    static func a11yLabel(
        for phase: StoryViewModel.StoryUploadState.UploadPhase,
        progress: Double,
        stackedCount: Int
    ) -> String {
        let title = statusTitle(for: phase)
        let base = phase.isFailed || phase.isWaiting
            ? title
            : "\(title) \(Int(progress * 100))%"
        guard stackedCount > 0 else { return base }
        let more = String(
            format: String(localized: "story.upload.a11y.stacked", defaultValue: "%lld autre(s) en attente"),
            stackedCount
        )
        return "\(base) — \(more)"
    }
}

extension StoryViewModel.StoryUploadState.UploadPhase {
    /// `.preparing` (write-ahead + thumbHashes en cours) et `.queued` (en
    /// attente de son tour) n'ont AUCUN octet en vol : les deux surfaces les
    /// rendent « En attente », jamais « Publication en cours… à 0 % ». Règle
    /// unique — recopiée dans chaque vue, elle dériverait au 3e état d'attente.
    var isWaiting: Bool {
        self == .preparing || self == .queued
    }

    var isFailed: Bool {
        if case .failed = self { return true }
        return false
    }
}
