import SwiftUI
import MeeshySDK

// #8438 — l'admin d'un appel de groupe coupe le micro d'un participant ou le
// retire, depuis sa tuile (menu contextuel, et actions VoiceOver). Le menu
// n'existe que pour l'admin, jamais sur sa propre tuile ; retirer demande
// confirmation. La passerelle tranche le droit.

extension View {
    @ViewBuilder
    func moderationMenu(for tile: GroupCallStageTile, controls: CallControlsController, pendingRemoval: Binding<GroupCallStageTile?>, isRemovalPresented: Binding<Bool>) -> some View {
        if !tile.isLocal && controls.moderation.mayModerate(targetUserId: tile.id, viewerId: controls.viewer) {
            self
                .contextMenu {
                    Button {
                        _ = controls.mute(targetUserId: tile.id)
                    } label: {
                        Label(CallControlsCopy.muteParticipant, systemImage: "mic.slash")
                    }
                    Button(role: .destructive) {
                        pendingRemoval.wrappedValue = tile
                    isRemovalPresented.wrappedValue = true
                    } label: {
                        Label(CallControlsCopy.removeParticipant, systemImage: "person.fill.xmark")
                    }
                }
                .accessibilityAction(named: Text(CallControlsCopy.muteParticipant)) {
                    _ = controls.mute(targetUserId: tile.id)
                }
                .accessibilityAction(named: Text(CallControlsCopy.removeParticipant)) {
                    pendingRemoval.wrappedValue = tile
                    isRemovalPresented.wrappedValue = true
                }
        } else {
            self
        }
    }

    func removalConfirmation(pendingRemoval: GroupCallStageTile?, isPresented: Binding<Bool>, controls: CallControlsController) -> some View {
        confirmationDialog(
            CallControlsCopy.removeConfirm(name: pendingRemoval?.displayName ?? ""),
            isPresented: isPresented,
            titleVisibility: .visible,
            presenting: pendingRemoval
        ) { tile in
            Button(CallControlsCopy.removeParticipant, role: .destructive) {
                _ = controls.remove(participantId: tile.id)
            }
            Button(CallControlsCopy.cancel, role: .cancel) {}
        }
    }
}
