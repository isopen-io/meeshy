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
            diameter: diameter
        ) {
            showAddPeople = true
        }
    }

    func reactActionButton(captioned: Bool, diameter: CGFloat) -> some View {
        let isOpen = controlsDisclosure.isOpen(.react)
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

    var reactionPanelRows: some View {
        VStack(spacing: 0) {
            CallPanelHeader(title: CallControlsCopy.react, onClose: closePanel)
            CallPillRow {
                ForEach(CallReactionEmoji.allCases, id: \.self) { emoji in
                    CallPillChip(art: .emoji(emoji.rawValue), caption: nil, label: emoji.rawValue) {
                        HapticFeedback.light()
                        _ = callControls.react(emoji)
                    }
                }
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

    /// Posée au-dessus de la scène et sous la pilule : l'envol des réactions
    /// ne capte aucun toucher.
    var callControlsLayer: some View {
        ZStack(alignment: .bottom) {
            CallFloatingReactionsLayer(reactions: callControls.reactions, reduceMotion: reduceMotion)
                .equatable()
            VStack(spacing: 10) {
                if let notice = callControls.notice {
                    CallControlsNoticePill(notice: notice, onDismiss: callControls.dismissNotice)
                        .equatable()
                }
                if !callControls.invites.isEmpty {
                    CallInviteStrip(invites: callControls.invites).equatable()
                }
            }
            .padding(.bottom, Self.chromeBottomInset + 200)
        }
        .onAppear { _ = callControls }
        .sheet(isPresented: $showAddPeople) {
            CallAddPeopleSheet(excludedIds: callControlsExcludedIds) { user in
                _ = callControls.invite(user)
            }
            .presentationDetents([.medium, .large])
        }
    }
}
