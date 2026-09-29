import Foundation

/// Un média posé dans son bloc — position RELATIVE au coin du bloc.
struct MessageCardMediaSlot {
    let media: MessageCardMedia
    let x: Double
    let y: Double
    let width: Double
    let height: Double
}

/// Un bloc de médias : les images (ou premières images) en haut, le son dessous.
struct MessageCardMediaBlock {
    let slots: [MessageCardMediaSlot]
    let audio: MessageCardMedia?
    let audioStyle: MessageCardAudioStyle
    let audioTop: Double
    let audioHeight: Double
    let height: Double
}

/// **OÙ VONT LES MÉDIAS** (#8692) — au-dessus ou au-dessous de la réponse, en
/// mosaïque, ou la première image en fond. Aucun média ne dépasse
/// `visualShare` du budget : le texte garde toujours de quoi se lire.
struct MessageCardMediaPlan {
    let above: MessageCardMediaBlock?
    let below: MessageCardMediaBlock?
    let backdrop: MessageCardMedia?

    static let visualShare: Double = 0.42
    static let gap: Double = 16
    static let mosaicLimit = 4

    static func audioHeight(_ style: MessageCardAudioStyle) -> Double {
        switch style {
        case .wave: return 150
        case .pill: return 128
        case .spectrum: return 180
        case .ticket: return 150
        }
    }

    static func of(_ media: [MessageCardMedia], layout: MessageCardMediaLayout, audioStyle: MessageCardAudioStyle, width: Double, budget: Double) -> MessageCardMediaPlan {
        let visuals = media.filter { $0.kind.isVisual }
        let audio = media.first { $0.kind == .audio }
        let cap = max(160, budget * visualShare)
        switch layout {
        case .backdrop:
            return MessageCardMediaPlan(
                above: block(slots: [], audio: audio, style: audioStyle),
                below: nil,
                backdrop: visuals.first
            )
        case .mosaic:
            return MessageCardMediaPlan(
                above: block(slots: mosaic(Array(visuals.prefix(mosaicLimit)), width: width, cap: cap), audio: audio, style: audioStyle),
                below: nil,
                backdrop: nil
            )
        case .above, .below:
            let slots = visuals.first.map { [single($0, width: width, cap: cap)] } ?? []
            let placed = block(slots: slots, audio: audio, style: audioStyle)
            return MessageCardMediaPlan(
                above: layout == .above ? placed : nil,
                below: layout == .below ? placed : nil,
                backdrop: nil
            )
        }
    }

    private static func single(_ media: MessageCardMedia, width: Double, cap: Double) -> MessageCardMediaSlot {
        MessageCardMediaSlot(media: media, x: 0, y: 0, width: width, height: min(cap, (width / media.aspect).rounded()))
    }

    /// Une, deux, trois ou quatre images : une pleine largeur, deux côte à
    /// côte, deux puis une, ou deux par deux.
    static func mosaic(_ visuals: [MessageCardMedia], width: Double, cap: Double) -> [MessageCardMediaSlot] {
        guard visuals.count > 1 else { return visuals.first.map { [single($0, width: width, cap: cap)] } ?? [] }
        let half = ((width - gap) / 2).rounded(.down)
        let rows = Double((visuals.count + 1) / 2)
        let cell = min(half, ((cap - gap * (rows - 1)) / rows).rounded(.down))
        return visuals.enumerated().map { index, media in
            let row = Double(index / 2)
            let lastAlone = visuals.count % 2 == 1 && index == visuals.count - 1
            return MessageCardMediaSlot(
                media: media,
                x: lastAlone || index % 2 == 0 ? 0 : half + gap,
                y: row * (cell + gap),
                width: lastAlone ? width : half,
                height: cell
            )
        }
    }

    private static func block(slots: [MessageCardMediaSlot], audio: MessageCardMedia?, style: MessageCardAudioStyle) -> MessageCardMediaBlock? {
        guard !slots.isEmpty || audio != nil else { return nil }
        let visualHeight = slots.map { $0.y + $0.height }.max() ?? 0
        let audioTop = visualHeight > 0 ? visualHeight + gap * 1.5 : 0
        let audioHeight = audio == nil ? 0 : audioHeight(style)
        return MessageCardMediaBlock(
            slots: slots, audio: audio, audioStyle: style,
            audioTop: audioTop, audioHeight: audioHeight,
            height: audio == nil ? visualHeight : audioTop + audioHeight
        )
    }
}

/// Une lettre d'un en-tête écrit en colonne.
private struct Letter {
    let text: String
    let font: MessageCardFont
    let color: MessageCardColor
}

extension MessageCardLayoutEngine {

    private static let white = MessageCardColor.hex("#FFFFFF")
    private static let shade = MessageCardColor.rgba(0, 0, 0, 0.45)

    /// Les opérations d'un bloc de médias posé en (x, y).
    func mediaOps(_ block: MessageCardMediaBlock, x: Double, y: Double, width: Double) -> [MessageCardOp] {
        var ops: [MessageCardOp] = block.slots.flatMap { slot -> [MessageCardOp] in
            let frame = (x: x + slot.x, y: y + slot.y)
            var painted: [MessageCardOp] = [.media(MessageCardMediaOp(
                mediaID: slot.media.id, kind: slot.media.kind,
                x: frame.x, y: frame.y, width: slot.width, height: slot.height,
                radius: MessageCardMetrics.mediaRadius, placeholder: palette.quotePanel
            ))]
            // Une vidéo FIXE dit qu'elle est une vidéo ; animée, elle se lit d'elle-même.
            if slot.media.kind == .video && input.playhead == nil {
                let radius = min(64, min(slot.width, slot.height) * 0.14)
                let center = (x: frame.x + slot.width / 2, y: frame.y + slot.height / 2)
                painted.append(.dot(MessageCardDotOp(x: center.x, y: center.y, radius: radius, color: Self.shade)))
                painted.append(.glyph(MessageCardGlyphOp(glyph: .play, x: center.x, y: center.y, size: radius * 0.9, color: Self.white)))
            }
            return painted
        }
        if let audio = block.audio {
            ops.append(contentsOf: audioOps(audio, style: block.audioStyle, x: x, y: y + block.audioTop, width: width, height: block.audioHeight))
        }
        return ops
    }

    /// La REPRÉSENTATION d'un son — onde, pastille, spectre ou fiche. Animée,
    /// la tête de lecture allume les barres déjà jouées.
    func audioOps(_ audio: MessageCardMedia, style: MessageCardAudioStyle, x: Double, y: Double, width: Double, height: Double) -> [MessageCardOp] {
        let accent = palette.accent
        let faded = MessageCardColor(red: accent.red, green: accent.green, blue: accent.blue, alpha: accent.alpha * 0.35)
        let playhead = input.playhead
        let clock = audio.duration.map { duration in
            MessageCardMedia.clock(playhead.map { $0 * duration } ?? duration)
        }
        let samples: (Int) -> [Double] = { count in
            audio.samples.isEmpty
                ? MessageCardMedia.syntheticSamples(seed: audio.id, count: count)
                : MessageCardMedia.resample(audio.samples, count: count)
        }
        let played: (Int, Int) -> Bool = { index, count in
            guard let playhead else { return true }
            return Double(index) / Double(count) < playhead
        }
        let bars: (_ count: Int, _ left: Double, _ right: Double, _ mid: Double, _ area: Double, _ mirrored: Bool) -> [MessageCardOp] = { count, left, right, mid, area, mirrored in
            let step = (right - left) / Double(count)
            let barWidth = max(3, step * 0.56)
            return samples(count).enumerated().map { index, level in
                let barHeight = max(8, level * area * (mirrored ? 1 : 0.92))
                return .bar(MessageCardRectOp(
                    x: left + step * Double(index) + (step - barWidth) / 2,
                    y: mid - barHeight / 2,
                    width: barWidth, height: barHeight, radius: barWidth / 2,
                    color: played(index, count) ? accent : faded
                ))
            }
        }
        let label: (String, Double, Double, Double, MessageCardAlignment, MessageCardColor) -> MessageCardOp = { text, labelX, baseline, size, align, color in
            .text(MessageCardTextOp(text: text, x: labelX, y: baseline, font: MessageCardFont(face: .system(600), size: size), color: color, align: align, direction: .ltr))
        }

        switch style {
        case .wave:
            let area = height - 48
            var ops = bars(48, x, x + width, y + area / 2, area, false)
            if let clock { ops.append(label(clock, x, y + height - 8, 28, .left, palette.quoteInk)) }
            return ops
        case .pill:
            let radius = height * 0.34
            let center = (x: x + height / 2, y: y + height / 2)
            var ops: [MessageCardOp] = [
                .panel(MessageCardRectOp(x: x, y: y, width: width, height: height, radius: height / 2, color: palette.replyPanel)),
                .dot(MessageCardDotOp(x: center.x, y: center.y, radius: radius, color: accent)),
                .glyph(MessageCardGlyphOp(glyph: .play, x: center.x, y: center.y, size: radius * 0.95, color: Self.white)),
            ]
            ops.append(contentsOf: bars(32, x + height + 8, x + width - 150, center.y, height * 0.5, false))
            if let clock { ops.append(label(clock, x + width - height * 0.36, center.y + 11, 30, .right, palette.replyInk)) }
            return ops
        case .spectrum:
            let area = height - 44
            var ops = bars(40, x, x + width, y + area / 2, area, true)
            if let clock { ops.append(label(clock, x + width / 2, y + height - 4, 26, .center, palette.quoteInk)) }
            return ops
        case .ticket:
            let radius = min(46, height * 0.3)
            let center = (x: x + 36 + radius, y: y + height / 2)
            let textX = center.x + radius + 28
            let nameFont = MessageCardFont(face: .system(700), size: 34)
            var ops: [MessageCardOp] = [
                .panel(MessageCardRectOp(x: x, y: y, width: width, height: height, radius: 32, color: palette.replyPanel)),
                .dot(MessageCardDotOp(x: center.x, y: center.y, radius: radius, color: accent)),
                .glyph(MessageCardGlyphOp(glyph: .note, x: center.x, y: center.y, size: radius * 1.05, color: Self.white)),
            ]
            let room = x + width - 32 - textX
            if let name = audio.name {
                let line = MessageCardText.truncate(MessageCardText.wrap(name, maxWidth: room, font: nameFont, measure: measure), count: 1, maxWidth: room, font: nameFont, measure: measure).first ?? name
                ops.append(.text(MessageCardTextOp(text: line, x: textX, y: center.y - 4, font: nameFont, color: palette.replyInk, align: .left, direction: MessageCardText.direction(of: line))))
                if let clock { ops.append(label(clock, textX, center.y + 36, 26, .left, palette.quoteInk)) }
            } else if let clock {
                ops.append(label(clock, textX, center.y + 12, 34, .left, palette.replyInk))
            }
            return ops
        }
    }

    /// La première image EN FOND, sous un voile de la couleur de la palette :
    /// le texte reste lisible, et la carte garde sa teinte.
    func backdropOps(_ media: MessageCardMedia, width: Double, height: Double) -> [MessageCardOp] {
        let base = palette.background.first?.color ?? MessageCardColor.hex("#000000")
        let veil = MessageCardColor(red: base.red, green: base.green, blue: base.blue, alpha: palette.tone == .dark ? 0.6 : 0.72)
        return [
            .media(MessageCardMediaOp(mediaID: media.id, kind: media.kind, x: 0, y: 0, width: width, height: height, radius: 0, placeholder: base)),
            .panel(MessageCardRectOp(x: 0, y: 0, width: width, height: height, radius: 0, color: veil)),
        ]
    }

    /// L'en-tête en COLONNE : lettre à lettre de haut en bas, ou couché, qui
    /// se lit en montant (`rotatedUp`) ou en descendant (`rotatedDown`).
    func verticalHeaderOps(title: String?, date: String?, canvas: MessageCardCanvas, height: Double) -> [MessageCardOp] {
        let top = canvas.padY
        let room = height - 2 * canvas.padY
        let cx = canvas.padX + MessageCardMetrics.gutter / 2
        switch input.disposition.headerOrientation {
        case .horizontal:
            return []
        case .stacked:
            let titleFont = MessageCardFont(face: .system(800), size: 30)
            let dateFont = MessageCardFont(face: .system(500), size: 24)
            let titleLetters: [Letter] = title.map { Array($0).map { Letter(text: String($0), font: titleFont, color: palette.replyInk) } } ?? []
            let dateLetters: [Letter] = date.map { Array($0).map { Letter(text: String($0), font: dateFont, color: palette.quoteInk) } } ?? []
            let spacer: [Letter] = titleLetters.isEmpty || dateLetters.isEmpty ? [] : [Letter(text: " ", font: dateFont, color: palette.quoteInk)]
            let letters: [Letter] = titleLetters + spacer + dateLetters
            let step: (MessageCardFont) -> Double = { $0.size * 1.22 }
            var kept: [Letter] = []
            var used: Double = 0
            for letter in letters {
                guard used + step(letter.font) <= room else {
                    if let last = kept.last { kept[kept.count - 1] = Letter(text: "…", font: last.font, color: last.color) }
                    break
                }
                kept.append(letter)
                used += step(letter.font)
            }
            var cursor = top + max(0, (room - used) / 2)
            var ops: [MessageCardOp] = []
            for letter in kept {
                if !letter.text.trimmingCharacters(in: .whitespaces).isEmpty {
                    ops.append(.text(MessageCardTextOp(
                        text: letter.text, x: cx, y: cursor + letter.font.size * 0.9, font: letter.font, color: letter.color,
                        align: .center, direction: MessageCardText.direction(of: letter.text)
                    )))
                }
                cursor += step(letter.font)
            }
            return ops
        case .rotatedUp, .rotatedDown:
            let font = MessageCardFont(face: .system(700), size: 32)
            let whole = [title, date].compactMap { $0 }.joined(separator: " · ")
            let line = MessageCardText.truncate(MessageCardText.wrap(whole, maxWidth: room, font: font, measure: measure), count: 1, maxWidth: room, font: font, measure: measure).first ?? whole
            let length = min(room, measure(line, font))
            let up = input.disposition.headerOrientation == .rotatedUp
            return [.text(MessageCardTextOp(
                text: line, x: cx,
                y: up ? top + (room + length) / 2 : top + (room - length) / 2,
                font: font, color: palette.replyInk, align: .left,
                direction: MessageCardText.direction(of: line),
                rotation: up ? -Double.pi / 2 : Double.pi / 2
            ))]
        }
    }
}
