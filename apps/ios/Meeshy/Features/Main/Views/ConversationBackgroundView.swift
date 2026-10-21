import SwiftUI
import MeeshySDK
import MeeshyUI

// MARK: - Le fond du fil, choisi par le lecteur (#10631, spec §§ 5.4, 8.2)
//
// Signature (le défaut, et tout ce qui ne se lit pas) = `ConversationAnimatedBackground`
// INCHANGÉ. Sinon : un modèle `AppearanceDesignView` (catalogue embarqué ⇒ premier
// rendu sans réseau), une couleur unie de la gamme, ou une photo de la conversation
// avec voile et flou. Le choix arrive de trois sources — la valeur de navigation, le
// choix local et l'écho d'un autre appareil — par le relais `ConversationAppearanceChange`.

struct ConversationBackgroundView: View {
    let conversationId: String
    let signature: ConversationBackgroundConfig
    /// La pièce jointe d'un identifiant, parmi les messages déjà chargés du fil (jamais un chargement).
    let knownAttachment: (String) -> MeeshyMessageAttachment?

    @State private var appearance: ConversationAppearance?
    @State private var photo: ConversationBackgroundPhoto?
    @State private var photoLoadFailed = false
    /// Suivi en direct : passer en mode économie d'énergie pendant la lecture fige la couche Lottie sur-le-champ.
    @State private var lowPowerMode = ProcessInfo.processInfo.isLowPowerModeEnabled
    @Environment(\.accessibilityReduceTransparency) private var reduceTransparency

    init(
        conversationId: String,
        initialAppearance: ConversationAppearance?,
        signature: ConversationBackgroundConfig,
        knownAttachment: @escaping (String) -> MeeshyMessageAttachment? = { _ in nil }
    ) {
        self.conversationId = conversationId
        self.signature = signature
        self.knownAttachment = knownAttachment
        _appearance = State(initialValue: ConversationAppearanceChange.latest(for: conversationId) ?? initialAppearance)
    }

    private var isDark: Bool { signature.isDarkMode }

    private var resolution: ConversationBackgroundResolution {
        let resolved = ConversationBackgroundResolution.resolve(appearance, isDark: isDark)
        if case .photo = resolved, photoLoadFailed { return .signature }
        return resolved
    }

    var body: some View {
        content
            .animation(.easeInOut(duration: 0.18), value: resolution)
            // Le store relaie depuis son acteur : l'état de la vue ne se touche que sur le fil principal.
            .onReceive(NotificationCenter.default.publisher(for: ConversationAppearanceChange.notification).receive(on: DispatchQueue.main)) { note in
                guard let changed = ConversationAppearanceChange.appearance(in: note, for: conversationId) else { return }
                photoLoadFailed = false
                appearance = changed
            }
            .onReceive(NotificationCenter.default.publisher(for: .NSProcessInfoPowerStateDidChange).receive(on: DispatchQueue.main)) { _ in
                lowPowerMode = ProcessInfo.processInfo.isLowPowerModeEnabled
            }
    }

    @ViewBuilder private var content: some View {
        switch resolution {
        case .signature:
            ConversationAnimatedBackground(config: signature)
        case .design(let design):
            AppearanceDesignView(
                design: design,
                isDark: isDark,
                accentHex: ConversationBackgroundResolution.effectiveAccentHex(appearance, computedHex: signature.accentHex, isDark: isDark)
            )
            .equatable()
            .overlay {
                if let lottie = design.lottie {
                    PackLottieLayer(
                        ref: lottie,
                        animates: ConversationBackgroundResolution.animatesLottieLayer(appearance, lowPowerMode: lowPowerMode),
                        contentMode: .fill
                    )
                }
            }
            .clipped()
            .ignoresSafeArea()
            .accessibilityHidden(true)
        case .solid(let hex):
            Color(hex: hex)
                .ignoresSafeArea()
                .accessibilityHidden(true)
        case .photo(let attachmentId, let veil, let blur):
            photoLayer(attachmentId: attachmentId, veil: veil, blur: blur)
        }
    }

    private func photoLayer(attachmentId: String, veil: Double, blur: Int) -> some View {
        ZStack {
            MeeshyColors.backgroundPrimary(isDark: isDark)
            if let photo {
                // La photo REMPLIT le cadre proposé sans l'agrandir : un `scaledToFill` posé à même le
                // ZStack lui donnerait la taille de l'image, et le fil se décalerait avec lui.
                Color.clear
                    .overlay {
                        ProgressiveCachedImage(
                            thumbHash: photo.thumbHash,
                            thumbnailUrl: photo.thumbnailUrl,
                            fullUrl: photo.fullUrl,
                            autoLoad: true,
                            onFullImageFailure: { settleFailedLoad(attachmentId: attachmentId) }
                        ) {
                            Color.clear
                        }
                        .scaledToFill()
                        .blur(radius: CGFloat(blur))
                    }
                    .clipped()
            }
            MeeshyColors.backgroundPrimary(isDark: isDark)
                .opacity(ConversationBackgroundResolution.effectiveVeil(veil, reduceTransparency: reduceTransparency))
        }
        .ignoresSafeArea()
        .accessibilityHidden(true)
        .task(id: attachmentId) {
            photoLoadFailed = false
            if ConversationBackgroundPhotoVerdict.source(for: knownAttachment(attachmentId)) == .needsDeviceKey {
                photo = nil
                photoLoadFailed = true
                return
            }
            photo = ConversationBackgroundPhoto.resolve(
                attachmentId: attachmentId,
                known: knownAttachment(attachmentId),
                remembered: ConversationBackgroundPhotoMemory().photo(for: attachmentId),
                serverOrigin: MeeshyConfig.shared.serverOrigin
            )
        }
    }

    /// Une panne passagère garde la dernière photo ; seule une pièce disparue, refusée ou chiffrée
    /// rend Signature — et seulement si elle est encore la photo du fond quand le verdict revient.
    private func settleFailedLoad(attachmentId: String) {
        Task {
            guard await ConversationBackgroundPhotoProbe.live.fallsBackToSignature(attachmentId: attachmentId),
                  ConversationBackgroundPhotoVerdict.settles(
                      probed: attachmentId,
                      current: ConversationBackgroundResolution.resolve(appearance, isDark: isDark)
                  ) else { return }
            photoLoadFailed = true
        }
    }
}
