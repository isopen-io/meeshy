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
    let headers: [RiverLaneResolver.RiverLaneHeader]
    let columns: RiverColumnLayout
    /// Décalage horizontal du pane défilant — la bande translate à l'identique
    /// pour rester alignée sur les couloirs qu'elle nomme.
    let horizontalOffset: CGFloat

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
        // Décoratif — le nom vit DÉJÀ dans chaque bulle en tête de groupe
        // (§7ter A2) ; VoiceOver n'a rien à annoncer de plus ici.
        .accessibilityHidden(true)
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
