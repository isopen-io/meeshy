import SwiftUI
import MeeshySDK
import MeeshyUI

// #8433 · #8438 · #8439 — ce que l'écran d'appel montre des contrôles :
// la palette des réactions et leur envol, les invitations qui sonnent, le
// sélecteur d'amis à ajouter, le menu de modération et le mot de retour.
// Paramètres primitifs partout : chaque vue ne se réévalue que sur changement.

extension CallControlsCopy {
    static var invitedFormat: String {
        String(localized: "call.invite.format", defaultValue: "%@ vous invite à un appel de groupe", bundle: .main)
    }

    static var addPeopleCaption: String {
        String(localized: "call.control.addPeople.caption", defaultValue: "Ajouter", bundle: .main)
    }

    static var addPeople: String {
        String(localized: "call.control.addPeople", defaultValue: "Ajouter des personnes à l’appel", bundle: .main)
    }

    static var reactCaption: String {
        String(localized: "call.control.react.caption", defaultValue: "Réagir", bundle: .main)
    }

    static var react: String {
        String(localized: "call.control.react", defaultValue: "Envoyer une réaction", bundle: .main)
    }

    static var ringing: String {
        String(localized: "call.invite.ringing", defaultValue: "Sonne…", bundle: .main)
    }

    static var addPeopleTitle: String {
        String(localized: "call.invite.sheet.title", defaultValue: "Ajouter à l’appel", bundle: .main)
    }

    static var addPeopleEmpty: String {
        String(localized: "call.invite.sheet.empty", defaultValue: "Aucun ami à ajouter", bundle: .main)
    }

    static var muteParticipant: String {
        String(localized: "call.moderation.mute", defaultValue: "Couper le micro", bundle: .main)
    }

    static var removeParticipant: String {
        String(localized: "call.moderation.remove", defaultValue: "Retirer de l’appel", bundle: .main)
    }

    static func removeConfirm(name: String) -> String {
        String(format: String(localized: "call.moderation.remove.confirm", defaultValue: "Retirer %@ de l’appel ?", bundle: .main), name)
    }

    static var cancel: String {
        String(localized: "call.moderation.cancel", defaultValue: "Annuler", bundle: .main)
    }

    static func moderationMenu(name: String) -> String {
        String(format: String(localized: "call.moderation.menu", defaultValue: "Options pour %@", bundle: .main), name)
    }

    static func notice(_ notice: CallControlsNotice) -> String {
        switch notice {
        case .mutedBy(let name):
            return String(format: String(localized: "call.moderation.mutedBy", defaultValue: "%@ a coupé votre micro", bundle: .main), name)
        case .inviteFailed:
            return String(localized: "call.invite.failed", defaultValue: "Impossible d’inviter cette personne", bundle: .main)
        case .actionFailed:
            return String(localized: "call.moderation.failed", defaultValue: "Action impossible pour le moment", bundle: .main)
        case .removed(let name):
            return String(format: String(localized: "call.moderation.removed", defaultValue: "%@ a été retiré de l’appel", bundle: .main), name)
        }
    }

    static var reactionsTitle: String {
        String(localized: "call.history.reactions", defaultValue: "Réactions", bundle: .main)
    }
}

/// L'envol des réactions : chacune monte et s'efface ; sous Réduire les
/// animations, elle apparaît et s'efface sur place.
struct CallFloatingReactionsLayer: View, Equatable {
    let reactions: [CallFloatingReaction]
    let reduceMotion: Bool

    var body: some View {
        GeometryReader { proxy in
            ZStack {
                ForEach(reactions) { reaction in
                    CallFloatingReactionView(emoji: reaction.emoji, reduceMotion: reduceMotion)
                        .position(x: proxy.size.width * reaction.lane, y: proxy.size.height * 0.62)
                }
            }
        }
        .allowsHitTesting(false)
        .accessibilityHidden(true)
    }
}

private struct CallFloatingReactionView: View {
    let emoji: CallReactionEmoji
    let reduceMotion: Bool
    @State private var launched = false

    var body: some View {
        Text(emoji.rawValue)
            .font(MeeshyFont.relative(34))
            .offset(y: launched && !reduceMotion ? -260 : 0)
            .scaleEffect(launched && !reduceMotion ? 2.4 : 1.6)
            .opacity(launched ? 0 : 1)
            .onAppear {
                withAnimation(.easeOut(duration: 2.5)) { launched = true }
            }
    }
}

/// Les invitations qui sonnent, au-dessus de la pilule.
struct CallInviteStrip: View, Equatable {
    let invites: [CallPendingInvite]

    var body: some View {
        HStack(spacing: 8) {
            ForEach(invites) { invite in
                HStack(spacing: 6) {
                    MeeshyAvatar(name: invite.displayName, context: .typingIndicator, avatarURL: invite.avatar)
                    Text(invite.displayName)
                        .font(.footnote.weight(.semibold))
                        .foregroundColor(.white)
                        .lineLimit(1)
                    Text(CallControlsCopy.ringing)
                        .font(.caption)
                        .foregroundColor(.white.opacity(0.75))
                }
                .padding(.horizontal, 12)
                .frame(minHeight: 44)
                .callChromeGlass(in: Capsule())
                .accessibilityElement(children: .combine)
            }
        }
    }
}

/// Le mot de retour d'un contrôle, qui s'efface seul.
struct CallControlsNoticePill: View, Equatable {
    let notice: CallControlsNotice
    let onDismiss: () -> Void

    static func == (lhs: Self, rhs: Self) -> Bool { lhs.notice == rhs.notice }

    var body: some View {
        HStack(spacing: 6) {
            Text(CallControlsCopy.notice(notice))
                .font(.footnote.weight(.medium))
                .foregroundColor(.white)
                .lineLimit(2)
            Button(action: onDismiss) {
                Image(systemName: "xmark")
                    .font(.caption.weight(.bold))
                    .foregroundColor(.white.opacity(0.8))
                    .frame(width: 44, height: 44)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel(CallRecordingCopy.close)
        }
        .padding(.leading, 14)
        .callChromeGlass(in: Capsule())
        .task(id: notice) {
            try? await Task.sleep(nanoseconds: 4_000_000_000)
            guard !Task.isCancelled else { return }
            onDismiss()
        }
    }
}

/// Les amis acceptés qu'on peut encore faire sonner : ni moi, ni ceux déjà
/// dans l'appel, ni ceux qui sonnent déjà.
enum CallInviteCandidates {
    static func filter(_ friends: [FriendRequestUser], excluding ids: Set<String>) -> [FriendRequestUser] {
        friends.filter { !ids.contains($0.id) }
    }
}

struct CallAddPeopleSheet: View {
    let excludedIds: Set<String>
    let onInvite: (CallInvitedUser) -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var friends: [FriendRequestUser] = []
    @State private var loaded = false

    var body: some View {
        NavigationStack {
            Group {
                let candidates = CallInviteCandidates.filter(friends, excluding: excludedIds)
                if loaded && candidates.isEmpty {
                    Text(CallControlsCopy.addPeopleEmpty)
                        .font(.body)
                        .foregroundColor(.secondary)
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                } else {
                    List(candidates, id: \.id) { friend in
                        Button {
                            onInvite(CallInvitedUser(userId: friend.id, username: friend.username, displayName: friend.displayName, avatar: friend.avatar))
                            dismiss()
                        } label: {
                            HStack(spacing: 12) {
                                MeeshyAvatar(name: friend.displayName ?? friend.username, context: .userListItem, avatarURL: friend.avatar)
                                Text(friend.displayName ?? friend.username)
                                    .font(.body)
                                Spacer()
                                Image(systemName: "phone.badge.plus")
                                    .foregroundColor(MeeshyColors.indigo500)
                                    .accessibilityHidden(true)
                            }
                            .frame(minHeight: 44)
                        }
                    }
                }
            }
            .navigationTitle(CallControlsCopy.addPeopleTitle)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(CallControlsCopy.cancel) { dismiss() }
                }
            }
        }
        .task {
            friends = await CallInviteFriendsLoader.load()
            loaded = true
        }
    }
}

enum CallInviteFriendsLoader {
    static func load(service: any FriendServiceProviding = FriendService.shared) async -> [FriendRequestUser] {
        guard let me = AuthManager.shared.currentUser?.id,
              let page = try? await service.friendRequests(direction: .any, status: "accepted", q: nil, cursor: nil, limit: 100)
        else { return [] }
        return FriendListAggregator.aggregate(received: page.data, currentUserId: me)
    }
}
