import SwiftUI
import MeeshySDK
import MeeshyUI

/// Les gestes du menu « ... » d'une story publiée. Chaque entrée appelle UNE
/// closure du propriétaire : le menu ne connaît ni les sheets, ni les services
/// serveur — il les déclenche.
struct MyStoryMenuActions {
    let onOpen: () -> Void
    let onViewers: () -> Void
    let onEdit: () -> Void
    let onSelectVisibility: (PostVisibility) -> Void
    let onExport: () -> Void
    let onForward: () -> Void
    let onRepost: () -> Void
    let onDelete: () -> Void
}

/// Menu « ... » d'une story publiée : Ouvrir, Listing des vues, Modifier,
/// Visibilité, Partager, Enregistrer, Transférer, Republier, Supprimer.
struct MyStoryActionMenu: View {
    let story: StoryItem
    let isReposting: Bool
    let actions: MyStoryMenuActions

    var body: some View {
        Button {
            actions.onOpen()
        } label: {
            Label(String(localized: "story.mine.open", defaultValue: "Ouvrir"), systemImage: "play.circle")
        }
        Button {
            actions.onViewers()
        } label: {
            Label(String(localized: "story.mine.viewers", defaultValue: "Listing des vues"), systemImage: "eye")
        }
        Button {
            actions.onEdit()
        } label: {
            Label(String(localized: "story.mine.edit", defaultValue: "Modifier"), systemImage: "pencil")
        }
        Menu {
            ForEach(PostVisibility.composerSelectableCases) { mode in
                Button {
                    actions.onSelectVisibility(mode)
                } label: {
                    Label(mode.label,
                          systemImage: StoryVisibilityMenuResolver.symbol(
                            for: mode, currentRawValue: story.visibility))
                }
            }
        } label: {
            Label(String(localized: "story.mine.visibility", defaultValue: "Visibilité"),
                  systemImage: "lock.rotation")
        }
        Button {
            actions.onExport()
        } label: {
            Label(String(localized: "story.mine.share", defaultValue: "Partager"), systemImage: "square.and.arrow.up")
        }
        Button {
            StoryPhotoSaveService.shared.save(story: story)
        } label: {
            Label(String(localized: "story.mine.save", defaultValue: "Enregistrer"), systemImage: "square.and.arrow.down")
        }
        Button {
            actions.onForward()
        } label: {
            Label(String(localized: "story.mine.forward", defaultValue: "Transférer"), systemImage: "arrowshape.turn.up.right")
        }
        Button {
            actions.onRepost()
        } label: {
            Label(String(localized: "story.mine.repost", defaultValue: "Republier"), systemImage: "arrow.2.squarepath")
        }
        .disabled(isReposting)
        Divider()
        Button(role: .destructive) {
            actions.onDelete()
        } label: {
            Label(String(localized: "common.delete", defaultValue: "Supprimer"), systemImage: "trash")
        }
    }
}
