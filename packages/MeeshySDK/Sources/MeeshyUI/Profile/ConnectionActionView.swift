import SwiftUI
import Combine
import MeeshySDK

// MARK: - Connection Action Pill
//
// Compact pill/badge that renders the right action for the current user's
// relationship with another user. Drop this in any cell that lists a user
// (Discover row, mention picker, member list, …) and it stays in sync with
// `FriendshipCache` and `BlockService` automatically — accepting a request
// elsewhere flips this badge to "Contact" the next frame.
//
// State -> rendering:
//   .current          -> hidden (no action for self)
//   .blocked          -> grey "Bloqué" badge (read-only)
//   .connected        -> green "Contact" badge (read-only)
//   .pendingReceived  -> two pill buttons: ✗ refuser  ✓ accepter
//   .pendingSent      -> outlined "En attente" button that cancels on tap
//   .none             -> filled "Ajouter" button
//
// The component owns the optimistic mutation + rollback so callers don't
// reimplement the wire-up everywhere.

public struct ConnectionActionView: View {
    public let userId: String
    public let userName: String
    public let accentColor: Color
    public var onError: ((String) -> Void)?
    public var onSuccess: ((String) -> Void)?

    @ObservedObject private var friendshipCache = FriendshipCache.shared
    @ObservedObject private var blockService = BlockService.shared
    @State private var isBusy = false

    private let friendService: FriendServiceProviding
    private let resolver: UserRelationshipResolver

    public init(
        userId: String,
        userName: String,
        accentColor: Color = MeeshyColors.indigo500,
        friendService: FriendServiceProviding = FriendService.shared,
        resolver: UserRelationshipResolver = .shared,
        onError: ((String) -> Void)? = nil,
        onSuccess: ((String) -> Void)? = nil
    ) {
        self.userId = userId
        self.userName = userName
        self.accentColor = accentColor
        self.friendService = friendService
        self.resolver = resolver
        self.onError = onError
        self.onSuccess = onSuccess
    }

    public var body: some View {
        // `@ObservedObject` on `friendshipCache` and `blockService` already
        // subscribes us to `objectWillChange`; the `resolve()` call below is
        // a plain function so it re-runs on every body evaluation.
        let state = resolver.resolve(userId: userId)

        Group {
            switch state {
            case .current:
                EmptyView()

            case .blocked:
                badge(
                    text: String(localized: "connection.badge.blocked", defaultValue: "Bloqué", bundle: .module),
                    color: MeeshyColors.error
                )

            case .connected:
                badge(
                    text: String(localized: "connection.badge.contact", defaultValue: "Contact", bundle: .module),
                    color: MeeshyColors.success,
                    icon: "checkmark"
                )

            case .pendingReceived(let requestId):
                pendingReceivedButtons(requestId: requestId)

            case .pendingSent:
                pendingSentButton()

            case .none:
                addButton()
            }
        }
        .animation(.spring(response: 0.35, dampingFraction: 0.85), value: state)
    }

    // MARK: - Sub-views

    private func badge(text: String, color: Color, icon: String? = nil) -> some View {
        HStack(spacing: 4) {
            if let icon {
                Image(systemName: icon)
                    .font(.system(size: 10, weight: .bold))
            }
            Text(text)
                .font(.system(size: 12, weight: .semibold))
        }
        .foregroundColor(color)
        .padding(.horizontal, 10)
        .padding(.vertical, 5)
        .background(Capsule().fill(color.opacity(0.15)))
        .accessibilityLabel(text)
    }

    private func pendingReceivedButtons(requestId: String) -> some View {
        let declineLabel = String(localized: "connection.action.decline", defaultValue: "Refuser", bundle: .module)
        let acceptLabel = String(localized: "connection.action.accept", defaultValue: "Accepter", bundle: .module)
        return HStack(spacing: 6) {
            Button {
                Task { await decline(requestId: requestId) }
            } label: {
                Image(systemName: "xmark")
                    .font(.system(size: 11, weight: .bold))
                    .foregroundColor(MeeshyColors.error)
                    .frame(width: 28, height: 28)
                    .background(Circle().fill(MeeshyColors.error.opacity(0.15)))
            }
            .disabled(isBusy)
            .accessibilityLabel("\(declineLabel) — \(userName)")

            Button {
                Task { await accept(requestId: requestId) }
            } label: {
                Image(systemName: "checkmark")
                    .font(.system(size: 11, weight: .bold))
                    .foregroundColor(.white)
                    .frame(width: 28, height: 28)
                    .background(Circle().fill(MeeshyColors.success))
            }
            .disabled(isBusy)
            .accessibilityLabel("\(acceptLabel) — \(userName)")
        }
    }

    private func pendingSentButton() -> some View {
        let cancelLabel = String(localized: "connection.action.cancel", defaultValue: "Annuler la demande", bundle: .module)
        let pendingLabel = String(localized: "connection.badge.pendingSent", defaultValue: "En attente", bundle: .module)
        return Button {
            Task { await cancelSent() }
        } label: {
            HStack(spacing: 4) {
                Image(systemName: "clock")
                    .font(.system(size: 10, weight: .bold))
                Text(pendingLabel)
                    .font(.system(size: 12, weight: .semibold))
            }
            .foregroundColor(MeeshyColors.warning)
            .padding(.horizontal, 10)
            .padding(.vertical, 5)
            .background(Capsule().fill(MeeshyColors.warning.opacity(0.15)))
            .overlay(Capsule().stroke(MeeshyColors.warning.opacity(0.5), lineWidth: 1))
        }
        .disabled(isBusy)
        .accessibilityLabel("\(cancelLabel) — \(userName)")
    }

    private func addButton() -> some View {
        let addLabel = String(localized: "connection.action.add", defaultValue: "Ajouter", bundle: .module)
        return Button {
            Task { await sendRequest() }
        } label: {
            HStack(spacing: 4) {
                Image(systemName: "person.badge.plus")
                    .font(.system(size: 10, weight: .bold))
                Text(addLabel)
                    .font(.system(size: 12, weight: .semibold))
            }
            .foregroundColor(.white)
            .padding(.horizontal, 12)
            .padding(.vertical, 5)
            .background(Capsule().fill(accentColor))
        }
        .disabled(isBusy)
        .accessibilityLabel("\(addLabel) — \(userName)")
    }

    // MARK: - Actions (optimistic + rollback)

    private func sendRequest() async {
        guard !isBusy else { return }
        isBusy = true
        defer { isBusy = false }
        HapticFeedback.success()
        do {
            let request = try await friendService.sendFriendRequest(receiverId: userId, message: nil)
            friendshipCache.didSendRequest(to: userId, requestId: request.id)
            onSuccess?(String(localized: "connection.toast.requestSent", defaultValue: "Demande envoyée", bundle: .module))
        } catch {
            HapticFeedback.error()
            onError?(String(localized: "connection.toast.requestSendFailed", defaultValue: "Impossible d'envoyer la demande", bundle: .module))
        }
    }

    private func accept(requestId: String) async {
        guard !isBusy else { return }
        isBusy = true
        defer { isBusy = false }
        friendshipCache.didAcceptRequest(from: userId)
        HapticFeedback.success()
        do {
            _ = try await friendService.respond(requestId: requestId, accepted: true)
            onSuccess?(String(localized: "connection.toast.connectionAccepted", defaultValue: "Connexion acceptée", bundle: .module))
        } catch {
            friendshipCache.rollbackAccept(senderId: userId, requestId: requestId)
            HapticFeedback.error()
            onError?(String(localized: "connection.toast.acceptFailed", defaultValue: "Impossible d'accepter", bundle: .module))
        }
    }

    private func decline(requestId: String) async {
        guard !isBusy else { return }
        isBusy = true
        defer { isBusy = false }
        friendshipCache.didRejectRequest(from: userId)
        HapticFeedback.medium()
        do {
            _ = try await friendService.respond(requestId: requestId, accepted: false)
            onSuccess?(String(localized: "connection.toast.requestDeclined", defaultValue: "Demande refusée", bundle: .module))
        } catch {
            friendshipCache.rollbackReject(senderId: userId, requestId: requestId)
            HapticFeedback.error()
            onError?(String(localized: "connection.toast.declineFailed", defaultValue: "Impossible de refuser", bundle: .module))
        }
    }

    private func cancelSent() async {
        guard !isBusy else { return }
        guard case .pendingSent(let requestId) = friendshipCache.status(for: userId) else { return }
        isBusy = true
        defer { isBusy = false }
        friendshipCache.didCancelRequest(to: userId)
        HapticFeedback.medium()
        do {
            try await friendService.deleteRequest(requestId: requestId)
            onSuccess?(String(localized: "connection.toast.requestCancelled", defaultValue: "Demande annulée", bundle: .module))
        } catch {
            friendshipCache.didSendRequest(to: userId, requestId: requestId)
            HapticFeedback.error()
            onError?(String(localized: "connection.toast.cancelFailed", defaultValue: "Impossible d'annuler", bundle: .module))
        }
    }
}
