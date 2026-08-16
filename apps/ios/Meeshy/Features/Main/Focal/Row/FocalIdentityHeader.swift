import SwiftUI
import MeeshySDK
import MeeshyUI

/// En-tête d'identité de la rangée plate — « Pseudo · HH:mm » (contrat
/// §WS-4), affiché UNIQUEMENT en tête de groupe (`input.isFirstInGroup`).
/// Pastille `22` (`FocalMetrics.Avatar.size`), nom `13` heavy
/// (`FocalMetrics.Name`), heure `12`/`600` (`FocalMetrics.Time`).
///
/// « "Toi" en indigo avec ses ✓✓ » (critère §7) : `isMe` ⇒ nom = clé
/// `focal.row.you`, tint `MeeshyColors.indigo500`, `BubbleDeliveryCheck`
/// DANS l'en-tête (pas en pied — contrat §WS-4 : « pas en pied »).
///
/// Vue PURE : primitifs uniquement, aucun `@State`.
///
/// **`agentStyle` (WS-10, F-089)** : anneau pointillé + étincelle ✦ quand
/// `.showsDashedRing`/`.showsSpark` (contrat §3.8/§WS-10). Défaut `.human`
/// — TOUS les sites d'appel existants (avant ce chantier) obtiennent un
/// rendu bit-à-bit identique sans rien changer. `AgentAuthoredStyle.resolve`
/// (jamais recalculé ici — cette vue reste une feuille PURE) gate déjà sur
/// `isAgentGrammarEnabled` ; `.human` est le SEUL descripteur possible tant
/// que ce drapeau reste OFF (défaut de ce chantier, C3).
struct FocalIdentityHeader: View, Equatable {
    let isMe: Bool
    let senderDisplayName: String
    let senderUsername: String?
    let senderAvatarURL: String?
    let senderThumbHash: String?
    let senderColorHex: String
    let senderPresence: PresenceState
    let senderStoryRing: StoryRingState
    let senderMoodEmoji: String?
    let timeString: String
    let deliveryStatus: Message.DeliveryStatus?
    let isDark: Bool
    /// Cette rangée est l'élue du pass (§4.6) : pastille et nom agrandis,
    /// et l'horodatage passe de l'heure seule à « jour · heure ».
    var isFocused: Bool = false
    /// Date d'envoi complète, pour l'élue seulement. `nil` ⇒ l'en-tête s'en
    /// tient à `timeString` (comportement d'avant la magnification, que tous
    /// les sites d'appel non focalisés obtiennent sans rien passer).
    var sentAt: Date? = nil
    var agentStyle: AgentAuthoredStyle.Descriptor = .human
    var onOpenProfile: ((ProfileSheetUser) -> Void)? = nil
    /// F-083ter (F10) — voir `editedIndicator`.
    var editedAt: Date? = nil
    var isEditSaving: Bool = false
    var hasEditHistory: Bool = false

    static func == (lhs: FocalIdentityHeader, rhs: FocalIdentityHeader) -> Bool {
        lhs.isMe == rhs.isMe
            && lhs.senderDisplayName == rhs.senderDisplayName
            && lhs.senderUsername == rhs.senderUsername
            && lhs.senderAvatarURL == rhs.senderAvatarURL
            && lhs.senderThumbHash == rhs.senderThumbHash
            && lhs.senderColorHex == rhs.senderColorHex
            && lhs.senderPresence == rhs.senderPresence
            && lhs.senderStoryRing == rhs.senderStoryRing
            && lhs.senderMoodEmoji == rhs.senderMoodEmoji
            && lhs.timeString == rhs.timeString
            && lhs.deliveryStatus == rhs.deliveryStatus
            && lhs.isDark == rhs.isDark
            && lhs.isFocused == rhs.isFocused
            && lhs.sentAt == rhs.sentAt
            && lhs.agentStyle == rhs.agentStyle
            && lhs.editedAt == rhs.editedAt
            && lhs.isEditSaving == rhs.isEditSaving
            && lhs.hasEditHistory == rhs.hasEditHistory
    }

    /// Nom affiché — clé `focal.row.you` pour « Toi » (contrat §7),
    /// `senderDisplayName` sinon.
    private var displayName: String {
        isMe
            ? String(localized: "focal.row.you", defaultValue: "Toi", bundle: .main)
            : senderDisplayName
    }

    private var nameColor: Color {
        isMe ? MeeshyColors.indigo500 : (isDark ? .white.opacity(0.92) : .black.opacity(0.88))
    }

    /// `.read` toujours indigo (jamais blanc, jamais gras) — paire réelle du
    /// dépôt actée par le contrat §0 : `indigo400` sombre / `indigo600` clair
    /// (`BubbleFooter.readColor`, `private`, reconstruit ici à l'identique —
    /// même écart de réutilisation que WS-3, la logique est triviale, 2
    /// branches, pas une loi).
    private var readTint: Color {
        isDark ? MeeshyColors.indigo400 : MeeshyColors.indigo600
    }

    /// F-083ter : lit désormais `FocalMetrics.MetaText` — une seule source
    /// avec `FocalMetaRow`, jamais deux littéraux qui peuvent dériver
    /// (c'est cette dérive qui a produit la régression de contraste F-083,
    /// cf. doc de `FocalMetaRow`). Effet de bord POSITIF documenté : le
    /// littéral clair passe de `0.5` à `0.55` (`FocalMetrics.MetaText`,
    /// calcul vérifié — `0.5` clair ne mesurait que 3,98:1, sous AA) —
    /// répare au passage le déficit de contraste clair préexistant de CETTE
    /// rangée, jusqu'ici « hors périmètre F-090 » faute de la constante
    /// partagée qui permet de le faire sans dupliquer un littéral.
    private var metaTint: Color {
        isDark ? .white.opacity(FocalMetrics.MetaText.darkOpacity) : .black.opacity(FocalMetrics.MetaText.lightOpacity)
    }

    var body: some View {
        Button {
            onOpenProfile?(ProfileSheetUser(
                userId: nil,
                username: senderUsername ?? senderDisplayName,
                displayName: senderDisplayName,
                avatarURL: senderAvatarURL,
                accentColor: senderColorHex
            ))
        } label: {
            HStack(spacing: 7) {
                MeeshyAvatar(
                    name: senderDisplayName,
                    context: .custom(avatarSize),
                    accentColor: senderColorHex,
                    avatarURL: senderAvatarURL,
                    thumbHash: senderThumbHash,
                    storyState: senderStoryRing,
                    moodEmoji: senderMoodEmoji,
                    presenceState: senderPresence,
                    enablePulse: false,
                    isDark: isDark
                )
                .agentAuthoredAvatarRing(agentStyle, diameter: avatarSize)

                Text(displayName)
                    .font(MeeshyFont.relative(
                        isFocused ? FocalMetrics.Focus.nameSize : FocalMetrics.Name.size,
                        weight: FocalMetrics.Name.weight
                    ))
                    .foregroundColor(nameColor)
                    .lineLimit(1)

                if agentStyle.showsSpark {
                    AgentSparkGlyph()
                }

                if isMe, let deliveryStatus {
                    BubbleDeliveryCheck(
                        status: deliveryStatus,
                        isOffline: false,
                        tint: metaTint,
                        readTint: readTint
                    )
                }

                Spacer(minLength: 0)

                editedIndicator

                stamp
            }
        }
        .buttonStyle(.plain)
        .contentShape(Rectangle())
        .frame(minHeight: avatarSize)
    }

    private var avatarSize: CGFloat {
        isFocused ? FocalMetrics.Focus.avatarSize : FocalMetrics.Avatar.size
    }

    /// L'horodatage de tête de groupe — MÊME règle que `FocalMetaRow.stamp`,
    /// pour que les deux formes de rangée se comportent à l'identique.
    ///
    /// - Élue : PERMANENT, « jour · heure ».
    /// - Sinon : révélé pendant le défilement seulement. Sans cette branche,
    ///   une tête de groupe gardait son heure en dur pendant qu'une rangée de
    ///   suite masquait la sienne — deux règles pour la même information.
    @ViewBuilder
    private var stamp: some View {
        if isFocused {
            SwiftUI.Text(stampString)
                .font(FocalMetrics.Time.font)
                .foregroundColor(metaTint)
                .lineLimit(1)
        } else {
            FocalRevealedTime(timeString: timeString, tint: metaTint)
        }
    }

    /// « Date et heure de l'envoi visible (même sans scroll) » pour l'élue.
    ///
    /// Le jour vient de `MessageDayLabel` et l'heure de `timeString` (déjà
    /// formatée par `TimeStringCache` en amont) — les deux formateurs
    /// existants, réutilisés verbatim, exactement comme
    /// `ScrollTimePillLabelFormatter` le faisait pour la pilule qu'on retire.
    /// AUCUN `DateFormatter` neuf (contrat §WS-2, règle conservée).
    ///
    /// Hors focus, ou faute de date, on retombe sur `timeString` seul : le
    /// rendu d'avant la magnification, bit-à-bit.
    private var stampString: String {
        guard isFocused, let sentAt else { return timeString }
        let day = MessageDayLabel.label(for: sentAt, now: Date(), calendar: .current, locale: .current)
        return "\(day) · \(timeString)"
    }

    /// F-083ter (F10) — « un message édité affiche « modifié » en 10.5 en
    /// méta » : jusqu'ici seul le libellé VoiceOver l'annonçait
    /// (`MessageAccessibilityLabelComposer`, F-080) — l'œil ne voyait rien.
    /// Réutilise `BubbleEditedIndicator` (§1.3, `internal`, vérifié non
    /// `fileprivate`) TEL QUEL.
    @ViewBuilder
    private var editedIndicator: some View {
        if editedAt != nil || isEditSaving {
            BubbleEditedIndicator(isMe: isMe, isSaving: isEditSaving, hasEditHistory: hasEditHistory, isDark: isDark)
        }
    }
}
