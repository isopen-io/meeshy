import SwiftUI
import MeeshySDK
import MeeshyUI

// #8433 · #8439 — « Ajouter » et « Réagir » dans « L'appel », et la couche que
// l'écran d'appel pose par-dessus la scène : envol des réactions, invitations
// qui sonnent, mot de retour. #8550 — les réactions se choisissent DANS la
// pilule, en rangée défilante, jamais dans une palette flottante.

extension CallView {
    var callControls: CallControlsController { callManager.controls }

    func addPeopleActionButton(captioned: Bool, diameter: CGFloat) -> some View {
        CallPillButton(
            symbol: "person.badge.plus",
            kind: .normal,
            label: CallControlsCopy.addPeople,
            caption: captioned ? CallControlsCopy.addPeopleCaption : nil,
            toggleState: layer.openPanel == .people,
            diameter: diameter
        ) {
            togglePanel(.people)
        }
    }

    func reactActionButton(captioned: Bool, diameter: CGFloat) -> some View {
        let isOpen = layer.openPanel == .react
        return CallPillButton(
            symbol: "face.smiling",
            kind: isOpen ? .active : .normal,
            label: CallControlsCopy.react,
            caption: captioned ? CallControlsCopy.reactCaption : nil,
            toggleState: isOpen,
            diameter: diameter
        ) {
            togglePanel(.react)
        }
    }

    /// Rangée du (…) déployé, donc candidate du `ViewThatFits` de la pilule :
    /// ses puces sont construites ici, le `ForEach` ne fait que les relire
    /// (#9456, `AsyncRenderRow`).
    var reactionPanelRows: some View {
        let chips = CallReactionEmoji.allCases.map { emoji in
            AsyncRenderRow(id: emoji, content: CallPillChip(art: .emoji(emoji.rawValue), caption: nil, label: emoji.rawValue) {
                HapticFeedback.light()
                _ = callControls.react(emoji)
            })
        }
        return VStack(spacing: 0) {
            CallPanelHeader(title: CallControlsCopy.react, onBack: backToMenu, onClose: closePanel)
            CallPillRow {
                ForEach(chips, content: asyncRenderRowContent)
            }
        }
    }

    /// Les personnes déjà là ou qui sonnent : le sélecteur ne les propose pas.
    var callControlsExcludedIds: Set<String> {
        let members = Set(mesh.roster.members.map(\.userId))
        let ringing = Set(callControls.invites.map(\.userId))
        let peer: Set<String> = callManager.remoteUserId.map { [$0] } ?? []
        let me: Set<String> = callControls.viewer.map { [$0] } ?? []
        return members.union(ringing).union(peer).union(me)
    }

    /// Posée au-dessus de la scène : l'envol des réactions ne capte aucun
    /// toucher.
    var callControlsLayer: some View {
        ZStack(alignment: .bottom) {
            CallFloatingReactionsLayer(reactions: callControls.reactions, reduceMotion: reduceMotion)
                .equatable()
        }
        .onAppear { _ = callControls }
        .sheet(isPresented: panelSheet(.people)) {
            CallAddPeopleSheet(excludedIds: callControlsExcludedIds) { user in
                _ = callControls.invite(user)
            }
            .presentationDetents([.medium, .large])
        }
    }

    /// #8735 — le mot de retour et les invitations qui sonnent, posés JUSTE
    /// AU-DESSUS du bloc de verre (en `overlay` de son bord haut, sans prendre
    /// de place) : épinglés à hauteur fixe, ils couvraient la première rangée
    /// du (…) déployé et volaient ses touchers.
    var callControlsNoticesAbove: some View {
        VStack(spacing: 10) {
            if let notice = callControls.notice {
                CallControlsNoticePill(notice: notice, onDismiss: callControls.dismissNotice)
                    .equatable()
            }
            if !callControls.invites.isEmpty {
                CallInviteStrip(invites: callControls.invites).equatable()
            }
        }
        .alignmentGuide(.top) { $0[.bottom] + 10 }
    }
}
