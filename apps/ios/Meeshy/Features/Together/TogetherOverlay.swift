import SwiftUI
import UIKit
import MeeshySDK
import MeeshyUI

/// « Ensemble » posé au-dessus de toute l'app (#17097, iso `together-host.tsx`) : une invitation reçue est un bandeau
/// NON MODAL en haut ; une invitation envoyée attend en bas (« En attente de X · Annuler ») ; la séance ouverte est un
/// lecteur flottant en bas. L'app reste utilisable dessous.
struct TogetherOverlay: ViewModifier {
    @ObservedObject var center: TogetherCenter

    func body(content: Content) -> some View {
        content
            .overlay(alignment: .top) {
                if let invitation = center.state.invitation {
                    TogetherInvitationBanner(
                        media: invitation.invited.media,
                        name: center.name(of: invitation.invited.fromUserId),
                        onJoin: { Task { await center.join() } },
                        onDecline: { center.decline() }
                    )
                    .transition(.move(edge: .top).combined(with: .opacity))
                    .id(invitation.sessionId)
                }
            }
            .overlay(alignment: .bottom) {
                if let session = center.state.session {
                    TogetherPlayerCard(
                        session: session,
                        partnerName: center.name(of: session.partnerId),
                        clockOffsetMs: center.state.clockOffsetMs ?? 0,
                        onSync: { playing, positionMs in Task { await center.sync(playing: playing, positionMs: positionMs) } },
                        onLeave: { center.leave() }
                    )
                    .id(session.sessionId)
                    .transition(.move(edge: .bottom).combined(with: .opacity))
                } else if let outgoing = center.state.outgoing {
                    TogetherWaitingPill(name: center.name(of: outgoing.toUserId)) { center.leave() }
                        .transition(.move(edge: .bottom).combined(with: .opacity))
                }
            }
            .animation(.easeOut(duration: 0.2), value: center.state.invitation?.sessionId)
            .animation(.easeOut(duration: 0.2), value: center.state.session?.sessionId)
            .animation(.easeOut(duration: 0.2), value: center.state.outgoing?.sessionId)
            .adaptiveOnChange(of: center.notice) { _, new in
                guard let new else { return }
                center.notice = nil
                let text = TogetherWording.notice(new)
                UIAccessibility.post(notification: .announcement, argument: text)
                FeedbackToastManager.shared.show(text, type: new == .ended ? .info : .error)
            }
    }
}

struct TogetherInvitationBanner: View {
    let media: TogetherMediaKind
    let name: String
    let onJoin: () -> Void
    let onDecline: () -> Void

    @Environment(\.colorScheme) private var colorScheme

    private var title: String { TogetherWording.invitation(media: media, name: name) }

    var body: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.sm) {
            HStack(spacing: MeeshySpacing.sm) {
                Image(systemName: media == .video ? "play.rectangle.fill" : "headphones")
                    .accessibilityHidden(true)
                Text(title)
                    .font(.subheadline.weight(.semibold))
                    .fixedSize(horizontal: false, vertical: true)
            }
            .foregroundStyle(Color.white)
            HStack(spacing: MeeshySpacing.sm) {
                Spacer(minLength: 0)
                Button(action: onDecline) {
                    Text(TogetherWording.decline)
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(Color.white)
                        .padding(.horizontal, MeeshySpacing.lg)
                        .frame(minHeight: MeeshyControlSize.tapTarget)
                        .overlay(Capsule().stroke(Color.white, lineWidth: 1.5))
                }
                .accessibilityIdentifier("together.decline")
                Button(action: onJoin) {
                    Text(TogetherWording.join)
                        .font(.subheadline.weight(.bold))
                        .foregroundStyle(MeeshyColors.brandPrimary)
                        .padding(.horizontal, MeeshySpacing.lg)
                        .frame(minHeight: MeeshyControlSize.tapTarget)
                        .background(Capsule().fill(Color.white))
                }
                .accessibilityLabel(TogetherWording.joinA11y(name: name))
                .accessibilityIdentifier("together.join")
            }
        }
        .padding(MeeshySpacing.md)
        .background(RoundedRectangle(cornerRadius: MeeshyRadius.smPlus).fill(MeeshyColors.brandPrimary))
        .frame(maxWidth: 440)
        .padding(.horizontal, MeeshySpacing.lg)
        .accessibilityElement(children: .contain)
        .onAppear { UIAccessibility.post(notification: .announcement, argument: title) }
    }
}

struct TogetherWaitingPill: View {
    let name: String
    let onCancel: () -> Void

    @Environment(\.colorScheme) private var colorScheme

    var body: some View {
        HStack(spacing: MeeshySpacing.md) {
            Text(TogetherWording.waiting(name: name))
                .font(.subheadline)
                .foregroundStyle(MeeshyColors.textPrimary(isDark: colorScheme == .dark))
                .lineLimit(1)
            Button(action: onCancel) {
                Text(TogetherWording.cancel)
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(MeeshyColors.brandPrimary)
                    .frame(minWidth: MeeshyControlSize.tapTarget, minHeight: MeeshyControlSize.tapTarget)
            }
            .accessibilityIdentifier("together.cancel")
        }
        .padding(.leading, MeeshySpacing.lg)
        .padding(.trailing, MeeshySpacing.xs)
        .background(Capsule().fill(.ultraThinMaterial))
        .padding(.bottom, MeeshySpacing.md)
        .accessibilityElement(children: .contain)
    }
}

/// Les phrases d'« ensemble », une clé par sens (sept langues dans `Localizable.xcstrings`, adoptées du catalogue web).
enum TogetherWording {
    static func invitation(media: TogetherMediaKind, name: String) -> String {
        let format = media == .video
            ? String(localized: "together.invite.video", defaultValue: "%@ vous invite à regarder une vidéo ensemble", bundle: .main)
            : String(localized: "together.invite.audio", defaultValue: "%@ vous invite à écouter un audio ensemble", bundle: .main)
        return String(format: format, name)
    }

    static var join: String { String(localized: "together.join", defaultValue: "Rejoindre", bundle: .main) }

    static func joinA11y(name: String) -> String {
        String(format: String(localized: "together.join.a11y", defaultValue: "Rejoindre %@", bundle: .main), name)
    }

    static var decline: String { String(localized: "together.decline", defaultValue: "Refuser", bundle: .main) }

    static func waiting(name: String) -> String {
        String(format: String(localized: "together.waiting", defaultValue: "En attente de %@…", bundle: .main), name)
    }

    static var cancel: String { String(localized: "together.cancel", defaultValue: "Annuler", bundle: .main) }

    static func with(name: String) -> String {
        String(format: String(localized: "together.with", defaultValue: "Ensemble avec %@", bundle: .main), name)
    }

    static var leave: String { String(localized: "together.leave", defaultValue: "Quitter", bundle: .main) }

    static var unavailable: String {
        String(localized: "together.unavailable", defaultValue: "Ce média ne se lit pas sur cet appareil.", bundle: .main)
    }

    static var play: String { String(localized: "together.play", defaultValue: "Lire", bundle: .main) }

    static var pause: String { String(localized: "together.pause", defaultValue: "Pause", bundle: .main) }

    static var position: String { String(localized: "together.position", defaultValue: "Position de lecture", bundle: .main) }

    static func notice(_ notice: TogetherNotice) -> String {
        switch notice {
        case .ended: String(localized: "together.ended", defaultValue: "La séance ensemble est terminée.", bundle: .main)
        case .gone: String(localized: "together.gone", defaultValue: "L’invitation n’est plus valable.", bundle: .main)
        case .joinFailed: String(localized: "together.joinFailed", defaultValue: "Impossible de rejoindre pour l’instant. Réessayez.", bundle: .main)
        }
    }

    static func outcome(_ outcome: TogetherInviteOutcome, name: String) -> String {
        switch outcome {
        case .invited:
            String(format: String(localized: "together.outcome.invited", defaultValue: "Invitation envoyée à %@.", bundle: .main), name)
        case .notAllowed:
            String(localized: "together.outcome.notAllowed", defaultValue: "Ce média ne peut pas se lire ensemble.", bundle: .main)
        case .rateLimited:
            String(localized: "together.outcome.rateLimited", defaultValue: "Trop d’invitations : réessayez dans un instant.", bundle: .main)
        case .offline:
            String(localized: "together.outcome.offline", defaultValue: "Hors ligne : l’invitation n’est pas partie.", bundle: .main)
        case .failed:
            String(localized: "together.outcome.failed", defaultValue: "L’invitation n’est pas partie. Réessayez.", bundle: .main)
        }
    }
}
