import SwiftUI
import MeeshySDK
import MeeshyUI

// MARK: - Les panneaux nés avec « Imagine » (#8692) : Format, Frame, Médias

/// Ce que les panneaux « Frame » et « Médias » OFFRENT — un réglage n'existe
/// que s'il change la carte (loi 4 : un contrôle existe s'il a un effet).
/// Lois pures, lues par le plateau et par leurs témoins.
enum MessageCardTrayOffer {

    /// L'orientation de l'en-tête ne se règle que s'il y a un en-tête à orienter.
    static func headerOrientations(_ format: MessageCardFormat, hasTitle: Bool) -> [MessageCardHeaderOrientation] {
        format.showDate || (format.showConversationTitle && hasTitle) ? MessageCardHeaderOrientation.allCases : []
    }

    /// La place des noms ne se règle que si une ligne de nom (ou d'heure) est peinte.
    static func placements(_ format: MessageCardFormat) -> [MessageCardAuthorPlacement] {
        format.showAuthors || format.showTimes ? MessageCardAuthorPlacement.allCases : []
    }

    /// Les dispositions des médias : aucune sans image, la mosaïque à partir de deux.
    static func mediaLayouts(_ kinds: [MessageCardMediaKind]) -> [MessageCardMediaLayout] {
        let visuals = kinds.filter(\.isVisual).count
        guard visuals > 0 else { return [] }
        return MessageCardMediaLayout.allCases.filter { $0 != .mosaic || visuals > 1 }
    }

    /// Les représentations du son : seulement s'il y a un son.
    static func audioStyles(_ kinds: [MessageCardMediaKind]) -> [MessageCardAudioStyle] {
        kinds.contains(.audio) ? MessageCardAudioStyle.allCases : []
    }
}

extension MessageCardExportTray {

    /// Le FORMAT de l'image — la toile dessinée à son rapport, sous son nom.
    var formatPanel: some View {
        row {
            ForEach(MessageCardAspect.allCases, id: \.self) { aspect in
                tile(MessageCardExportText.aspectLabel(aspect), selected: aspect == format.disposition.aspect) {
                    format.disposition.aspect = aspect
                } content: {
                    MessageCardAspectGlyph(aspect: aspect)
                }
                .accessibilityValue(aspect.ratio ?? "")
            }
        }
    }

    /// « Frame » — l'en-tête en ligne, lettre à lettre ou couché ; l'inclinaison
    /// du message ; la place des noms ; la date, les heures et le pseudo.
    var framePanel: some View {
        let orientations = MessageCardTrayOffer.headerOrientations(format, hasTitle: hasTitle)
        let placements = MessageCardTrayOffer.placements(format)
        return VStack(alignment: .leading, spacing: 8) {
            row {
                ForEach(orientations, id: \.self) { orientation in
                    tile(MessageCardExportText.headerLabel(orientation), selected: orientation == format.disposition.headerOrientation) {
                        format.disposition.headerOrientation = orientation
                    } content: {
                        Image(systemName: MessageCardExportSymbols.header(orientation)).font(.title3)
                    }
                }
                ForEach(MessageCardTilt.allCases, id: \.self) { tilt in
                    tile(MessageCardExportText.tiltLabel(tilt), selected: tilt == format.disposition.tilt) {
                        format.disposition.tilt = tilt
                    } content: {
                        Image(systemName: MessageCardExportSymbols.tilt(tilt)).font(.title3)
                    }
                }
            }
            row {
                ForEach(format.frameToggles(hasHandles: hasHandles), id: \.self) { toggle in
                    pill(MessageCardExportText.toggleLabel(toggle), selected: format[toggle]) {
                        format[toggle].toggle()
                    }
                }
                ForEach(placements, id: \.self) { placement in
                    pill(MessageCardExportText.placementLabel(placement), selected: placement == format.disposition.authorPlacement) {
                        format.disposition.authorPlacement = placement
                    }
                }
            }
        }
    }

    /// « Médias » — où se posent les images, et comment se représente un son.
    var mediaPanel: some View {
        let layouts = MessageCardTrayOffer.mediaLayouts(mediaKinds)
        let styles = MessageCardTrayOffer.audioStyles(mediaKinds)
        return VStack(alignment: .leading, spacing: 8) {
            if !layouts.isEmpty {
                row {
                    ForEach(layouts, id: \.self) { layout in
                        tile(MessageCardExportText.mediaLayoutLabel(layout), selected: layout == format.disposition.mediaLayout) {
                            format.disposition.mediaLayout = layout
                        } content: {
                            Image(systemName: MessageCardExportSymbols.mediaLayout(layout)).font(.title3)
                        }
                    }
                }
            }
            if !styles.isEmpty {
                row {
                    ForEach(styles, id: \.self) { style in
                        tile(MessageCardExportText.audioStyleLabel(style), selected: style == format.disposition.audioStyle) {
                            format.disposition.audioStyle = style
                        } content: {
                            Image(systemName: MessageCardExportSymbols.audioStyle(style)).font(.title3)
                        }
                    }
                }
            }
        }
    }
}

/// La toile d'un format, dessinée à son rapport — l'adaptatif montre sa hauteur qui s'étire.
struct MessageCardAspectGlyph: View {
    let aspect: MessageCardAspect

    var body: some View {
        let height = aspect.fixedHeight ?? 1500
        let ratio = CGFloat(aspect.width / height)
        let side: CGFloat = 32
        let size = ratio >= 1 ? CGSize(width: side, height: side / ratio) : CGSize(width: side * ratio, height: side)
        ZStack {
            RoundedRectangle(cornerRadius: 4, style: .continuous)
                .strokeBorder(Color.primary, style: StrokeStyle(lineWidth: 2, dash: aspect == .auto ? [3, 3] : []))
                .frame(width: size.width, height: size.height)
            if let ratio = aspect.ratio {
                Text(verbatim: ratio)
                    .font(.caption2.weight(.bold))
                    .minimumScaleFactor(0.6)
                    .lineLimit(1)
                    .frame(width: max(size.width, 30))
            }
        }
        .accessibilityHidden(true)
    }
}
