import SwiftUI
import MeeshySDK
import MeeshyUI

// #8433 · #8439 — « Ajouter » et « Réagir » dans les actions au-dessus de la
// pilule, et la couche que l'écran d'appel pose par-dessus la scène : envol
// des réactions, invitations qui sonnent, palette, mot de retour.

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
        CallPillButton(
            symbol: "face.smiling",
            kind: showReactionPalette ? .active : .normal,
            label: CallControlsCopy.react,
            caption: captioned ? CallControlsCopy.reactCaption : nil,
            toggleState: showReactionPalette,
            diameter: diameter
        ) {
            withAnimation(reduceMotion ? nil : .spring(response: 0.3, dampingFraction: 0.85)) {
                showReactionPalette.toggle()
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
                if showReactionPalette && isChromeVisible {
                    CallReactionPalette { emoji in
                        _ = callControls.react(emoji)
                    }
                    .transition(.scale(scale: 0.9).combined(with: .opacity))
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
