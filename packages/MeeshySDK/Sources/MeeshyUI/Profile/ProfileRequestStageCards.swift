import SwiftUI
import MeeshySDK

// MARK: - Les étapes d'une demande (planche `Etat-Demande`, #18870)
//
// Faites du kit (loi 12) : la note (K46) dit l'étape, la paire de boutons (K40) offre ce qu'on peut y faire, les
// pastilles (K41) disent ce qui vient de s'ouvrir. L'étape « aucune demande » vit dans `ProfileFriendRequestCard`.

/// Étape 2 — « Demande envoyée il y a 2 j · Sofia n'a pas encore répondu », puis Renvoyer et Annuler.
struct ProfileSentRequestCard: View {
    let name: String
    let sentAt: Date?
    let tint: Color
    let onResend: () -> Void
    let onCancel: () -> Void

    @Environment(\.locale) private var locale

    var body: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.md) {
            MeeshyNote(
                sentLine,
                form: .band,
                lead: .systemImage("clock"),
                detail: String(localized: "profile.relation.request.sent.detail",
                               defaultValue: "\(name) n'a pas encore répondu.", bundle: .module),
                tint: tint
            )
            MeeshyButtonPair {
                MeeshyButton(
                    String(localized: "profile.relation.request.resend", defaultValue: "Renvoyer", bundle: .module),
                    systemImage: "arrow.clockwise", kind: .outline, size: .s44, width: .fill, action: onResend
                )
            } secondary: {
                MeeshyButton(
                    String(localized: "profile.relation.request.cancel", defaultValue: "Annuler", bundle: .module),
                    systemImage: "xmark", kind: .outline, size: .s44, width: .fill, action: onCancel
                )
            }
        }
    }

    private var sentLine: String {
        guard let sentAt else {
            return String(localized: "profile.relation.request.sent.title", defaultValue: "Demande envoyée", bundle: .module)
        }
        let formatter = RelativeDateTimeFormatter()
        formatter.locale = locale
        formatter.unitsStyle = .abbreviated
        let ago = formatter.localizedString(for: sentAt, relativeTo: Date())
        return String(localized: "profile.relation.request.sent.ago", defaultValue: "Demande envoyée \(ago)", bundle: .module)
    }
}

/// Étape 3 — « Sofia veut être ton ami·e », son mot dans une bulle, puis Accepter (le geste qui avance) et Refuser.
struct ProfileReceivedRequestCard: View {
    let name: String
    let note: String?
    let tint: Color
    let onAccept: () -> Void
    let onDecline: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.md) {
            MeeshyNote(
                String(localized: "profile.relation.request.received.title",
                       defaultValue: "\(name) veut être ton ami·e", bundle: .module),
                lead: .systemImage("person.crop.circle.badge.questionmark"),
                tint: tint
            )
            if let note {
                MeeshyNote(note, form: .band, lead: .systemImage("quote.bubble"), tint: tint)
            }
            MeeshyButtonPair {
                MeeshyButton(
                    String(localized: "profile.relation.request.accept", defaultValue: "Accepter", bundle: .module),
                    systemImage: "checkmark", width: .fill, tint: tint, action: onAccept
                )
            } secondary: {
                MeeshyButton(
                    String(localized: "profile.relation.request.decline", defaultValue: "Refuser", bundle: .module),
                    systemImage: "xmark", kind: .outline, width: .fill, action: onDecline
                )
            }
        }
    }
}

/// Étape 4 — acceptée à l'instant : « Vous êtes amis », ce qui vient de s'ouvrir, et « Écrire à Sofia ». La note
/// monte avec le jeton `rise` de la table de mouvement (K26), à plat sous mouvement réduit.
struct ProfileAcceptedRequestCard: View {
    let name: String
    let isOnline: Bool
    let tint: Color
    let onWrite: () -> Void

    @Environment(\.accessibilityReduceMotion) private var systemReduceMotion
    @Environment(\.meeshyForceReduceMotion) private var forcedReduceMotion
    @State private var hasArrived = false

    private var reduceMotion: Bool {
        MeeshyMotion.shouldReduce(system: systemReduceMotion, userForced: forcedReduceMotion)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.md) {
            MeeshyNote(
                String(localized: "profile.relation.request.accepted.title", defaultValue: "Vous êtes amis", bundle: .module),
                form: .banner,
                kind: .ok,
                lead: .systemImage("person.2.fill"),
                detail: String(localized: "profile.relation.request.accepted.detail",
                               defaultValue: "\(name) et toi pouvez maintenant vous voir en ligne.", bundle: .module)
            )
            .scaleEffect(hasArrived || reduceMotion ? 1 : 0.94)
            .opacity(hasArrived || reduceMotion ? 1 : 0)
            badges
            MeeshyButton(
                String(localized: "profile.relation.request.accepted.write", defaultValue: "Écrire à \(name)", bundle: .module),
                systemImage: "bubble.left", width: .fill, tint: tint, action: onWrite
            )
        }
        .onAppear {
            guard !reduceMotion else { return }
            withAnimation(MeeshyMotion.animation(.rise, reduce: false)) { hasArrived = true }
        }
    }

    private var badges: some View {
        HStack(spacing: MeeshySpacing.sm) {
            MeeshyBadge(
                .label(String(localized: "profile.relation.request.accepted.connected", defaultValue: "Connectés", bundle: .module)),
                leading: .systemImage("person.fill.checkmark"), kind: .ok
            )
            MeeshyBadge(
                .label(String(localized: "profile.relation.request.accepted.friend", defaultValue: "Ami", bundle: .module)),
                leading: .systemImage("hands.clap"), tint: tint
            )
            if isOnline {
                MeeshyBadge(
                    .label(String(localized: "profile.relation.request.accepted.online", defaultValue: "En ligne", bundle: .module)),
                    leading: .dot, kind: .ok
                )
            }
        }
    }
}
