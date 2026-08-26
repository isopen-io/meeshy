import SwiftUI
import MeeshySDK
import MeeshyUI

/// En-tête d'identité de la rangée plate — « Pseudo · HH:mm » (contrat
/// §WS-4), affiché UNIQUEMENT en tête de groupe (`input.isFirstInGroup`).
/// Pastille `22` (`FocalMetrics.Avatar.size`), nom `13` heavy
/// (`FocalMetrics.Name`), heure `12`/`600` (`FocalMetrics.Time`).
///
/// « "Toi" en indigo » (critère §7) : `isMe` ⇒ nom = clé `focal.row.you`,
/// tint `MeeshyColors.indigo500`.
///
/// **Directive 2026-08-23 — cet en-tête ne date plus rien.** L'heure, les
/// coches et le libellé « modifié » vivaient ICI pour les têtes de groupe et
/// dans `FocalMetaRow` pour les rangées de suite : la même information
/// changeait de bord selon la place du message dans son groupe, et se
/// dédoublait sur la carte d'un message magnifié. Une seule règle désormais :
/// la ligne BASSE date le message, quelle que soit la rangée.
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
    let isDark: Bool
    var agentStyle: AgentAuthoredStyle.Descriptor = .human
    var onOpenProfile: ((ProfileSheetUser) -> Void)? = nil

    // MARK: - Gabarit (directive 2026-08-24 — le focus réemploie cet en-tête)

    /// Diamètre de la pastille. Défaut : la cote de rangée. La bulle
    /// magnifiée passe la sienne, plus grande.
    var avatarDiameter: CGFloat = FocalMetrics.Avatar.size
    /// Corps du nom. Même raison que `avatarDiameter`.
    var nameSize: CGFloat = FocalMetrics.Name.size
    /// L'en-tête occupe toute sa ligne (`Spacer` + hauteur réservée). La chip
    /// du focus, elle, doit épouser son contenu — une capsule qui s'étirerait
    /// jusqu'au bord traverserait la carte.
    var fillsWidth: Bool = true
    /// Destination du toucher, quand elle diffère de la fiche de l'auteur.
    ///
    /// La bulle magnifiée passe la sienne : les CONDITIONS de l'auteur dans
    /// cette conversation (droits, lien d'entrée, coordonnées consenties),
    /// jamais une page de profil — laquelle n'offre, depuis une conversation,
    /// aucune action. Sans `onTap`, le comportement historique tient.
    var onTap: (() -> Void)? = nil

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
            && lhs.isDark == rhs.isDark
            && lhs.agentStyle == rhs.agentStyle
            && lhs.avatarDiameter == rhs.avatarDiameter
            && lhs.nameSize == rhs.nameSize
            && lhs.fillsWidth == rhs.fillsWidth
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

    var body: some View {
        Button {
            // L'auteur arrive DÉJÀ résolu depuis `Focal/Core/` : cette rangée
            // ne compose pas d'identité, elle la transmet. `Row/` n'a pas le
            // droit de lire un signal d'identité brut (§5.1, garde
            // `FocalNoBubbleSourceGuardTests`), et le présentateur a besoin du
            // `participantId` pour ouvrir la fiche d'un visiteur sans compte
            // plutôt qu'une page de profil vide.
            if let onTap { onTap() } else { onOpenProfile?(profileUser) }
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
                        .font(MeeshyFont.relative(nameSize * 0.8, weight: .semibold))
                        .foregroundColor(.purple)
                        .accessibilityLabel(String(
                            localized: "focal.row.anonymousSender",
                            defaultValue: "Sans compte",
                            bundle: .main
                        ))
                        .accessibilityIdentifier("focal-identity-anonymous-glyph")
                }

                Text(displayName)
                    .font(MeeshyFont.relative(nameSize, weight: FocalMetrics.Name.weight))
                    .foregroundColor(nameColor)
                    .lineLimit(1)

                if agentStyle.showsSpark {
                    AgentSparkGlyph()
                }

                if fillsWidth {
                    Spacer(minLength: 0)
                }
            }
        }
        .buttonStyle(.plain)
        .contentShape(Rectangle())
        // Hauteur FIXE au gabarit `Focus.avatarSize` (34) : la hauteur de
        // rangée ne dépend d'aucun état, la liste ne se réorganise jamais —
        // même invariant que le retrait constant `Focus.textIndent` (34 + 7)
        // de `FocalRow`, qui réserve la même largeur de pastille.
        .frame(minHeight: fillsWidth ? FocalMetrics.Focus.avatarSize : nil)
    }

    private var avatarSize: CGFloat { avatarDiameter }
}
