import Foundation

/// Un média posé dans son bloc — position RELATIVE au coin du bloc.
struct MessageCardMediaSlot {
    let media: MessageCardMedia
    let x: Double
    let y: Double
    let width: Double
    let height: Double
}

/// Un bloc de médias : les images (ou premières images) en haut, le son
/// dessous, et la transcription du son sous sa représentation (#8979).
struct MessageCardMediaBlock {
    /// Le décalage du bloc par rapport à la colonne de texte — un bloc agrandi
    /// au pincement déborde dans les marges, un bloc réduit se centre (#8979).
    let x: Double
    let width: Double
    /// L'échelle EFFECTIVE du bloc — celle du pincement, bornée à ce qui laisse
    /// sa place minimale au texte (revue #8979).
    let scale: Double
    let slots: [MessageCardMediaSlot]
    let audio: MessageCardMedia?
    let audioStyle: MessageCardAudioStyle
    let audioTop: Double
    let audioHeight: Double
    let transcript: MessageCardTranscriptBlock?
    let transcriptTop: Double
    let height: Double

    /// La hauteur de la zone « Médias » — la transcription a la sienne.
    var mediaHeight: Double { transcript == nil ? height : audioTop + audioHeight }
}

/// **OÙ VONT LES MÉDIAS** (#8692) — au-dessus ou au-dessous de la réponse, en
/// mosaïque, ou la première image en fond. À l'échelle 1, un visuel ne dépasse
/// pas `visualShare` du budget ; agrandi au pincement, le bloc ne prend JAMAIS
/// la place minimale du texte — le moteur borne son échelle (`mediaScaleLimit`,
/// revue #8979) : le texte garde toujours de quoi se lire.
struct MessageCardMediaPlan {
    let above: MessageCardMediaBlock?
    let below: MessageCardMediaBlock?
    let backdrop: MessageCardMedia?

    static let visualShare: Double = 0.42
    static let gap: Double = 16
    static let mosaicLimit = 4
    /// Ce qu'un bloc agrandi laisse au bord de la carte.
    static let bleed: Double = 24

    /// La hauteur de la REPRÉSENTATION d'un son, minuteur compris, à l'échelle 1.
    static func audioHeight(_ style: MessageCardAudioStyle, timer: Bool = true) -> Double {
        switch style {
        case .wave: return MessageCardAudioMetrics.waveArea + (timer ? MessageCardAudioMetrics.clockRow : 0)
        case .pill: return 128
        case .spectrum: return MessageCardAudioMetrics.spectrumArea + (timer ? MessageCardAudioMetrics.clockRow : 0)
        case .ticket: return 150
        }
    }

    fileprivate static func single(_ media: MessageCardMedia, width: Double, cap: Double) -> MessageCardMediaSlot {
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
}

extension MessageCardLayoutEngine {

    /// Le plan des médias de la carte, à l'échelle `scale` et avec au plus
    /// `transcriptLines` lignes de transcription (0 : masquée) — le moteur
    /// règle les deux pour que la carte tienne (revue #8979).
    func mediaPlan(columnWidth width: Double, canvasWidth: Double, budget: Double, scale: Double, transcriptLines: Int) -> MessageCardMediaPlan {
        let disposition = input.disposition
        let blockWidth = min(canvasWidth - 2 * MessageCardMediaPlan.bleed, (width * scale).rounded())
        let offset = ((width - blockWidth) / 2).rounded()
        let visuals = input.media.filter { $0.kind.isVisual }
        let audio = input.media.first { $0.kind == .audio }
        let cap = max(160, budget * MessageCardMediaPlan.visualShare) * scale
        let block: ([MessageCardMediaSlot]) -> MessageCardMediaBlock? = { slots in
            mediaBlock(slots: slots, audio: audio, x: offset, width: blockWidth, columnWidth: width, scale: scale, transcriptLines: transcriptLines)
        }
        switch disposition.mediaLayout {
        case .backdrop:
            return MessageCardMediaPlan(above: block([]), below: nil, backdrop: visuals.first)
        case .mosaic:
            let slots = MessageCardMediaPlan.mosaic(Array(visuals.prefix(MessageCardMediaPlan.mosaicLimit)), width: blockWidth, cap: cap)
            return MessageCardMediaPlan(above: block(slots), below: nil, backdrop: nil)
        case .above, .below:
            let placed = block(visuals.first.map { [MessageCardMediaPlan.single($0, width: blockWidth, cap: cap)] } ?? [])
            return MessageCardMediaPlan(
                above: disposition.mediaLayout == .above ? placed : nil,
                below: disposition.mediaLayout == .below ? placed : nil,
                backdrop: nil
            )
        }
    }

    private func mediaBlock(slots: [MessageCardMediaSlot], audio: MessageCardMedia?, x: Double, width: Double, columnWidth: Double,
                            scale: Double, transcriptLines: Int) -> MessageCardMediaBlock? {
        guard !slots.isEmpty || audio != nil else { return nil }
        let style = input.disposition.audioStyle
        let visualHeight = slots.map { $0.y + $0.height }.max() ?? 0
        let audioTop = visualHeight > 0 && audio != nil ? visualHeight + MessageCardMediaPlan.gap * 1.5 : visualHeight
        let audioHeight = audio == nil ? 0 : (MessageCardMediaPlan.audioHeight(style, timer: input.disposition.showsTimer) * scale).rounded()
        let transcript = transcriptLines > 0 ? audio.flatMap { transcriptBlock(for: $0, width: columnWidth, lines: transcriptLines) } : nil
        let transcriptTop = audioTop + audioHeight + (transcript == nil ? 0 : MessageCardAudioMetrics.transcriptGap)
        return MessageCardMediaBlock(
            x: x, width: width, scale: scale, slots: slots, audio: audio, audioStyle: style,
            audioTop: audioTop, audioHeight: audioHeight,
            transcript: transcript, transcriptTop: transcriptTop,
            height: transcript.map { transcriptTop + $0.height } ?? audioTop + audioHeight
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

    static let white = MessageCardColor.hex("#FFFFFF")
    private static let shade = MessageCardColor.rgba(0, 0, 0, 0.45)

    /// Les opérations d'un bloc de médias posé en (x, y) — `x` est le bord de la colonne de texte.
    func mediaOps(_ block: MessageCardMediaBlock, x: Double, y: Double, width: Double) -> [MessageCardOp] {
        let left = x + block.x
        var ops: [MessageCardOp] = block.slots.flatMap { slot -> [MessageCardOp] in
            let frame = (x: left + slot.x, y: y + slot.y)
            var painted: [MessageCardOp] = [.media(MessageCardMediaOp(
                mediaID: slot.media.id, kind: slot.media.kind,
                x: frame.x, y: frame.y, width: slot.width, height: slot.height,
                radius: MessageCardMetrics.mediaRadius, placeholder: palette.quotePanel
            ))]
            // Une vidéo FIXE dit qu'elle est une vidéo ; animée, elle se lit d'elle-même.
            if slot.media.kind == .video && input.time == nil {
                let radius = min(64, min(slot.width, slot.height) * 0.14)
                let center = (x: frame.x + slot.width / 2, y: frame.y + slot.height / 2)
                painted.append(.dot(MessageCardDotOp(x: center.x, y: center.y, radius: radius, color: Self.shade)))
                painted.append(.glyph(MessageCardGlyphOp(glyph: .play, x: center.x, y: center.y, size: radius * 0.9, color: Self.white)))
            }
            return painted
        }
        if let audio = block.audio {
            ops.append(contentsOf: audioOps(audio, style: block.audioStyle, x: left, y: y + block.audioTop, width: block.width, height: block.audioHeight, scale: block.scale))
        }
        if let transcript = block.transcript {
            ops.append(contentsOf: transcriptOps(transcript, x: x, y: y + block.transcriptTop, width: width))
        }
        return ops
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
        let scale = input.disposition.scales[.header]
        switch input.disposition.headerOrientation {
        case .horizontal:
            return []
        case .stacked:
            let titleFont = MessageCardFont(face: .system(800), size: 30 * scale)
            let dateFont = MessageCardFont(face: .system(500), size: 24 * scale)
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
            let font = MessageCardFont(face: .system(700), size: 32 * scale)
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
