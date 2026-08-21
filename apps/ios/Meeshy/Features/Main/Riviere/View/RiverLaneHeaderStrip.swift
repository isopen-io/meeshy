import SwiftUI
import MeeshySDK
import MeeshyUI

/// L'en-tête de couloirs — « les noms en tête reflètent les auteurs de la
/// ligne, fading et apparition… pendant le scroll vertical » (§7ter B). Cette
/// vue ne RECALCULE RIEN : elle reçoit `[RiverLaneResolver.RiverLaneHeader]`,
/// déjà rendu par `resolveRiverLaneHeaders` (laneIndex, nom, couleur, alpha),
/// et se contente de POSER un `Text` par entrée à l'opacité fournie. La
/// hauteur de la bande (`RiverMetrics.LaneHeader.height`, en PIXELS) est le
/// SEUL nombre que cette vue possède — distincte de `RIVER_HEADER_FADE_RANKS`
/// (loi, en rangs), qui ne franchit jamais la frontière Core → View.
///
/// Suit le défilement horizontal du pane (offset reçu, jamais mesuré ici) —
/// la bande elle-même ne défile PAS verticalement : c'est l'appelant qui la
/// pose hors du `ScrollView` vertical (`RiverStreamHost`).
struct RiverLaneHeaderStrip: View {
    @Environment(\.colorScheme) private var colorScheme
    private var isDark: Bool { colorScheme == .dark }

    let headers: [RiverLaneResolver.RiverLaneHeader]
    let columns: RiverColumnLayout
    /// Décalage horizontal du pane défilant — la bande translate à l'identique
    /// pour rester alignée sur les couloirs qu'elle nomme.
    let horizontalOffset: CGFloat
    /// Largeur RÉELLEMENT visible du plan — ce qui sépare « nommé » de « hors
    /// du champ ». Dite par l'appelant, qui la mesure déjà.
    var visibleWidth: CGFloat = 0

    var body: some View {
        ZStack(alignment: .topLeading) {
            // Identité = l'INDEX du tableau, jamais `laneIndex` seul : au
            // partage de colonnes (§7ter C, plus de 7 voix), deux entrées
            // PEUVENT porter le même `laneIndex` pendant un fondu croisé
            // (« occupations qui se touchent » — deux laneId différents,
            // même colonne). `laneIndex` seul romprait l'unicité qu'exige
            // `ForEach`.
            ForEach(Array(headers.enumerated()), id: \.offset) { _, header in
                headerLabel(header)
                    .position(x: columns.railX(header.laneIndex), y: RiverMetrics.LaneHeader.height / 2)
                    .opacity(header.alpha)
            }
        }
        .frame(width: columns.totalWidth, height: RiverMetrics.LaneHeader.height, alignment: .topLeading)
        .offset(x: -horizontalOffset)
        .clipped()
        .overlay(alignment: .leading) { offscreenBadge(headers: hiddenToTheLeft, edge: .leading) }
        .overlay(alignment: .trailing) { offscreenBadge(headers: hiddenToTheRight, edge: .trailing) }
        // Les NOMS restent décoratifs — ils vivent DÉJÀ dans chaque bulle en
        // tête de groupe (§7ter A2). Les badges de hors-champ, eux, portent
        // une information que RIEN d'autre ne donne : ils gardent leur
        // étiquette (voir `offscreenBadge`).
        .accessibilityElement(children: .contain)
    }

    // MARK: - Hors du champ

    /// « La vue Rivière doit signaler les personnes les plus à droite qu'on ne
    /// voit pas encore dans le plan, et les personnes les plus à gauche »
    /// (arbitrage produit 2026-08-21). Sans ce signal, un plan de sept
    /// couloirs sur un écran qui en montre un et demi laisse croire que la
    /// conversation tient tout entière sous les yeux.
    ///
    /// Le partage se fait sur le RAIL du couloir, la même abscisse que la
    /// bande utilise déjà pour poser ses noms — aucun second calcul de
    /// géométrie (garde R15).
    private var hiddenToTheLeft: [RiverLaneResolver.RiverLaneHeader] {
        guard visibleWidth > 0 else { return [] }
        return headers.filter { columns.railX($0.laneIndex) < horizontalOffset }
    }

    private var hiddenToTheRight: [RiverLaneResolver.RiverLaneHeader] {
        guard visibleWidth > 0 else { return [] }
        return headers.filter { columns.railX($0.laneIndex) > horizontalOffset + visibleWidth }
    }

    @ViewBuilder
    private func offscreenBadge(
        headers hidden: [RiverLaneResolver.RiverLaneHeader],
        edge: HorizontalEdge
    ) -> some View {
        if !hidden.isEmpty {
            HStack(spacing: 3) {
                if edge == .trailing { dots(hidden) }
                Image(systemName: edge == .leading ? "chevron.left" : "chevron.right")
                    .font(MeeshyFont.relative(9, weight: .bold))
                    .foregroundColor(ThemeManager.shared.textMuted)
                if edge == .leading { dots(hidden) }
            }
            .padding(.horizontal, 6)
            .padding(.vertical, 3)
            .background(Capsule().fill(MeeshyColors.backgroundSecondary(isDark: isDark).opacity(0.92)))
            .accessibilityLabel(
                String(
                    format: String(
                        localized: edge == .leading
                            ? "riviere.header.offscreen.left"
                            : "riviere.header.offscreen.right",
                        defaultValue: edge == .leading ? "%lld voix à gauche" : "%lld voix à droite",
                        bundle: .main
                    ),
                    hidden.count
                )
            )
        }
    }

    /// Une pastille par voix hors champ, jusqu'à trois — au-delà, le compte
    /// dit ce que les pastilles ne diraient plus.
    @ViewBuilder
    private func dots(_ hidden: [RiverLaneResolver.RiverLaneHeader]) -> some View {
        HStack(spacing: 2) {
            ForEach(Array(hidden.prefix(3).enumerated()), id: \.offset) { _, header in
                Circle()
                    .fill(Color(hex: DynamicColorGenerator.colorForName(header.colorSeed)))
                    .frame(width: 5, height: 5)
            }
            if hidden.count > 3 {
                Text("\(hidden.count)")
                    .font(MeeshyFont.relative(9, weight: .bold))
                    .foregroundColor(ThemeManager.shared.textMuted)
            }
        }
    }

    private func headerLabel(_ header: RiverLaneResolver.RiverLaneHeader) -> some View {
        // `colorSeed` PORTE le nom affiché — la loi documente `RiverLane.colorSeed`
        // comme la graine passée à `DynamicColorGenerator.colorForName`
        // (`RiverParticipantInput.displayName`, ou l'identifiant en repli si
        // le participant est sorti du groupe) : c'est la MÊME valeur que
        // `RiverBubbleView.senderDisplayName` pour le même auteur, jamais un
        // second nom qui pourrait dériver.
        let colorHex = DynamicColorGenerator.colorForName(header.colorSeed)
        let color = Color(hex: colorHex)
        let name = header.isViewer
            ? String(localized: "riviere.header.you", defaultValue: "Toi", bundle: .main)
            : header.colorSeed

        return HStack(spacing: 6) {
            Circle().fill(color).frame(width: 7, height: 7)
            Text(name.uppercased())
                .font(MeeshyFont.relative(11.5, weight: .semibold))
                .foregroundColor(color)
                .lineLimit(1)
        }
    }
}
