import SwiftUI
import UIKit
import MeeshySDK
import MeeshyUI
import os

// Les sous-titres de l'appel : le bloc de la pilule (#8396, #17343), le
// journal, et le bouton Sous-titres. Sortis de `CallView.swift` (#8276).

extension CallView {
    // MARK: - Caption lines (#8396)

    /// Les phrases de l'appel, résolues pour l'affichage : Prisme, couleur de
    /// la personne, étiquette « EN → FR ». Le réglage Traduit/Original du
    /// bouton Sous-titres (`showOriginalText`) vaut pour toutes les lignes ;
    /// un toucher sur une phrase l'inverse pour elle seule.
    func captionLine(for segment: CallTranscriptionSegment) -> CallCaptionLine {
        let localUserId = AuthManager.shared.currentUser?.id ?? ""
        return CallCaptionLine.make(
            segment: segment,
            isLocal: segment.speakerId == localUserId,
            speakerName: speakerName(for: segment, localUserId: localUserId),
            prefersOriginal: showOriginalText,
            isRevealed: revealedCaptionIds.contains(segment.id),
            readerPrism: ReaderPrism.resolve(for: AuthManager.shared.currentUser)
        )
    }

    var journal: CallJournalComposer {
        CallJournalComposer(segments: transcriptionService.displayedSegments, captures: transcriptionService.captureJournal.marks, callStartedAt: callManager.callStartDate, speechLine: captionLine)
    }

    /// Le nom du locuteur : le mien, puis le roster du groupe (source de
    /// confiance), puis l'interlocuteur du duo, puis ce que le fil transporte.
    func speakerName(for segment: CallTranscriptionSegment, localUserId: String) -> String {
        if segment.speakerId == localUserId {
            return String(localized: "common.me", defaultValue: "Moi", bundle: .main)
        }
        if isGroupStage,
           let member = mesh.roster.members.first(where: { $0.userId == segment.speakerId }),
           !member.displayName.isEmpty {
            return member.displayName
        }
        return callManager.remoteUsername
            ?? segment.speakerDisplayName
            ?? String(localized: "call.incoming.unknown_caller", defaultValue: "Inconnu", bundle: .main)
    }

    private func toggleOriginal(of lineId: UUID) {
        if revealedCaptionIds.contains(lineId) {
            revealedCaptionIds.remove(lineId)
        } else {
            revealedCaptionIds.insert(lineId)
        }
    }

    /// Les sous-titres : les deux dernières phrases, puis leur pied. Ils vivent dans
    /// la pilule (`hasOwnGlass: false`, #17343) ; seuls les sous-titres rangés (la
    /// pilule est cachée) et ceux d'un mode (Effets, Montage) ont un verre à eux.
    func captionsBand(hasOwnGlass: Bool, opensJournal: Bool = true) -> some View {
        CallCaptionsBand(
            lines: journal.items.suffix(2).map(journal.line),
            hasOwnGlass: hasOwnGlass,
            onToggleOriginal: { toggleOriginal(of: $0) },
            onOpenJournal: opensJournal ? { togglePanel(.journal) } : nil
        )
    }

    /// #17343 — ce que la pilule porte de texte au-dessus de sa rangée de base.
    var pillText: CallPillText {
        CallPillText.resolve(isCaptionsEnabled: showTranscript, layer: layer, isChromeRevealed: isChromeVisible)
    }

    /// Loi 11 — un toucher range la pilule, les sous-titres restent dans un verre
    /// sans sa rangée de base, à la place qu'elle occupait.
    @ViewBuilder
    var stowedCaptions: some View {
        if pillText == .captionsAlone {
            captionsBand(hasOwnGlass: true)
                .frame(maxWidth: CallPillWidth.maxWidth(for: .captionsAlone))
                .transition(.opacity)
        }
    }

    func journalActionButton(captioned: Bool, diameter: CGFloat) -> some View {
        CallPillButton(
            symbol: "list.bullet.rectangle",
            kind: layer.openPanel == .journal ? .active : .normal,
            label: CallCaptionsCopy.journalTitle,
            caption: captioned ? CallCaptionsCopy.journal : nil,
            hint: CallCaptionsCopy.journalHint,
            diameter: diameter
        ) {
            togglePanel(.journal)
        }
    }

    /// #17343 — le journal s'ouvre DANS la pilule, à la place des sous-titres, et y
    /// défile ; sa hauteur est une part de la fenêtre (`CallJournalSizing`).
    var journalPanelRows: some View {
        let composed = journal
        return CallJournalPanel(
            items: composed.items, line: composed.line,
            showsOriginal: $showOriginalText,
            height: CallJournalSizing.height(windowHeight: DeviceLayout.windowSize.height),
            onToggleOriginal: { toggleOriginal(of: $0) },
            onClose: closePanel
        )
    }

    /// La dernière phrase FINALE d'un pair : c'est elle, et elle seule, que
    /// VoiceOver annonce — jamais une révision partielle, jamais ma parole.
    var latestFinalRemoteSegmentId: UUID? {
        let localUserId = AuthManager.shared.currentUser?.id ?? ""
        return transcriptionService.displayedSegments
            .last { $0.isFinal && $0.speakerId != localUserId }?
            .id
    }

    func announceLatestCaption() {
        guard showTranscript, UIAccessibility.isVoiceOverRunning,
              let id = latestFinalRemoteSegmentId,
              let segment = transcriptionService.displayedSegments.last(where: { $0.id == id }),
              let announcement = captionLine(for: segment).queuedAnnouncement else { return }
        UIAccessibility.post(notification: .announcement, argument: announcement)
    }

    // MARK: - Captions mode

    /// Derived from `transcriptionService.isShowingOverlay` (le panneau de
    /// l'utilisateur LOCAL) and `showOriginalText` (local display flag) — see
    /// CaptionsMode's own doc comment. Surtout PAS `isTranscribing` : depuis
    /// que ce device capture aussi pour servir un pair qui écoute
    /// (`TranscriptionCapturePolicy`), `isTranscribing` peut être vrai sans
    /// que l'utilisateur local ait rien demandé — le bouton s'allumerait seul.
    private var captionsMode: CaptionsMode {
        CaptionsMode(isShowingCaptions: transcriptionService.isShowingOverlay, showOriginalText: showOriginalText)
    }

    /// Advances the 3-state cycle. Le tap POSE l'état du panneau, puis
    /// `toggleTranscription()` réconcilie la capture avec l'écoute réelle de
    /// l'appel (panneau local OU pair à l'écoute). L'ancien `willStart`, lu
    /// sur `isTranscribing`, n'a plus de sens : la capture peut déjà tourner
    /// pour servir un pair alors que l'utilisateur local n'a rien ouvert.
    func advanceCaptionsMode() {
        // Plus de branche « réception seule » : le cycle est piloté par le
        // PANNEAU (`isShowingOverlay`), que ce tap vient de poser — il est
        // donc toujours cohérent, et un panneau ouvert reste fermable même
        // quand le moteur local a échoué (permission refusée, langue non
        // supportée on-device). C'est cette dérivation qui rendait le panneau
        // infermable, pas l'absence de rustine.
        switch captionsMode.next {
        case .translated:
            showOriginalText = false
            showTranscript = true
            // PERF-005: single authoritative place that flips this — the audio
            // structural transcript panel and the video band both key off it,
            // so it must not depend on either view's own lifecycle
            // (onAppear/onChange copies would drift).
            transcriptionService.isShowingOverlay = true
            callManager.toggleTranscription()
        case .original:
            showOriginalText = true
        case .off:
            showOriginalText = false
            showTranscript = false
            revealedCaptionIds = []
            transcriptionService.isShowingOverlay = false
            callManager.toggleTranscription()
        }
    }

    /// Live captions — cycles off → captions (translated) → captions (original) → off
    /// on tap. Ce bouton commande ce que l'utilisateur LIT ; ce qu'il ÉMET suit
    /// l'écoute réelle de l'appel (`TranscriptionCapturePolicy`).
    /// Il vit dans le rail « l'appel » (duo) ou la rangée « l'appel » (groupe)
    /// depuis #8394 — l'ancien bouton flottant a disparu.
    func captionsActionButton(captioned: Bool, diameter: CGFloat) -> some View {
        let mode = captionsMode
        let icon: String = {
            switch mode {
            case .off: return "captions.bubble"
            case .translated: return "captions.bubble.fill"
            case .original: return "character.bubble.fill"
            }
        }()
        let stateLabel: String = {
            switch mode {
            case .off: return String(localized: "call.control.captions.state.off", defaultValue: "Désactivés", bundle: .main)
            case .translated: return String(localized: "call.control.captions.state.translated", defaultValue: "Traduction", bundle: .main)
            case .original: return String(localized: "call.control.captions.state.original", defaultValue: "Texte original", bundle: .main)
            }
        }()

        // Invitation : le pair transcrit alors que MES sous-titres sont
        // désactivés — point indigo sur l'icône. Statique, pas d'animation
        // continue (audit P2-iOS-9). Disparaît dès que j'active (mode != .off)
        // ou que le pair coupe (`active: false` / fin d'appel).
        let showsPeerInvite = callManager.remoteTranscriptionActive && mode == .off
        let peerInvite = String(
            localized: "call.control.captions.peer_active",
            defaultValue: "Votre interlocuteur a activé la transcription",
            bundle: .main
        )
        let title = CallCaptionsCopy.title

        return Button(action: advanceCaptionsMode) {
            CallPillButtonLabel(
                symbol: icon,
                kind: mode == .off ? .normal : .active,
                caption: captioned ? title : nil,
                diameter: diameter
            )
            .overlay(alignment: .topTrailing) {
                if showsPeerInvite {
                    Circle()
                        .fill(MeeshyColors.indigo400)
                        .frame(width: 10, height: 10)
                        .overlay(Circle().stroke(Color.black.opacity(0.6), lineWidth: MeeshyBorder.strong))
                        .accessibilityHidden(true)
                }
            }
        }
        .buttonStyle(CallPressButtonStyle())
        // Constant label (the feature's name) + a live value (its current
        // state) — NOT .toggleStateAccessibility: this is a 3-state cycle, not
        // a binary toggle. The default Button action already IS the
        // cycle-forward gesture, so no adjustable action is offered.
        .accessibilityLabel(title)
        .accessibilityValue(showsPeerInvite ? "\(stateLabel), \(peerInvite)" : stateLabel)
    }
}
