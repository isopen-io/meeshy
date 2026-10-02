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

    /// Le son de la carte — celui dont « Médias » règle la transcription, le minuteur et la durée (#8979).
    static func sound(_ media: [MessageCardMedia]) -> MessageCardMedia? {
        media.first { $0.kind == .audio }
    }

    /// La transcription ne se montre ou ne se masque que si le son en a une.
    static func offersTranscript(_ media: [MessageCardMedia]) -> Bool {
        sound(media)?.transcript != nil
    }

    /// Le minuteur se montre ou se masque pour tout son.
    static func offersTimer(_ media: [MessageCardMedia]) -> Bool {
        sound(media) != nil
    }

    /// La police de la transcription — le catalogue de l'onglet « Police » —
    /// ne se choisit que pour une transcription montrée.
    static func transcriptTypefaces(_ format: MessageCardFormat, media: [MessageCardMedia]) -> [MessageCardTypefaceID] {
        offersTranscript(media) && format.disposition.showsTranscript ? MessageCardTypefaceID.allCases : []
    }

    /// Les durées d'une VIDÉO tirée d'un son — celles que le son offre ; rien
    /// pour une image fixe, rien quand une vidéo jointe fixe elle-même la durée.
    static func clipLengths(output: MessageCardOutput, media: [MessageCardMedia]) -> [MessageCardClipLength] {
        guard output == .video, !media.contains(where: { $0.kind == .video }), let sound = sound(media) else { return [] }
        return MessageCardClipLength.offered(forSoundDuration: sound.duration)
    }

    /// Le passage à exporter se choisit quand la carte s'anime et que son média
    /// dure PLUS que l'extrait — sinon il part en entier, sans rien à choisir.
    static func excerpt(plan: MessageCardMotionPlan?, media: [MessageCardMedia]) -> MessageCardExcerpt? {
        guard let plan, let source = media.first(where: { $0.kind == .video }) ?? sound(media),
              let total = source.duration, total > plan.duration + 0.25 else { return nil }
        return MessageCardExcerpt(total: total, window: plan.clip, sound: source.kind == .audio ? source : nil)
    }
}

/// Le passage d'un son ou d'une vidéo que la carte animée emporte — ce que la bande d'extrait montre.
struct MessageCardExcerpt: Equatable {
    let total: Double
    let window: MessageCardClip
    /// Le son dont la bande montre l'onde — `nil` pour une vidéo, qui montre une règle.
    let sound: MessageCardMedia?

    /// Les hauteurs de la bande : l'onde du son entier (la même que la carte
    /// tant qu'il n'a pas été lu), une règle égale pour une vidéo.
    func levels(_ count: Int) -> [Double] {
        guard let sound else { return Array(repeating: 0.3, count: count) }
        return sound.samples.isEmpty
            ? MessageCardMedia.syntheticSamples(seed: sound.id, count: count)
            : MessageCardMedia.resample(sound.samples, count: count)
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
        return VStack(alignment: .leading, spacing: MeeshySpacing.sm) {
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

    /// « Médias » — où se posent les images, comment se représente un son, sa
    /// transcription, son minuteur, et — pour une vidéo — la durée et le passage (#8979).
    var mediaPanel: some View {
        let kinds = media.map(\.kind)
        let layouts = MessageCardTrayOffer.mediaLayouts(kinds)
        let styles = MessageCardTrayOffer.audioStyles(kinds)
        return VStack(alignment: .leading, spacing: MeeshySpacing.sm) {
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
            soundOptions
            clipOptions
        }
    }

    /// La transcription et le minuteur, puis la police de la transcription.
    @ViewBuilder
    private var soundOptions: some View {
        let typefaces = MessageCardTrayOffer.transcriptTypefaces(format, media: media)
        if MessageCardTrayOffer.offersTimer(media) {
            row {
                if MessageCardTrayOffer.offersTranscript(media) {
                    pill(MessageCardExportText.text("export.card.media.transcript", "Transcription"), selected: format.disposition.showsTranscript) {
                        format.disposition.showsTranscript.toggle()
                    }
                }
                pill(MessageCardExportText.text("export.card.media.timer", "Minuteur"), selected: format.disposition.showsTimer) {
                    format.disposition.showsTimer.toggle()
                }
                if !typefaces.isEmpty {
                    let current = format.disposition.transcriptTypeface ?? format.template.typeface
                    HStack(spacing: MeeshySpacing.xs) {
                        ForEach(typefaces, id: \.self) { typeface in
                            chip(MessageCardExportText.typefaceLabel(typeface), selected: typeface == current) {
                                format.disposition.transcriptTypeface = typeface
                            } content: {
                                Text(verbatim: "Aa").font(MessageCardFontStyle.font(typeface.typeface.replyFace, size: 18))
                            }
                        }
                    }
                    .accessibilityElement(children: .contain)
                    .accessibilityLabel(MessageCardExportText.text("export.card.media.transcriptFont", "Police de la transcription"))
                }
            }
        }
    }

    /// En vidéo : la durée, puis le passage qu'on fait glisser sur l'onde.
    @ViewBuilder
    private var clipOptions: some View {
        let lengths = MessageCardTrayOffer.clipLengths(output: output, media: media)
        let sound = MessageCardTrayOffer.sound(media)
        if !lengths.isEmpty {
            let selected = format.disposition.clipLength.selected(among: lengths, soundDuration: sound?.duration)
            row {
                ForEach(lengths, id: \.self) { length in
                    pill(MessageCardExportText.clipLabel(length), selected: length == selected) {
                        format.disposition.clipLength = length
                    }
                }
            }
            .accessibilityElement(children: .contain)
            .accessibilityLabel(MessageCardExportText.text("export.card.clip.label", "Durée de la vidéo"))
        }
        if let excerpt = MessageCardTrayOffer.excerpt(plan: plan, media: media) {
            MessageCardExcerptStrip(excerpt: excerpt, onMove: onExcerptStart)
                .padding(.horizontal, MeeshySpacing.lg)
        }
    }

    /// Une pastille carrée compacte — une police parmi d'autres, sans légende (VoiceOver la nomme).
    func chip<Content: View>(_ label: String, selected: Bool, action: @escaping () -> Void, @ViewBuilder content: () -> Content) -> some View {
        Button {
            HapticFeedback.light()
            action()
        } label: {
            content()
                .frame(width: MeeshyControlSize.tapTarget, height: MeeshyControlSize.tapTarget)
                .background(RoundedRectangle(cornerRadius: MeeshyRadius.smPlus, style: .continuous).fill(Color.primary.opacity(selected ? 0.14 : 0.06)))
                .overlay(
                    RoundedRectangle(cornerRadius: MeeshyRadius.smPlus, style: .continuous)
                        .strokeBorder(selected ? Color.primary : Color.clear, lineWidth: MeeshyBorder.strong)
                )
        }
        .buttonStyle(MessageCardPressStyle())
        .foregroundStyle(.primary)
        .accessibilityLabel(label)
        .accessibilityAddTraits(selected ? [.isSelected] : [])
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
            RoundedRectangle(cornerRadius: MeeshyRadius.xxs, style: .continuous)
                .strokeBorder(Color.primary, style: StrokeStyle(lineWidth: MeeshyBorder.strong, dash: aspect == .auto ? [3, 3] : []))
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
