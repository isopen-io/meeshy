import SwiftUI
import MeeshySDK
import MeeshyUI

// #9214 · #9287 — le cadre en direct d'un appel vidéo à deux. Tout ce que l'écran d'appel en
// sait vit ici ; `CallView` ne porte que la session (`liveFrame`) et des crochets d'une ligne
// (la surface dans `videoCallLayout`, l'état en haut de l'écran, l'interrupteur de la capture).
// Le cadre se CHOISIT dans la capture ; il n'a pas d'entrée à lui dans la pilule.

extension CallView {
    /// Ce que l'écran montre : duo seulement, coupé quand l'appareil se protège, et — pour un
    /// cadre animé — quand « Réduire les animations » est activé.
    var liveFrameDisplay: CallLiveFrameDisplay {
        guard !isGroupStage else { return .none }
        return CallLiveFrameRule.display(
            frameId: liveFrame.frameId,
            participants: captureSubjects.count,
            isDeviceConstrained: CallVideoDegradation.isDeviceConstrained(),
            reduceMotion: reduceMotion
        )
    }

    var isLiveFrameShown: Bool {
        callManager.isVideoUIActive && liveFrameDisplay.design != nil
    }

    var offersLiveFrame: Bool {
        !isGroupStage && CallLiveFrameRule.mayOffer(participants: captureSubjects.count, showsVideo: callManager.isVideoUIActive)
    }

    /// Les personnes du cadre, dans l'ordre des cases du Montage ; le nom que l'autre partage
    /// remplace celui qu'on avait de lui.
    var liveFramePeople: [CallFramePerson] {
        CallLiveFrameRule.people(
            captureSubjects.map { CallFramePerson(id: $0.id, name: $0.name, handle: $0.handle, isSelf: $0.isSelf) },
            remoteSharedName: liveFrame.remoteSharedName
        )
    }

    var liveFrameTexts: CallFrameTexts {
        liveFrame.texts ?? CallFrameTextsResolver.shared.immediateTexts(for: montageCallContext)
    }

    /// Les pistes à poser dans les cases : celles qui montrent une image. Une caméra coupée
    /// garde sa case, avec son initiale.
    var liveFrameSources: [String: CallLiveFrameVideoSource] {
        let tracks = captureTracks
        return captureSubjects.reduce(into: [String: CallLiveFrameVideoSource]()) { result, subject in
            guard subject.showsVideo, let track = tracks[subject.id] else { return }
            result[subject.id] = CallLiveFrameVideoSource(track: track, isMirrored: subject.isMirrored)
        }
    }

    /// Sous un mode (capture, effets), la scène du mode couvre l'écran : la surface du cadre
    /// gardé s'arrête au lieu de composer des images que personne ne voit.
    @ViewBuilder
    var liveFrameSurface: some View {
        if callManager.isVideoUIActive, layer.activeMode == nil, let design = liveFrameDisplay.design {
            CallLiveFrameSurface(design: design, people: liveFramePeople, texts: liveFrameTexts, sources: liveFrameSources)
                .allowsHitTesting(false)
                .accessibilityElement()
                .accessibilityLabel(CallLiveFrameCopy.surface(design.name))
                .transition(.opacity)
        }
    }

    /// #9287 — en mode Capture, l'interrupteur « Cadre » garde le cadre choisi pendant tout
    /// l'appel : un cadre du catalogue servi en direct à deux, et l'appareil d'accord.
    var liveFrameHold: CallLiveFrameHold {
        CallLiveFrameHold(
            heldFrameId: liveFrame.frameId,
            isOffered: offersLiveFrame,
            toggle: { id in
                let next = CallLiveFrameRule.toggledHold(current: liveFrame.frameId, tapped: id)
                HapticFeedback.light()
                Task { await liveFrame.apply(next) }
            }
        )
    }

    /// Ce qui s'affiche en haut de l'appel au sujet du cadre : une proposition à trancher,
    /// la réponse de l'autre à la mienne, ou la raison d'une pause.
    @ViewBuilder
    var liveFrameStatus: some View {
        if let proposal = liveFrame.proposal, let design = CallFrameCatalogue.frame(id: proposal.frameId) {
            CallLiveFrameProposalCard(
                text: CallLiveFrameCopy.proposal(from: proposal.from, frame: design.name),
                onAccept: { Task { await liveFrame.accept() } },
                onDecline: { Task { await liveFrame.decline() } }
            )
            .transition(.opacity.combined(with: .move(edge: .top)))
        } else if let answer = liveFrame.answer {
            CallLiveFrameNotice(text: CallLiveFrameCopy.answered(answer.reply, by: answer.from))
                .transition(.opacity)
                .task(id: answer) {
                    try? await Task.sleep(nanoseconds: 4_000_000_000)
                    guard !Task.isCancelled else { return }
                    withAnimation(.easeInOut(duration: 0.25)) { liveFrame.dismissAnswer() }
                }
        } else if layer.activeMode == nil, case .suspended(_, let reason) = liveFrameDisplay {
            CallLiveFrameNotice(text: CallLiveFrameCopy.suspended(reason))
                .transition(.opacity)
        }
    }

    /// La clé qui relie la session au bon appel, et au duo : un appel qui passe à trois efface
    /// le cadre localement.
    var liveFrameBindingKey: String {
        "\(callManager.currentCallId ?? "")|\(isGroupStage)"
    }

    func bindLiveFrame() async {
        await liveFrame.bind(callId: callManager.currentCallId, context: montageCallContext)
        if isGroupStage { liveFrame.leaveDuo() }
    }
}
