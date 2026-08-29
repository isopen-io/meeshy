import SwiftUI
import MeeshySDK
import MeeshyUI

/// Vues "systeme" affichees a la place du contenu d'une bulle :
/// - `BubbleDeletedView` quand le message a ete supprime
/// - `BubbleBurnedView` quand un message ephemere a ete vu et efface
///
/// Was: ThemedMessageBubble.deletedMessageView (lignes 363-393) +
/// ThemedMessageBubble.burnedMessageView (lignes 395-425).
///
/// Stateless : reposent uniquement sur `isMe` et `isDark`. Equatable trivial.
struct BubbleDeletedView: View, Equatable {
    let isMe: Bool
    let isDark: Bool

    var body: some View {
        HStack(alignment: .bottom, spacing: 8) {
            if isMe { Spacer(minLength: 50) }

            HStack(spacing: 6) {
                Image(systemName: "nosign")
                    .font(MeeshyFont.relative(12, weight: .medium))
                    .foregroundColor(ThemeManager.shared.textMuted)
                Text(String(localized: "bubble.system.deleted", defaultValue: "Message deleted", bundle: .main))
                    .font(MeeshyFont.relative(13, weight: .regular))
                    .italic()
                    .foregroundColor(ThemeManager.shared.textMuted)
            }
            .padding(.horizontal, MeeshySpacing.md)
            .padding(.vertical, MeeshySpacing.sm)
            .background(
                Capsule()
                    .fill(isDark ? Color.white.opacity(0.05) : Color.black.opacity(0.03))
                    .overlay(
                        Capsule()
                            .stroke(isDark ? Color.white.opacity(0.08) : Color.black.opacity(0.05), lineWidth: 0.5)
                    )
            )
            .accessibilityElement(children: .combine)
            .accessibilityLabel(String(localized: "bubble.system.deleted", defaultValue: "Message deleted", bundle: .main))

            if !isMe { Spacer(minLength: 50) }
        }
        .padding(.horizontal, MeeshySpacing.lg)
        .padding(.vertical, 2)
    }
}

struct BubbleBurnedView: View, Equatable {
    let isMe: Bool
    let isDark: Bool

    var body: some View {
        HStack(alignment: .bottom, spacing: 8) {
            if isMe { Spacer(minLength: 50) }

            HStack(spacing: 6) {
                Image(systemName: "flame.fill")
                    .font(MeeshyFont.relative(12, weight: .medium))
                    .foregroundColor(MeeshyColors.warning)
                Text(String(localized: "bubble.system.burned", defaultValue: "Seen and deleted", bundle: .main))
                    .font(MeeshyFont.relative(13, weight: .regular))
                    .italic()
                    .foregroundColor(ThemeManager.shared.textMuted)
            }
            .padding(.horizontal, MeeshySpacing.md)
            .padding(.vertical, MeeshySpacing.sm)
            .background(
                Capsule()
                    .fill(MeeshyColors.warning.opacity(0.08))
                    .overlay(
                        Capsule()
                            .stroke(MeeshyColors.warning.opacity(0.15), lineWidth: 0.5)
                    )
            )
            .accessibilityElement(children: .combine)
            .accessibilityLabel(String(localized: "bubble.system.burned.a11y", defaultValue: "Message seen and deleted", bundle: .main))

            if !isMe { Spacer(minLength: 50) }
        }
        .padding(.horizontal, MeeshySpacing.lg)
        .padding(.vertical, 2)
    }
}

/// Centered system notice rendered in place of a chat bubble — the FALLBACK
/// for any system message whose `metadata` did not decode into a richer
/// notice (legacy call summaries, legacy join notices, future event kinds).
/// Unlike `BubbleDeletedView`/`BubbleBurnedView` (which still align with the
/// sender side), a system notice is a milestone of the thread: centered, no
/// avatar, thread time engraved FIRST — same semantics as the date stickers
/// and `BubbleJoinNoticeView`. No leading glyph: the producer is unknown by
/// construction (a phone glyph here once mislabelled join notices as calls).
///
/// Stateless: depends only on `text` + `isDark` + `timeString`; the content
/// string itself carries the localized label from the gateway.
struct BubbleSystemNoticeView: View, Equatable {
    let text: String
    let isDark: Bool
    var timeString: String? = nil

    var body: some View {
        HStack(spacing: 0) {
            Spacer(minLength: 24)

            VStack(spacing: 3) {
                if let timeString, !timeString.isEmpty {
                    Text(timeString)
                        .font(MeeshyFont.relative(9.5, weight: .semibold))
                        .foregroundColor(ThemeManager.shared.textMuted.opacity(0.7))
                        .accessibilityIdentifier("bubble-system-notice-time")
                }
                Text(text)
                    .font(MeeshyFont.relative(12.5, weight: .medium))
                    .foregroundColor(ThemeManager.shared.textMuted)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, MeeshySpacing.md)
                    .padding(.vertical, 7)
                    .background(
                        Capsule()
                            .fill(isDark ? Color.white.opacity(0.06) : Color.black.opacity(0.04))
                            .overlay(
                                Capsule()
                                    .stroke(isDark ? Color.white.opacity(0.08) : Color.black.opacity(0.05), lineWidth: 0.5)
                            )
                    )
            }
            .accessibilityElement(children: .combine)
            .accessibilityLabel(text)

            Spacer(minLength: 24)
        }
        .padding(.horizontal, MeeshySpacing.lg)
        .padding(.vertical, 3)
    }
}

/// « X a rejoint la conversation » — une NOTICE, pas un message.
///
/// Sans elle, l'avis retombait sur `BubbleSystemNoticeView`, dont l'icône est
/// un TÉLÉPHONE : cette vue a été écrite pour les résumés d'appel avant de
/// devenir le fourre-tout des messages système. Une arrivée s'y annonçait donc
/// sous un combiné.
///
/// Le texte vient du CATALOGUE, jamais du `content` stocké — celui-ci n'est
/// qu'un repli français écrit par le gateway, et le Prisme Linguistique veut
/// que chaque lecteur voie sa langue. `fallbackText` ne sert que si le nom
/// manque.
///
/// Le masque et la mention « sans compte » vont ENSEMBLE : un glyphe seul ne se
/// lit ni par VoiceOver ni par quelqu'un qui ignore la convention — et c'est
/// l'information la plus utile quand la porte est un lien public.
/// Loi de présentation de l'avis d'arrivée — décidable à part de SwiftUI.
///
/// Le nom DONNÉ au formulaire prime, le pseudo `ano_…` descend en @handle —
/// chacun à sa place. Sans nom donné, le pseudo reste le nom principal et le
/// handle disparaît : « ano_bob » suivi de « @ano_bob » ne dirait rien de plus.
struct JoinNoticePresentation: Equatable {
    let primaryName: String
    let handle: String?
    let showsNoAccountBadge: Bool
    let rules: JoinNoticeMetadata.LinkRules?

    init(notice: BubbleContent.JoinNotice) {
        let givenName = notice.givenName?.isEmpty == false ? notice.givenName : nil
        self.primaryName = givenName ?? notice.displayName
        let username = notice.username?.isEmpty == false ? notice.username : nil
        self.handle = username.flatMap { $0 == (givenName ?? notice.displayName) ? nil : "@\($0)" }
        self.showsNoAccountBadge = notice.isAnonymous
        self.rules = notice.linkRules
    }
}

struct BubbleJoinNoticeView: View, Equatable {
    /// L'avis nomme quelqu'un ET porte son identité de participation : c'est le
    /// moment exact où l'on veut savoir qui vient d'entrer, et sous quelles
    /// conditions. Un DOUBLE TAP ouvre sa fiche — pas un tap simple : la rangée
    /// occupe toute la largeur du fil, et une cible de cette taille se
    /// déclencherait au moindre défilement.
    ///
    /// Ce n'est pas non plus l'appui long, qui l'a porté un temps : ce geste-là
    /// ouvre, PARTOUT ailleurs dans le fil, les options d'un message. Une
    /// pastille système qui se l'approprie ne gagne pas un geste, elle en VOLE
    /// un — et l'avis d'arrivée reste un message du fil (directive 2026-08-24).
    ///
    /// `==` est écrit à la main : une closure n'est pas `Equatable`, et la
    /// synthèse automatique refuserait de compiler. Elle est exclue de la
    /// comparaison — elle ne porte aucun état, seulement une destination.
    static func == (lhs: BubbleJoinNoticeView, rhs: BubbleJoinNoticeView) -> Bool {
        lhs.notice == rhs.notice
            && lhs.isDark == rhs.isDark
            && lhs.timeString == rhs.timeString
    }

    let notice: BubbleContent.JoinNotice
    let isDark: Bool
    var onOpenProfile: ((String) -> Void)? = nil
    /// Heure du fil (« 08:26 ») — gravée EN PREMIER, centrée, même sémantique
    /// que les stickers de date : l'avis est un jalon du fil, pas une parole.
    var timeString: String? = nil

    var body: some View {
        let presentation = JoinNoticePresentation(notice: notice)
        let hasDetailRow = presentation.handle != nil || presentation.rules != nil

        return HStack(spacing: 0) {
            Spacer(minLength: 24)

            VStack(spacing: 3) {
                if let timeString, !timeString.isEmpty {
                    Text(timeString)
                        .font(MeeshyFont.relative(9.5, weight: .semibold))
                        .foregroundColor(ThemeManager.shared.textMuted.opacity(0.7))
                        .accessibilityIdentifier("bubble-join-notice-time")
                }
                HStack(spacing: 6) {
                    Image(systemName: notice.isAnonymous ? "theatermasks.fill" : "person.badge.plus")
                        .font(MeeshyFont.relative(11, weight: .semibold))
                        .foregroundColor(notice.isAnonymous ? .purple : ThemeManager.shared.textMuted)

                    Text(label(for: presentation))
                        .font(MeeshyFont.relative(12.5, weight: .medium))
                        .foregroundColor(ThemeManager.shared.textMuted)
                        .multilineTextAlignment(.center)

                    if presentation.showsNoAccountBadge {
                        Text(String(
                            localized: "bubble.joinNotice.noAccount",
                            defaultValue: "sans compte",
                            bundle: .main
                        ))
                        .font(MeeshyFont.relative(10.5, weight: .semibold))
                        .foregroundColor(.purple)
                        .padding(.horizontal, 6)
                        .padding(.vertical, 2)
                        .background(Capsule().fill(Color.purple.opacity(isDark ? 0.22 : 0.12)))
                        .accessibilityIdentifier("bubble-join-notice-no-account")
                    }
                }

                if hasDetailRow {
                    HStack(spacing: 8) {
                        if let handle = presentation.handle {
                            Text(handle)
                                .font(MeeshyFont.relative(10.5, weight: .medium))
                                .foregroundColor(ThemeManager.shared.textMuted.opacity(0.85))
                                .accessibilityIdentifier("bubble-join-notice-handle")
                        }
                        if let rules = presentation.rules {
                            if presentation.handle != nil {
                                MetaSeparator()
                                    .font(MeeshyFont.relative(10.5))
                                    .foregroundColor(ThemeManager.shared.textMuted.opacity(0.5))
                            }
                            JoinNoticeRulesStrip(rules: rules)
                        }
                    }
                }
            }
            .padding(.horizontal, MeeshySpacing.md)
            .padding(.vertical, hasDetailRow ? 8 : 7)
            .background(
                RoundedRectangle(cornerRadius: hasDetailRow ? 14 : 18, style: .continuous)
                    .fill(isDark ? Color.white.opacity(0.06) : Color.black.opacity(0.04))
                    .overlay(
                        RoundedRectangle(cornerRadius: hasDetailRow ? 14 : 18, style: .continuous)
                            .stroke(isDark ? Color.white.opacity(0.08) : Color.black.opacity(0.05), lineWidth: 0.5)
                    )
            )
            .contentShape(RoundedRectangle(cornerRadius: hasDetailRow ? 14 : 18, style: .continuous))
            // Le double tap est posé sur la PASTILLE seule, pas sur la rangée :
            // celle-ci s'étend d'un bord à l'autre du fil, et une zone active de
            // cette largeur se déclencherait pendant un défilement. Le retour
            // haptique confirme la prise avant que la feuille ne monte.
            .onTapGesture(count: 2) {
                guard let onOpenProfile, !notice.participantId.isEmpty else { return }
                HapticFeedback.medium()
                onOpenProfile(notice.participantId)
            }
            .accessibilityElement(children: .combine)
            .accessibilityIdentifier("bubble-join-notice")
            .accessibilityAddTraits(onOpenProfile == nil ? [] : .isButton)
            .accessibilityHint(Text(openProfileHintLabel))
            // VoiceOver n'a pas de double tap « brut » : l'action lui est
            // offerte explicitement, sinon la fiche lui reste inaccessible.
            .accessibilityAction(named: Text(openProfileActionLabel)) {
                guard let onOpenProfile, !notice.participantId.isEmpty else { return }
                onOpenProfile(notice.participantId)
            }

            Spacer(minLength: 24)
        }
        .padding(.vertical, 4)
    }

    private var openProfileActionLabel: String {
        String(
            localized: "bubble.joinNotice.openProfile",
            defaultValue: "Voir la fiche",
            bundle: .main
        )
    }

    private var openProfileHintLabel: String {
        String(
            localized: "bubble.joinNotice.openProfile.hint.doubleTap",
            defaultValue: "Touchez deux fois pour voir la fiche et les conditions d'entrée",
            bundle: .main
        )
    }

    private func label(for presentation: JoinNoticePresentation) -> String {
        guard !presentation.primaryName.isEmpty else { return notice.fallbackText }
        return String(
            localized: "bubble.joinNotice.joined",
            defaultValue: "\(presentation.primaryName) a rejoint la conversation",
            bundle: .main
        )
    }
}

/// Ce que le lien d'entrée autorise à l'arrivant, en trois glyphes : écrire,
/// joindre un fichier, envoyer une photo. Un droit accordé est teinté, un
/// droit refusé reste éteint — l'œil lit la rangée d'un coup, VoiceOver dit
/// chaque règle en toutes lettres.
struct JoinNoticeRulesStrip: View, Equatable {
    let rules: JoinNoticeMetadata.LinkRules

    var body: some View {
        HStack(spacing: 7) {
            ruleGlyph(
                "bubble.left.fill",
                allowed: rules.canSendMessages,
                label: rules.canSendMessages
                    ? String(localized: "bubble.joinNotice.rule.messages.allowed", defaultValue: "peut écrire des messages", bundle: .main)
                    : String(localized: "bubble.joinNotice.rule.messages.denied", defaultValue: "ne peut pas écrire de messages", bundle: .main)
            )
            ruleGlyph(
                "paperclip",
                allowed: rules.canSendFiles,
                label: rules.canSendFiles
                    ? String(localized: "bubble.joinNotice.rule.files.allowed", defaultValue: "peut envoyer des fichiers", bundle: .main)
                    : String(localized: "bubble.joinNotice.rule.files.denied", defaultValue: "ne peut pas envoyer de fichiers", bundle: .main)
            )
            ruleGlyph(
                "photo.fill",
                allowed: rules.canSendImages,
                label: rules.canSendImages
                    ? String(localized: "bubble.joinNotice.rule.images.allowed", defaultValue: "peut envoyer des photos", bundle: .main)
                    : String(localized: "bubble.joinNotice.rule.images.denied", defaultValue: "ne peut pas envoyer de photos", bundle: .main)
            )
        }
        .accessibilityIdentifier("bubble-join-notice-rules")
    }

    private func ruleGlyph(_ systemName: String, allowed: Bool, label: String) -> some View {
        Image(systemName: systemName)
            .font(MeeshyFont.relative(9.5, weight: .semibold))
            .foregroundColor(allowed ? .purple : ThemeManager.shared.textMuted.opacity(0.35))
            .accessibilityLabel(label)
    }
}
