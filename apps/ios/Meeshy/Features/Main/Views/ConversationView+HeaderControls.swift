import SwiftUI
import MeeshySDK
import MeeshyUI

// MARK: - Les deux contrôles de l'en-tête déplié : le titre et la recherche
//
// Extraits de `ConversationView.swift` (cohésion). Ce sont des vues NOMINALES
// qui ne reçoivent que des valeurs et des actions : l'hôte garde le choix de
// ce qu'ouvre le titre et de ce que fait la recherche.

/// Title + tags column shown when the composer-options drawer is open.
///
/// Arbitrage user 2026-08-18 : la bande DÉPLIÉE ne porte AUCUN bouton
/// d'action (ni mode d'affichage, ni recherche, ni appel — ils vivent
/// dans l'état plié) : titre + tags/catégorie seulement, l'avatar-view
/// montrant déjà les membres les plus actifs d'un groupe. Le tap du
/// titre ouvre les détails ; en conversation DIRECTE, l'appui long
/// propose détails OU profil de l'utilisateur.
struct ConversationHeaderTitleBlock<Tags: View>: View {
    /// F11 (revue adversariale 2026-08-25) : le TITRE et le libellé
    /// d'accessibilité lisent la conversation VIVANTE (`liveConversation`,
    /// depuis #9359) : un pair renommé ou un enregistrement des réglages s'y
    /// voit sans quitter le fil, et le libellé dit le même nom que l'œil lit.
    let title: String
    let accessibilityName: String
    let favoriteEmoji: String?
    let isDark: Bool
    let isDirect: Bool
    let isRevalidating: Bool
    @ViewBuilder let tags: () -> Tags
    let onOpenInfo: () -> Void
    let onOpenProfile: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.xs - 1) {
            HStack(alignment: .top, spacing: MeeshySpacing.xs) {
                titleButton
                Spacer(minLength: 4)
            }

            // Tags row: aligned with title, scrolls under the search icon
            tags()
                .mask(
                    HStack(spacing: 0) {
                        Color.black
                        LinearGradient(colors: [.black, .clear], startPoint: .leading, endPoint: .trailing)
                            .frame(width: 24)
                    }
                )
                .transition(.move(edge: .top).combined(with: .opacity))
        }
        .transition(.move(edge: .trailing).combined(with: .opacity))
    }

    /// Le bouton-titre de la bande dépliée — tap = détails de la
    /// conversation ; en DIRECT, appui long = choix détails / profil
    /// (arbitrage user 2026-08-18).
    @ViewBuilder
    private var titleButton: some View {
        let button = Button { onOpenInfo() } label: {
            titleLabel
                .meeshyTapTarget()
        }
        .accessibilityLabel(accessibilityName)
        .accessibilityHint(String(localized: "conversation.view.open_info", bundle: .main))

        if isDirect {
            button.contextMenu {
                Button {
                    onOpenInfo()
                } label: {
                    Label(String(localized: "conversation.view.details", defaultValue: "Détails de la conversation", bundle: .main), systemImage: "info.circle.fill")
                }
                Button {
                    onOpenProfile()
                } label: {
                    Label(String(localized: "conversation.view.view_profile", defaultValue: "Voir le profil", bundle: .main), systemImage: "person.circle.fill")
                }
            }
        } else {
            button
        }
    }

    /// Title text + optional revalidation sparkle. Splitting this off keeps
    /// the conditional `Image` inside its own opaque type and prevents
    /// SwiftUI from baking it into the parent's already-complex type tree.
    @ViewBuilder
    private var titleLabel: some View {
        HStack(spacing: MeeshySpacing.xs + 2) {
            ConversationTitleLabel(
                name: title,
                favoriteEmoji: favoriteEmoji,
                font: MeeshyFont.relative(MeeshyFont.subheadSize, weight: .bold, design: .rounded),
                color: isDark ? .white : MeeshyColors.indigo950, // blanc sur le verre clair était illisible (#8822)
                lineLimit: 2
            )
            // Subtle "revalidating" sparkle: shown while we serve stale cache
            // and silently refresh from the server. Disappears as soon as the
            // REST response lands — no blocking spinner.
            if isRevalidating {
                Image(systemName: "sparkles")
                    .font(MeeshyFont.relative(MeeshyIconSize.xxs, weight: .semibold))
                    .foregroundStyle(.white.opacity(MeeshyOpacity.intense))
                    .adaptiveSymbolPulse()
                    .accessibilityLabel(String(localized: "conversation.view.refreshing_background", bundle: .main))
            }
        }
    }
}

/// Le bouton de recherche de l'en-tête. Le glyphe est une struct NOMINALE
/// (`HeaderSearchGlyph`) : le type structurel du bouton lui-même (crash
/// stack-overflow du décodeur de métadonnées Swift au 1er rendu SUR DEVICE,
/// .ips du 2026-07-30 dans `expandedHeaderSearchButton.getter`) reste trivial.
/// Leçon 5cdde93c4 : couper au niveau du type qui est décodé.
struct ConversationHeaderSearchButton: View {
    let accentColor: String
    let secondaryColor: String
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HeaderSearchGlyph(accentColor: accentColor, secondaryColor: secondaryColor)
        }
        .accessibilityLabel(String(localized: "conversation.view.search_in_conversation", bundle: .main))
        .accessibilityHint(String(localized: "accessibility.search.hint", bundle: .main))
        .accessibilityIdentifier("conversation.header.search")
    }
}

// MARK: - Header Search Glyph (extracted struct to keep the Button's type trivial)

/// Struct NOMINALE : le type structurel du glyphe (opaques `adaptiveGlass` +
/// `meeshyTapTarget`, chacun portant ses 2 branches #available) reste scopé à
/// ce body au lieu de gonfler le mangled name du Button parent — dont le
/// décodage récursif débordait la pile du main thread au 1er rendu SUR DEVICE
/// (.ips 2026-07-30, `expandedHeaderSearchButton.getter`).
private struct HeaderSearchGlyph: View {
    let accentColor: String
    let secondaryColor: String

    var body: some View {
        Image(systemName: "magnifyingglass")
            .font(MeeshyFont.relative(MeeshyIconSize.xs, weight: .semibold))
            .foregroundStyle(LinearGradient(colors: [Color(hex: accentColor), Color(hex: secondaryColor)], startPoint: .topLeading, endPoint: .bottomTrailing))
            .frame(width: MeeshyControlSize.small, height: MeeshyControlSize.small)
            .adaptiveGlass(in: Circle(), tint: Color(hex: accentColor).opacity(MeeshyOpacity.medium))
            .meeshyTapTarget()
    }
}
