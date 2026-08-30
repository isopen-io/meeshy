import SwiftUI
import MeeshySDK
import MeeshyUI

/// The single message-bubble footer. Renders a `BubbleFooterModel` — flags +
/// translate on the leading edge, timestamp + delivery check pinned trailing.
/// `Equatable` on `model` only (the actions are stateless closures), so list
/// cells stay at zero re-render via `.equatable()`.
struct BubbleFooter: View, Equatable {
    let model: BubbleFooterModel
    let actions: BubbleFooterActions
    let style: BubbleFooterStyle
    let isDark: Bool

    static func == (lhs: BubbleFooter, rhs: BubbleFooter) -> Bool {
        lhs.model == rhs.model && lhs.style == rhs.style && lhs.isDark == rhs.isDark
    }

    var body: some View {
        switch style {
        case .row:     rowFooter
        case .overlay: overlayFooter
        case .compact: compactFooter
        }
    }

    // MARK: - Compact style (inline next to emoji-only)

    @ViewBuilder
    private var compactFooter: some View {
        // Bloc minimaliste destine a etre pose sur la meme baseline qu'un
        // emoji free-floating. Pas de drapeaux, pas de bouton translate,
        // pas de capsule de fond : juste timestamp + delivery check (si
        // message envoye). Le tout dans un HStack tres serre pour rester
        // visuellement attache a l'emoji.
        HStack(spacing: 3) {
            if let timestamp = model.timestamp {
                Text(timestamp)
                    .font(.caption.weight(.medium))
                    .foregroundColor(compactMetaColor)
            }
            if model.delivery != nil {
                if model.isFailed, let onRetry = actions.onRetry {
                    Button(action: { onRetry(); HapticFeedback.light() }) {
                        HStack(spacing: 3) {
                            deliveryView(tint: compactMetaColor, readTint: readColor)
                            Image(systemName: "arrow.clockwise")
                                .font(.caption2.weight(.bold))
                                .foregroundColor(MeeshyColors.error)
                        }
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel(String(localized: "bubble.footer.resend", defaultValue: "Renvoyer le message", bundle: .main))
                } else {
                    deliveryView(tint: compactMetaColor, readTint: readColor)
                }
            }
        }
    }

    private var compactMetaColor: Color {
        // Le compact footer s'affiche TOUJOURS hors d'une bulle (free-floating
        // emoji), donc on n'a pas de fond brand a contraster. On utilise la
        // couleur meta neutre quel que soit isMe.
        isDark ? .white.opacity(0.55) : .black.opacity(0.5)
    }

    // MARK: - Row style (text / emoji / audio / story-reply)

    @ViewBuilder
    private var rowFooter: some View {
        if let sender = model.sender {
            HStack(alignment: .top, spacing: 8) {
                MeeshyAvatar(
                    name: sender.name,
                    context: .messageBubble,
                    accentColor: sender.accentColor,
                    avatarURL: sender.avatarURL,
                    storyState: sender.storyRing,
                    moodEmoji: sender.moodEmoji,
                    presenceState: sender.presence,
                    enablePulse: false,
                    onTap: actions.onSenderTap,
                    onViewProfile: actions.onSenderTap,
                    onViewStory: actions.onViewStory,
                    contextMenuItems: avatarMenu(sender: sender)
                )
                VStack(alignment: .leading, spacing: 2) {
                    HStack(spacing: 4) {
                        // Nom borné à 16 caractères (directive user 2026-07-30) :
                        // au-delà, le pseudo mangeait la rangée et repoussait
                        // l'heure + l'accusé de lecture contre le bord. Le
                        // `lineLimit(1)` reste comme filet pour les très grandes
                        // tailles Dynamic Type, mais la borne est posée ici.
                        Text(DisplayName.truncated(sender.name))
                            .font(.footnote.weight(.semibold))
                            .lineLimit(1)
                        roleBadge(sender.role)
                        metaLeading
                        Spacer(minLength: 4)
                        metaTrailing
                    }
                    if let username = sender.username {
                        Text(username)
                            .font(.caption2)
                            .foregroundColor(metaColor.opacity(0.8))
                            .lineLimit(1)
                    }
                }
            }
        } else {
            HStack(spacing: 4) {
                metaLeading
                Spacer(minLength: 4)
                metaTrailing
            }
        }
    }

    // MARK: - Overlay style (image / carousel / video)

    @ViewBuilder
    private var overlayFooter: some View {
        if model.timestamp != nil || model.delivery != nil {
            HStack(spacing: 3) {
                if let timestamp = model.timestamp {
                    Text(timestamp)
                        .font(.caption2.weight(.semibold))
                        .foregroundColor(.white)
                }
                deliveryView(tint: .white.opacity(0.85), readTint: MeeshyColors.indigo400)
            }
            .padding(.horizontal, 7)
            .padding(.vertical, 3)
            .background(Capsule().fill(Color.black.opacity(0.55)))
        }
    }

    // MARK: - Shared element groups

    /// Leading affordances: translate controller + language flags.
    ///
    /// **Ordre voulu** : le bouton translate `🌐` vient TOUJOURS EN PREMIER
    /// (position stable), suivi des drapeaux disponibles à sa droite. Cette
    /// disposition garantit qu'un utilisateur retrouve le contrôleur exactement
    /// au même endroit, qu'une traduction existe déjà ou non — il peut donc
    /// systématiquement demander une autre langue sans devoir repérer un
    /// bouton qui se déplace selon le nombre de drapeaux. Avant ce changement
    /// les drapeaux occupaient le leading et poussaient le translate, ce qui
    /// rendait l'affordance instable.
    @ViewBuilder
    private var metaLeading: some View {
        // Toujours afficher le contrôleur translate quand un callback est
        // fourni, même si aucune langue alternative n'est encore disponible :
        // c'est l'entrée vers la demande de traduction (sheet langue / ajout).
        if let onTranslate = actions.onTranslate {
            Button(action: { onTranslate(); HapticFeedback.light() }) {
                Image(systemName: "translate")
                    .font(.caption2.weight(.medium))
                    .foregroundColor(MeeshyColors.indigo400)
            }
            .buttonStyle(.plain)
            .accessibilityLabel(model.showsTranslate
                                ? String(localized: "bubble.footer.translation.available", defaultValue: "Traduction disponible", bundle: .main)
                                : String(localized: "bubble.footer.translation.request", defaultValue: "Demander la traduction", bundle: .main))
        }
        if !model.flags.isEmpty {
            HStack(spacing: 2) {
                ForEach(model.flags, id: \.code) { flag in
                    footerFlagPill(flag)
                }
            }
        }
    }

    /// Trailing meta: timestamp + delivery check (or retry button on failure).
    @ViewBuilder
    private var metaTrailing: some View {
        if let timestamp = model.timestamp {
            Text(timestamp)
                .font(.caption.weight(.medium))
                .foregroundColor(metaColor)
        }
        if model.delivery != nil {
            if model.isFailed, let onRetry = actions.onRetry {
                Button(action: { onRetry(); HapticFeedback.light() }) {
                    HStack(spacing: 3) {
                        deliveryView(tint: metaColor, readTint: readColor)
                        Image(systemName: "arrow.clockwise")
                            .font(.caption2.weight(.bold))
                            .foregroundColor(MeeshyColors.error)
                    }
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel(String(localized: "bubble.footer.resend", defaultValue: "Renvoyer le message", bundle: .main))
            } else {
                deliveryView(tint: metaColor, readTint: readColor)
            }
        }
    }

    @ViewBuilder
    private func deliveryView(tint: Color, readTint: Color) -> some View {
        if let delivery = model.delivery {
            let check = BubbleDeliveryCheck(
                status: delivery,
                isOffline: model.isOffline,
                tint: tint,
                readTint: readTint,
                sendStartedAt: model.sendStartedAt
            )
            if let onShowReadStatus = actions.onShowReadStatus {
                // Tap sur les coches -> ouvre le sheet detail a l'onglet
                // "Vues" pour consulter qui a recu / qui a lu. Le bouton
                // englobe une hit-area 22pt pour rester confortable au
                // pouce sans elargir visuellement la coche.
                Button(action: {
                    HapticFeedback.light()
                    onShowReadStatus()
                }) {
                    check
                        .frame(minWidth: 22, minHeight: 22)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel(String(localized: "bubble.footer.readStatus", defaultValue: "Voir le statut de lecture", bundle: .main))
                .accessibilityHint(String(localized: "bubble.footer.readStatus.hint", defaultValue: "Ouvre le détail du message sur l'onglet Vues", bundle: .main))
            } else {
                check
            }
        }
    }

    /// Le pied de bulle sert la MÊME puce que le fil, le détail, les
    /// commentaires, la story et les reels — `LanguageFlagChip`, en registre
    /// `.compact`.
    ///
    /// Ce que le registre préserve de la version qui vivait ici : un `Button`
    /// (et non un `onTapGesture`, dont le tap serait avalé par le
    /// `.simultaneousGesture(LongPressGesture(0.35))` que `BubbleSwipeContainer`
    /// pose sur la bulle), un `contentShape` À L'INTÉRIEUR du label, et la cible
    /// de 22 pt qui tient même quand le drapeau est inactif — sans soulignement,
    /// le `VStack` retomberait à ~12 pt.
    private func footerFlagPill(_ flag: FooterFlag) -> some View {
        LanguageFlagChip(code: flag.code, isActive: flag.isActive, metrics: .compact) {
            actions.onFlagTap?(flag.code)
        }
    }

    @ViewBuilder
    private func roleBadge(_ role: MemberRole?) -> some View {
        if let role, role != .member {
            Label {
                Text(role.displayName).font(.caption2)
            } icon: {
                Image(systemName: role.icon).font(.caption2)
            }
            .foregroundColor(role == .creator ? MeeshyColors.warning : MeeshyColors.indigo500)
        }
    }

    private func avatarMenu(sender: SenderIdentity) -> [AvatarContextMenuItem]? {
        var items: [AvatarContextMenuItem] = []
        if let onViewStory = actions.onViewStory, sender.storyRing != .none {
            items.append(AvatarContextMenuItem(
                label: String(localized: "bubble.avatar.viewStory", defaultValue: "Voir la story", bundle: .main),
                icon: "play.circle.fill",
                action: onViewStory
            ))
        }
        if let onSenderTap = actions.onSenderTap {
            items.append(AvatarContextMenuItem(
                label: String(localized: "bubble.avatar.viewProfile", defaultValue: "Voir le profil", bundle: .main),
                icon: "person.circle",
                action: onSenderTap
            ))
        }
        return items.isEmpty ? nil : items
    }

    private var metaColor: Color {
        model.isMe ? .white.opacity(0.7) : (isDark ? .white.opacity(0.55) : .black.opacity(0.5))
    }

    private var readColor: Color {
        // `.read` is always indigo — never white, never bold. A lighter
        // indigo reads on dark surfaces, a deeper one on light surfaces.
        isDark ? MeeshyColors.indigo400 : MeeshyColors.indigo600
    }
}
