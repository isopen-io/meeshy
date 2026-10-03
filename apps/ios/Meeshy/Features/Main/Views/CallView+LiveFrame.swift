import SwiftUI
import MeeshySDK
import MeeshyUI

// #9214 — le cadre en direct d'un appel vidéo à deux. Tout ce que l'écran d'appel en sait vit
// ici ; `CallView` ne porte que l'état (`liveFrame`, `showLiveFramePicker`) et des crochets
// d'une ligne (la surface dans `videoCallLayout`, l'action de la pilule, la feuille).

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

    @ViewBuilder
    var liveFrameSurface: some View {
        if callManager.isVideoUIActive, let design = liveFrameDisplay.design {
            CallLiveFrameSurface(design: design, people: liveFramePeople, texts: liveFrameTexts, sources: liveFrameSources)
                .allowsHitTesting(false)
                .accessibilityElement()
                .accessibilityLabel(CallLiveFrameCopy.surface(design.name))
                .transition(.opacity)
        }
    }

    func liveFrameActionButton(captioned: Bool, diameter: CGFloat) -> some View {
        CallPillButton(
            symbol: "photo.artframe",
            kind: liveFrame.frameId != nil ? .active : .normal,
            label: CallLiveFrameCopy.label,
            caption: captioned ? CallLiveFrameCopy.caption : nil,
            hint: CallLiveFrameCopy.hint,
            diameter: diameter
        ) {
            withAnimation(disclosureAnimation) { layer = .idle }
            showLiveFramePicker = true
        }
    }

    var liveFramePicker: some View {
        let suspension: CallLiveFrameSuspension? = {
            guard case .suspended(_, let reason) = liveFrameDisplay else { return nil }
            return reason
        }()
        return CallLiveFramePicker(
            selectedId: liveFrame.frameId,
            suspension: suspension,
            people: liveFramePeople,
            texts: liveFrameTexts,
            onSelect: { id in Task { await liveFrame.select(id) } }
        )
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
