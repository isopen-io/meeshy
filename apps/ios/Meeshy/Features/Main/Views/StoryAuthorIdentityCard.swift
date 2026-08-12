import SwiftUI
import MeeshySDK
import MeeshyUI

// MARK: - Story Author Identity Card

/// Rendu UNIQUE de l'identité d'un auteur de stories pendant la transition
/// inter-groupes : bannière du profil en FOND (ThumbHash placeholder, fallback
/// gradient couleur avatar → noir), voile de lisibilité, et au centre l'identité
/// (avatar, nom, @username, présence, mood).
///
/// **Une seule implémentation, deux surfaces** (directive user 2026-07-25) :
/// - `StoryGroupIntroOverlay` (interstitiel plein écran après le commit du switch)
/// - `NeighborGroupCubeFace` (face entrante du cube, révélée AU DOIGT pendant le swipe)
///
/// C'est cette unicité qui garantit qu'il n'y a plus de « double affichage
/// divergent » : la face du cube et l'interstitiel montrent littéralement la
/// MÊME vue, donc la révélation au doigt se prolonge sans rupture visuelle dans
/// l'interstitiel. La contrainte précédente (« aucune identité dans la face du
/// cube », 2026-07-14) visait deux rendus DIFFÉRENTS qui s'enchaînaient ; elle
/// est levée par cette unification.
///
/// Paramètres OPAQUES uniquement (aucun singleton observé ici — règle « Zero
/// Unnecessary Re-render » : la vue est montée dans des surfaces animées à
/// 60-120 Hz). La présence et l'amitié sont résolues par l'appelant.
struct StoryAuthorIdentityCard: View {
    let intro: StoryViewModel.StoryGroupIntro
    let avatarURL: String?
    let avatarColor: String
    let presence: UserPresence?
    /// `true` quand l'auteur du groupe est un ami — gate le détail de
    /// présence (« En ligne » / « Actif·ve récemment » / « Absent·e »).
    /// Directive user 2026-07-13 : le statut « en ligne » est une information
    /// réservée aux amis, pas affichée pour un auteur hors contacts.
    let isFriend: Bool
    /// Permet à la face du cube de faire MONTER la carte au doigt (0 → 1 le
    /// long du drag). L'interstitiel, lui, l'affiche pleine (`1.0`).
    var contentOpacity: Double = 1.0

    var body: some View {
        // Le fond vit en `.background`, JAMAIS dans un ZStack avec l'identité.
        // Dans un ZStack, la bannière `.scaledToFill()` impose sa taille
        // intrinsèque au conteneur : le bloc identité était alors centré sur un
        // espace plus large que l'écran et sortait par la gauche (mesuré à
        // −227 pt le 2026-07-25, l'avatar et le nom coupés au bord).
        // `.background` ne participe pas au dimensionnement — le centrage ne
        // peut plus dériver, sans dépendre d'un `GeometryReader` ni d'un
        // `.position()` calculé.
        identityContent
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background {
                bannerBackground
                    .overlay(
                        LinearGradient(
                            colors: [.black.opacity(0.62), .black.opacity(0.28), .black.opacity(0.72)],
                            startPoint: .top, endPoint: .bottom
                        )
                    )
            }
            .clipped()
            .opacity(contentOpacity)
            .environment(\.colorScheme, .dark)
    }

    /// Fallback UNIQUE (pas de banner / banner en échec ou en chargement) —
    /// une seule définition consommée par les deux branches de
    /// `bannerBackground` pour qu'elles ne puissent jamais diverger visuellement.
    private var avatarColorFallbackGradient: LinearGradient {
        LinearGradient(
            colors: [Color(hex: avatarColor), .black],
            startPoint: .topLeading, endPoint: .bottomTrailing
        )
    }

    private var bannerBackground: some View {
        Group {
            if let banner = intro.bannerURL, !banner.isEmpty {
                // `showsStatusOverlays: false` : en échec/chargement de la
                // bannière, AUCUN spinner ni bouton Retry ne doit saigner au
                // centre de l'écran sous l'avatar (IMG_1155/1158, directive
                // user 2026-07-13) — le fallback reste le gradient/thumbHash.
                CachedAsyncImage(
                    url: banner,
                    thumbHash: intro.bannerThumbHash,
                    showsStatusOverlays: false
                ) {
                    avatarColorFallbackGradient
                }
                .scaledToFill()
            } else {
                avatarColorFallbackGradient
            }
        }
        // Verrou de taille — même piège que `NeighborGroupCubeFace` : une
        // bannière dont le ratio diffère de l'écran peut proposer une taille
        // intrinsèque asymétrique et faire dériver le centrage de
        // `identityContent` au-dessus.
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .clipped()
    }

    private var identityContent: some View {
        VStack(spacing: 14) {
            // `storyTray` = 88 pt, le plus grand context avatar — l'identité
            // est le sujet de l'écran. Présence + mood délégués au badge/capsule
            // dédiés ci-dessous (plus lisibles qu'un dot 10 pt sur l'avatar).
            MeeshyAvatar(
                name: intro.displayName ?? intro.username,
                context: .storyTray,
                accentColor: avatarColor,
                avatarURL: avatarURL
            )
            VStack(spacing: 4) {
                Text(intro.displayName ?? intro.username)
                    .font(.title2.weight(.bold))
                    .foregroundStyle(.white)
                if intro.displayName != nil {
                    Text("@\(intro.username)")
                        .font(.subheadline)
                        .foregroundStyle(.white.opacity(0.75))
                }
            }
            if isFriend {
                presenceBadge
            }
            if let emoji = intro.moodEmoji {
                HStack(spacing: 8) {
                    Text(emoji).font(.title3)
                    if let message = intro.moodMessage, !message.isEmpty {
                        Text(message)
                            .font(.subheadline)
                            .foregroundStyle(.white.opacity(0.9))
                            .lineLimit(2)
                    }
                }
                .padding(.horizontal, 14)
                .padding(.vertical, 8)
                .background(.ultraThinMaterial, in: Capsule())
            }
        }
        .padding(.horizontal, 32)
    }

    // Règle 1/3/5 : au-delà de 5 min d'inactivité (offline), AUCUN badge —
    // pas de dot gris « Hors ligne » sur l'identité de groupe.
    @ViewBuilder
    private var presenceBadge: some View {
        let state = presence?.state ?? .offline
        if state.showsIndicator {
            HStack(spacing: 6) {
                Circle()
                    .fill(state.dotColor)
                    .frame(width: 9, height: 9)
                Text(Self.presenceLabel(state))
                    .font(.caption.weight(.medium))
                    .foregroundStyle(.white.opacity(0.85))
            }
        }
    }

    /// Libellé de présence de l'interlude — `static` pour que le résumé
    /// VoiceOver de `StoryGroupIntroOverlay` réutilise EXACTEMENT le texte du
    /// badge visuel au lieu d'en redéclarer un jumeau.
    static func presenceLabel(_ state: PresenceState) -> String {
        switch state {
        case .online:
            return String(localized: "story.groupIntro.online", defaultValue: "En ligne")
        case .idle:
            return String(localized: "story.groupIntro.idle", defaultValue: "Inactif·ve")
        case .away:
            return String(localized: "story.groupIntro.away", defaultValue: "Absent·e")
        case .offline:
            return String(localized: "story.groupIntro.offline", defaultValue: "Hors ligne")
        }
    }
}
