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
    /// La demande est en route (envoi ou renvoi) : ses gestes attendent son identifiant servi.
    var isPending = false
    let onResend: () -> Void
    let onCancel: () -> Void

    @Environment(\.locale) private var locale

    var body: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.md) {
            MeeshyNote(
                sentLine,
                form: .band,
                lead: .systemImage("clock"),
                tint: tint
            )
            MeeshyButtonPair {
                MeeshyButton(
                    String(localized: "profile.relation.request.resend", defaultValue: "Renvoyer", bundle: .module),
                    systemImage: "arrow.clockwise", kind: .outline, size: .s44, width: .fill, isPending: isPending,
                    action: onResend
                )
            } secondary: {
                MeeshyButton(
                    String(localized: "profile.relation.request.cancel", defaultValue: "Annuler", bundle: .module),
                    systemImage: "xmark", kind: .outline, size: .s44, width: .fill, action: onCancel
                )
            }
            .disabled(isPending)
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

/// Étape 3 — « Sofia veut être ton ami·e », son mot dans une bulle — servi dans ma langue par le Prisme, marqué K51
/// « Traduit de l'arabe · Voir l'original » dès qu'une traduction est servie —, puis Accepter et Refuser.
struct ProfileReceivedRequestCard: View {
    let name: String
    let note: ProfileReceivedNote?
    let tint: Color
    let onAccept: () -> Void
    let onDecline: () -> Void

    @Environment(\.locale) private var locale
    @State private var isShowingOriginal = false

    var body: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.md) {
            MeeshyNote(
                String(localized: "profile.relation.request.received.title",
                       defaultValue: "\(name) veut être ton ami·e", bundle: .module),
                lead: .systemImage("person.crop.circle.badge.questionmark"),
                tint: tint
            )
            if let note { noteBubble(note) }
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

    private func noteBubble(_ note: ProfileReceivedNote) -> some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.xs) {
            MeeshyNote(note.text(showingOriginal: isShowingOriginal), form: .band, lead: .systemImage("quote.bubble"),
                       tint: tint)
            if let translation = note.translation {
                MeeshyTranslationMark(
                    sourceLanguageName: TranslationLanguagePhrase.phrase(code: translation.originalLanguage, role: .source,
                                                                         locale: locale),
                    originalLanguageName: TranslationLanguagePhrase.phrase(code: translation.originalLanguage,
                                                                           role: .original, locale: locale),
                    isShowingOriginal: isShowingOriginal,
                    onToggle: { isShowingOriginal.toggle() },
                    tint: tint
                )
                .accessibilityIdentifier("profile.relation.request.received.translationMark")
            }
        }
    }
}

/// Étape 5 — la personne ferme les nouvelles demandes (#19460) : « Sofia n'accepte pas de nouvelles demandes · Tu peux
/// toujours lui écrire », sur une note verrouillée, et « Demander à être amis » éteint, sa raison dite sous lui.
struct ProfileClosedRequestCard: View {
    let name: String

    var body: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.md) {
            MeeshyNote(
                String(localized: "profile.relation.request.closed.title",
                       defaultValue: "\(name) n'accepte pas de nouvelles demandes", bundle: .module),
                form: .band,
                lead: .systemImage("lock"),
                detail: String(localized: "profile.relation.request.closed.detail",
                               defaultValue: "Tu peux toujours lui écrire.", bundle: .module)
            )
            MeeshyButton(
                String(localized: "profile.relation.request.send", defaultValue: "Demander à être amis", bundle: .module),
                systemImage: "person.badge.plus",
                kind: .outline,
                width: .fill,
                disabledReason: String(localized: "profile.relation.request.closed.reason",
                                       defaultValue: "Demandes fermées", bundle: .module),
                action: {}
            )
            .disabled(true)
            .accessibilityIdentifier("profile.relation.request.closed.send")
        }
    }
}

/// Étape 4 — acceptée à l'instant : « Vous êtes amis », ce qui vient de s'ouvrir, et « Écrire à Sofia ». La note monte
/// avec le jeton `rise` de la table de mouvement (K26) ; sous mouvement réduit, la table rend un fondu (loi 7), jamais
/// une apparition à plat.
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
                lead: .systemImage("person.2.fill")
            )
            .scaleEffect(hasArrived || reduceMotion ? 1 : 0.94)
            .opacity(hasArrived ? 1 : 0)
            badges
            MeeshyButton(
                String(localized: "profile.relation.request.accepted.write", defaultValue: "Écrire à \(name)", bundle: .module),
                systemImage: "bubble.left", width: .fill, tint: tint, action: onWrite
            )
        }
        .onAppear {
            withAnimation(MeeshyMotion.animation(.rise, reduce: reduceMotion)) { hasArrived = true }
        }
    }

    /// En ligne quand les trois tiennent, empilées aux tailles d'accessibilité (Dynamic Type) : jamais tronquées.
    private var badges: some View {
        ViewThatFits(in: .horizontal) {
            HStack(spacing: MeeshySpacing.sm) { badgeItems }
            VStack(alignment: .leading, spacing: MeeshySpacing.sm) { badgeItems }
        }
    }

    @ViewBuilder
    private var badgeItems: some View {
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
