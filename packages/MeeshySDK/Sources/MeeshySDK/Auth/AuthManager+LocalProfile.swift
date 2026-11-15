import Foundation
import Combine
import os

extension AuthManager {
    @discardableResult
    public func applyLocalProfileChanges(
        displayName: String?,
        bio: String?,
        avatarUrl: String?
    ) -> ProfileSnapshot {
        let snapshot = ProfileSnapshot(
            displayName: currentUser?.displayName,
            bio: currentUser?.bio,
            avatarUrl: currentUser?.avatar
        )
        guard let user = currentUser else { return snapshot }
        let updated = user.withProfileChanges(
            displayName: displayName,
            bio: bio,
            avatar: avatarUrl
        )
        currentUser = updated
        // U3 — remember the optimistic profile so a revalidation/refresh can't
        // clobber it, and persist to the keychain so it survives a cold start
        // (cold-start hydration reads currentUser from the keychain). The
        // guard itself is ALSO persisted (not just the optimistic user) —
        // see `savePendingProfileToKeychain` — so a kill+relaunch before the
        // outbox row confirms still protects the edit from the boot-time
        // `/auth/me` revalidation.
        let pending = ProfileSnapshot(
            displayName: updated.displayName, bio: updated.bio, avatarUrl: updated.avatar)
        pendingOptimisticProfile = pending
        saveUserToKeychain(updated, userId: updated.id)
        savePendingProfileToKeychain(pending, userId: updated.id)
        return snapshot
    }

    public func restoreLocalProfileSnapshot(_ snapshot: ProfileSnapshot) {
        guard let user = currentUser else { return }
        let reverted = user.withProfileChanges(
            displayName: snapshot.displayName,
            bio: snapshot.bio,
            avatar: snapshot.avatarUrl
        )
        currentUser = reverted
        // U3 — the optimistic edit was rolled back; drop the guard + persist.
        pendingOptimisticProfile = nil
        saveUserToKeychain(reverted, userId: reverted.id)
        clearPendingProfileFromKeychain(userId: reverted.id)
    }

    public func applyLocalVoicePublicChange(_ isPublic: Bool) {
        guard let user = currentUser else { return }
        let updated = user.withProfileChanges(voicePublic: isPublic)
        currentUser = updated
        // The change is already server-confirmed (called after PATCH /users/me),
        // so it doesn't join the optimistic guard — just persist for cold start.
        saveUserToKeychain(updated, userId: updated.id)
    }

    /// U3 — merge any in-flight optimistic profile onto a freshly-fetched server
    /// `user`. Returns the user to assign + whether the pending guard should be
    /// cleared: `true` once the server already reflects the optimistic edit (the
    /// `updateProfile` row propagated), so a later external profile change isn't
    /// shadowed by a stale optimistic value. Pure + static for testability;
    /// when `pending == nil` it returns the server user unchanged (the common
    /// login/session path is unaffected).
    static func resolveServerUserWithOptimistic(
        _ server: MeeshyUser, pending: ProfileSnapshot?
    ) -> (user: MeeshyUser, clearedPending: Bool) {
        guard let pending else { return (server, false) }
        if server.displayName == pending.displayName,
           server.bio == pending.bio,
           server.avatar == pending.avatarUrl {
            return (server, true)
        }
        return (
            server.withProfileChanges(
                displayName: pending.displayName, bio: pending.bio, avatar: pending.avatarUrl),
            false
        )
    }
}
