import UIKit

// MARK: - Le look d'une couche, cuit hors du fil principal (#9873)

/// **Le repeint d'une couche du canvas pendant qu'un curseur glisse.**
///
/// Chaque cran d'un curseur de filtre ou de réglage cuisait le look de l'image
/// SUR le MainActor (`createCGImage`), dans l'image même où le doigt bougeait.
/// Une couche du canvas INTERACTIF confie désormais la cuisson à cet outil :
/// le bitmap affiché reste à l'écran, la cuisson part hors du fil principal
/// (`LatestWinsRenderLoop` : un rendu en vol, le dernier cran gagne) et le
/// bitmap cuit est remis à la couche dès qu'il est prêt.
///
/// Une cuisson n'est remise que si la couche montre encore la MÊME source : un
/// rendu lancé pour l'ancienne image ne recouvre jamais la nouvelle
/// (`supersede`). Les crans intermédiaires, eux, sont remis — c'est le
/// retour visuel du glissé.
@MainActor
final class StoryLiveLook {
    // iOS 26.1 : deinit synthétisée ISOLÉE (SE-0466) → double-free au
    // démontage hors d'une tâche. Garde : MeeshyUIDeinitSourceGuardTests.
    nonisolated deinit {}

    private let baker: @Sendable (StoryLookBakeRequest) -> UIImage
    private var loop: LatestWinsRenderLoop<StoryLiveLookTicket, UIImage>?
    private var generation: UInt64 = 0
    private var source: ObjectIdentifier?
    private var onBaked: (@MainActor (UIImage) -> Void)?

    /// `baker` : la cuisson elle-même, `StoryLookBake.bake` ; un témoin la
    /// remplace pour observer le fil où elle tourne.
    init(baker: @escaping @Sendable (StoryLookBakeRequest) -> UIImage = StoryLookBake.bake) {
        self.baker = baker
    }

    /// `true` tant qu'une cuisson est en vol ou attend.
    var isBaking: Bool { loop?.isBusy ?? false }

    /// La couche pose une autre source, ou un bitmap qu'elle a cuit elle-même :
    /// toute cuisson en vol est caduque.
    func supersede() {
        generation &+= 1
        source = nil
        onBaked = nil
        loop?.discardPending()
    }

    /// Cuit `request` hors du fil principal et remet le bitmap à `onBaked`,
    /// sur le MainActor — tant que la couche montre la même source.
    func bake(_ request: StoryLookBakeRequest, onBaked: @escaping @MainActor (UIImage) -> Void) {
        let identite = ObjectIdentifier(request.image)
        if source != identite {
            generation &+= 1
            source = identite
        }
        self.onBaked = onBaked
        loopOrMake().submit(StoryLiveLookTicket(request: request, generation: generation))
    }

    private func loopOrMake() -> LatestWinsRenderLoop<StoryLiveLookTicket, UIImage> {
        if let loop { return loop }
        let cuire = baker
        let made = LatestWinsRenderLoop<StoryLiveLookTicket, UIImage>(
            render: { ticket in cuire(ticket.request) },
            deliver: { [weak self] ticket, cuit in self?.hand(cuit, for: ticket) })
        loop = made
        return made
    }

    private func hand(_ baked: UIImage, for ticket: StoryLiveLookTicket) {
        guard ticket.generation == generation else { return }
        onBaked?(baked)
    }
}

/// Une demande de cuisson et la génération de source pour laquelle elle part.
nonisolated struct StoryLiveLookTicket: Sendable {
    let request: StoryLookBakeRequest
    let generation: UInt64
}
