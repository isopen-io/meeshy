import SwiftUI
import MeeshySDK
import MeeshyUI

/// En-tête d'identité de la rangée plate — « Pseudo · HH:mm » (contrat
/// §WS-4), affiché UNIQUEMENT en tête de groupe (`input.isFirstInGroup`).
/// Pastille `22` (`FocalMetrics.Avatar.size`), nom `13` heavy
/// (`FocalMetrics.Name`), heure `12`/`600` (`FocalMetrics.Time`).
///
/// « "Toi" en indigo avec ses ✓✓ » (critère §7, amendé 2026-08-18) : `isMe`
/// ⇒ nom = clé `focal.row.you`, tint `MeeshyColors.indigo500`.
/// `BubbleDeliveryCheck` vit dans le groupe de DROITE (après le stamp), à
/// côté de l'heure — même position que `FocalMetaRow` pour les rangées de
/// suite. Amendement user : la coche à côté du NOM doublonnait visuellement
/// avec la coche à côté de l'heure des rangées de suite.
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
    /// L'auteur n'a PAS de compte (`Participant.type == "anonymous"`).
    ///
    /// Décidé par le type, jamais par le pseudo : `ano_` est un préfixe
    /// lisible, pas un espace réservé, et un compte peut le porter.
    var senderIsAnonymous: Bool = false
    /// L'auteur, déjà résolu par `Focal/Core/`. La rangée le transmet au
    /// présentateur sans jamais le composer — voir la garde §5.1.
    var profileUser: ProfileSheetUser
    let timeString: String
    /// Le message EN FOCUS (Focal, 2026-08-21) garde son horodatage en
    /// PERMANENCE — jour + heure, défilement ou pas : il ne passe pas par le
    /// révélé (`FocalRevealedTime`, masqué au repos). `false` = règle
    /// commune des têtes de groupe (révélé pendant le défilement seulement).
    var revealsTimeAlways: Bool = false
    let deliveryStatus: Message.DeliveryStatus?
    let isDark: Bool
    var agentStyle: AgentAuthoredStyle.Descriptor = .human
    var onOpenProfile: ((ProfileSheetUser) -> Void)? = nil
    /// 2026-08-21 : toucher les COCHES (haut-droite, à côté de la date)
    /// ouvre la vue « détails de lecture » du message ; la date reste
    /// informative (pas un bouton).
    var onShowReadStatus: (() -> Void)? = nil
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
            && lhs.senderIsAnonymous == rhs.senderIsAnonymous
            && lhs.timeString == rhs.timeString
            && lhs.deliveryStatus == rhs.deliveryStatus
            && lhs.isDark == rhs.isDark
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
            // L'auteur arrive DÉJÀ résolu depuis `Focal/Core/` : cette rangée
            // ne compose pas d'identité, elle la transmet. `Row/` n'a pas le
            // droit de lire un signal d'identité brut (§5.1, garde
            // `FocalNoBubbleSourceGuardTests`), et le présentateur a besoin du
            // `participantId` pour ouvrir la fiche d'un visiteur sans compte
            // plutôt qu'une page de profil vide.
            onOpenProfile?(profileUser)
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

                // Le fantôme précède le nom : il qualifie l'identité, il ne la
                // décore pas. Sans lui, un visiteur entré par lien public est
                // indiscernable d'un membre inscrit — la distinction la plus
                // utile dans une conversation ouverte à tout venant.
                if senderIsAnonymous {
                    Image(systemName: "theatermasks.fill")
                        .font(MeeshyFont.relative(FocalMetrics.Name.size * 0.8, weight: .semibold))
                        .foregroundColor(.purple)
                        .accessibilityLabel(String(
                            localized: "focal.row.anonymousSender",
                            defaultValue: "Sans compte",
                            bundle: .main
                        ))
                        .accessibilityIdentifier("focal-identity-anonymous-glyph")
                }

                Text(displayName)
                    .font(MeeshyFont.relative(
                        FocalMetrics.Name.size,
                        weight: FocalMetrics.Name.weight
                    ))
                    .foregroundColor(nameColor)
                    .lineLimit(1)

                if agentStyle.showsSpark {
                    AgentSparkGlyph()
                }

                Spacer(minLength: 0)

                editedIndicator

                stamp

                if isMe, let deliveryStatus {
                    deliveryChecks(deliveryStatus)
                }
            }
        }
        .buttonStyle(.plain)
        .contentShape(Rectangle())
        // Hauteur FIXE au gabarit `Focus.avatarSize` (34) : la hauteur de
        // rangée ne dépend d'aucun état, la liste ne se réorganise jamais —
        // même invariant que le retrait constant `Focus.textIndent` (34 + 7)
        // de `FocalRow`, qui réserve la même largeur de pastille.
        .frame(minHeight: FocalMetrics.Focus.avatarSize)
    }

    private var avatarSize: CGFloat {
        FocalMetrics.Avatar.size
    }

    /// Les coches : un bouton quand la rangée sait ouvrir les détails de
    /// lecture (zone de toucher élargie, le glyphe reste au gabarit méta).
    @ViewBuilder
    private func deliveryChecks(_ status: Message.DeliveryStatus) -> some View {
        let check = BubbleDeliveryCheck(status: status, isOffline: false, tint: metaTint, readTint: readTint)
        if let onShowReadStatus {
            Button(action: onShowReadStatus) {
                check
                    .padding(.horizontal, 4)
                    .padding(.vertical, 6)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel(String(localized: "message.read_status", defaultValue: "Détails de lecture", bundle: .main))
        } else {
            check
        }
    }

    /// L'horodatage de tête de groupe — MÊME règle que `FocalMetaRow.stamp` :
    /// révélé pendant le défilement seulement. Sans cette règle commune, une
    /// tête de groupe gardait son heure en dur pendant qu'une rangée de suite
    /// masquait la sienne — deux règles pour la même information. Seule
    /// exception : le message EN FOCUS (`revealsTimeAlways`), dont les
    /// détails — jour + heure compris — sont permanents.
    @ViewBuilder
    private var stamp: some View {
        if revealsTimeAlways {
            Text(timeString)
                .font(MeeshyFont.relative(10.5))
                .foregroundColor(metaTint)
        } else {
            FocalRevealedTime(timeString: timeString, tint: metaTint)
        }
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
