import Foundation

/// Les mesures de la représentation d'un son, à l'échelle 1, en pixels de la carte.
enum MessageCardAudioMetrics {
    /// La bande de l'onde — une enveloppe en miroir autour de sa ligne médiane.
    static let waveArea: Double = 116
    /// La hauteur des barres du spectre, repères de crête compris.
    static let spectrumArea: Double = 156
    /// La ligne du minuteur, sous l'onde ou le spectre.
    static let clockRow: Double = 46
    static let clockSize: Double = 28
    /// Le pas d'une barre de l'onde : fine et DENSE.
    static let waveStep: Double = 7
    /// Le spectre : un égaliseur d'une vingtaine de bandes.
    static let spectrumBands = 24
    static let transcriptSize: Double = 36
    static let transcriptLeading: Double = 1.34
    /// Les lignes de transcription visibles — les premières sur une image, une fenêtre qui défile en vidéo.
    static let transcriptLines = 3
    static let transcriptGap: Double = 26
}

/// La transcription posée sous la représentation d'un son (#8979) : ses
/// phrases (celles de l'extrait), coupées en lignes à la largeur de la
/// colonne. Sa hauteur ne dépend PAS de l'instant — une carte animée garde sa
/// taille d'une image à l'autre.
struct MessageCardTranscriptBlock {
    struct Line {
        let text: String
        /// La phrase dont la ligne est tirée — un index dans `cues`.
        let cue: Int
    }

    let font: MessageCardFont
    let lineHeight: Double
    let lines: [Line]
    let cues: [AudioTranscriptCue]
    let visible: Int

    var height: Double { Double(visible) * lineHeight }
}

/// Ce qu'une représentation de son sait de l'instant : l'extrait, le temps
/// écoulé, la tête de lecture et les amplitudes de l'extrait.
private struct MessageCardSoundMoment {
    let clip: MessageCardClip?
    let length: Double?
    let elapsed: Double?
    let samples: [Double]
    let seed: String

    /// La part jouée (0…1) — `nil` sur une image fixe, où tout se montre.
    var progress: Double? {
        guard let elapsed else { return nil }
        guard let length, length > 0 else { return 1 }
        return min(1, elapsed / length)
    }

    /// Les amplitudes ramenées à `count` valeurs — une onde stable quand le son n'a pas été lu.
    func levels(_ count: Int) -> [Double] {
        samples.isEmpty ? MessageCardMedia.syntheticSamples(seed: seed, count: count) : MessageCardMedia.resample(samples, count: count)
    }

    /// Le son à grain fin — la matière du spectre qui danse.
    var dense: [Double] {
        let count = max(64, Int(((length ?? 5) * 12).rounded()))
        return samples.count >= count / 2 ? samples : levels(count)
    }
}

extension MessageCardLayoutEngine {

    // MARK: - Transcription

    /// La transcription d'un son, coupée en lignes — `nil` quand elle est
    /// masquée, absente, ou muette sur l'extrait.
    func transcriptBlock(for audio: MessageCardMedia, width: Double) -> MessageCardTranscriptBlock? {
        guard input.disposition.showsTranscript, let transcript = audio.transcript else { return nil }
        let cues = transcript.cues(in: input.clip, soundDuration: audio.duration)
        let typeface = (input.disposition.transcriptTypeface ?? input.template.typeface).typeface
        let size = MessageCardAudioMetrics.transcriptSize * typeface.replyScale * input.disposition.scales[.transcript]
        let font = MessageCardFont(face: typeface.replyFace, size: size)
        let lines = cues.enumerated().flatMap { index, cue in
            MessageCardText.wrap(cue.text, maxWidth: width, font: font, measure: measure)
                .filter { !$0.isEmpty }
                .map { MessageCardTranscriptBlock.Line(text: $0, cue: index) }
        }
        guard !lines.isEmpty else { return nil }
        return MessageCardTranscriptBlock(
            font: font,
            lineHeight: messageCardRound(font.size * MessageCardAudioMetrics.transcriptLeading),
            lines: lines, cues: cues,
            visible: min(MessageCardAudioMetrics.transcriptLines, lines.count)
        )
    }

    /// **Le karaoké** : sur une image, les premières lignes ; en vidéo, la
    /// phrase en cours SURLIGNÉE et les lignes qui défilent pour la garder en
    /// vue — sous la ligne qui vient d'être dite, quand elle tient dans le reste.
    func transcriptOps(_ block: MessageCardTranscriptBlock, x: Double, y: Double, width: Double) -> [MessageCardOp] {
        let now = input.time.map { (input.clip?.start ?? 0) + $0 }
        let active = now.flatMap { AudioTranscriptCue.activeIndex(in: block.cues, at: $0) }
        let reached = now.flatMap { time in block.cues.lastIndex { ($0.start ?? .infinity) <= time } }
        let current = active ?? reached
        let anchor = current.flatMap { cue in block.lines.firstIndex { $0.cue == cue } } ?? 0
        let spoken = current.map { cue in block.lines.filter { $0.cue == cue }.count } ?? 0
        let context = anchor > 0 && spoken < block.visible ? 1 : 0
        let first = max(0, min(anchor - context, block.lines.count - block.visible))
        var shown = Array(block.lines[first..<(first + block.visible)])
        if input.time == nil && block.lines.count > block.visible {
            // « …de partir… » plutôt que « …de partir.… » : l'ellipse remplace le point qu'elle suit.
            let cut = MessageCardText.truncate(block.lines.map(\.text), count: block.visible, maxWidth: width, font: block.font, measure: measure)
                .map { $0.hasSuffix(".…") ? String($0.dropLast(2)) + "…" : $0 }
            shown = zip(shown, cut).map { MessageCardTranscriptBlock.Line(text: $1, cue: $0.cue) }
        }
        var ops: [MessageCardOp] = []
        for (row, line) in shown.enumerated() {
            let direction = MessageCardText.direction(of: block.cues[line.cue].text)
            let baseline = y + Double(row) * block.lineHeight + messageCardRound(block.font.size)
            let start = direction == .rtl ? x + width : x
            let lit = line.cue == active
            if lit {
                let pad = block.font.size * 0.3
                let length = min(width, measure(line.text, block.font))
                ops.append(.panel(MessageCardRectOp(
                    x: (direction == .rtl ? start - length : start) - pad, y: baseline - block.font.size * 0.98,
                    width: length + 2 * pad, height: block.font.size * 1.32,
                    radius: block.font.size * 0.3, color: palette.accent.withAlpha(0.26)
                )))
            }
            ops.append(.text(MessageCardTextOp(
                text: line.text, x: start, y: baseline, font: block.font,
                color: lit ? palette.replyInk : palette.quoteInk,
                align: direction == .rtl ? .right : .left, direction: direction
            )))
        }
        return ops
    }

    // MARK: - Représentation

    /// La REPRÉSENTATION d'un son — onde, pastille, spectre ou fiche — à
    /// l'échelle `scale`. Animée, elle suit le VRAI temps écoulé de l'extrait :
    /// les barres jouées s'allument, le minuteur dit « 0:12 / 0:45 », le spectre danse.
    func audioOps(_ audio: MessageCardMedia, style: MessageCardAudioStyle, x: Double, y: Double, width: Double, height: Double, scale: Double) -> [MessageCardOp] {
        let length = input.clip?.duration ?? audio.duration
        let moment = MessageCardSoundMoment(
            clip: input.clip, length: length, elapsed: input.time,
            samples: audio.samples(in: input.clip), seed: audio.id
        )
        let clock = clockText(elapsed: input.time, length: length)
        switch style {
        case .wave: return waveOps(moment, clock: clock, x: x, y: y, width: width, scale: scale)
        case .spectrum: return spectrumOps(moment, clock: clock, x: x, y: y, width: width, scale: scale)
        case .pill: return pillOps(moment, clock: clock, x: x, y: y, width: width, height: height, scale: scale)
        case .ticket: return ticketOps(audio, clock: clock, x: x, y: y, width: width, height: height, scale: scale)
        }
    }

    /// Le minuteur : « 0:12 / 0:45 » en vidéo, la durée sur une image — rien s'il est masqué.
    private func clockText(elapsed: Double?, length: Double?) -> String? {
        guard input.disposition.showsTimer else { return nil }
        guard let elapsed else { return length.map(MessageCardMedia.clock) }
        let now = MessageCardMedia.clock(min(elapsed, length ?? elapsed))
        return length.map { "\(now) / \(MessageCardMedia.clock($0))" } ?? now
    }

    private func label(_ text: String, x: Double, baseline: Double, size: Double, align: MessageCardAlignment, color: MessageCardColor) -> MessageCardOp {
        .text(MessageCardTextOp(text: text, x: x, y: baseline, font: MessageCardFont(face: .system(600), size: size), color: color, align: align, direction: .ltr))
    }

    /// L'ONDE : une enveloppe fine et dense, en miroir autour de sa ligne médiane ; la partie jouée en couleur.
    private func waveOps(_ moment: MessageCardSoundMoment, clock: String?, x: Double, y: Double, width: Double, scale: Double) -> [MessageCardOp] {
        let area = MessageCardAudioMetrics.waveArea * scale
        let count = max(24, Int(width / (MessageCardAudioMetrics.waveStep * scale)))
        let step = width / Double(count)
        let barWidth = max(2, step * 0.42)
        let mid = y + area / 2
        let faded = palette.accent.withAlpha(0.3)
        var ops: [MessageCardOp] = moment.levels(count).enumerated().map { index, level in
            let barHeight = max(3 * scale, level * area)
            let played = moment.progress.map { Double(index) / Double(count) < $0 } ?? true
            return .bar(MessageCardRectOp(
                x: x + step * Double(index) + (step - barWidth) / 2, y: mid - barHeight / 2,
                width: barWidth, height: barHeight, radius: barWidth / 2,
                color: played ? palette.accent : faded
            ))
        }
        if let clock {
            ops.append(label(clock, x: x, baseline: y + area + MessageCardAudioMetrics.clockRow * 0.78 * scale,
                             size: MessageCardAudioMetrics.clockSize * scale, align: .left, color: palette.quoteInk))
        }
        return ops
    }

    /// LE SPECTRE : un égaliseur — des barres posées sur une ligne de base, chacune
    /// sous son repère de crête. Animé, il danse avec l'énergie du son autour de
    /// la tête de lecture ; la ligne de base se colore à mesure de la lecture.
    private func spectrumOps(_ moment: MessageCardSoundMoment, clock: String?, x: Double, y: Double, width: Double, scale: Double) -> [MessageCardOp] {
        let bands = MessageCardAudioMetrics.spectrumBands
        let area = MessageCardAudioMetrics.spectrumArea * scale
        let capHeight = 6 * scale
        let headroom = capHeight + 10 * scale
        let baseline = y + area - 8 * scale
        let tallest = baseline - y - headroom
        let step = width / Double(bands)
        let barWidth = step * 0.64
        let dense = moment.dense
        let position = MessageCardSpectrum.position(progress: moment.progress, in: dense)
        let hop = max(1, Double(dense.count) / max(1, moment.length ?? 5) * 0.1)
        var ops: [MessageCardOp] = []
        for band in 0..<bands {
            let level = MessageCardSpectrum.level(band: band, of: bands, at: position, in: dense)
            let crest = (0..<6).map { MessageCardSpectrum.level(band: band, of: bands, at: position - Double($0) * hop, in: dense) - Double($0) * 0.035 }.max() ?? level
            let left = x + step * Double(band) + (step - barWidth) / 2
            let barHeight = max(4 * scale, level * tallest)
            ops.append(.bar(MessageCardRectOp(x: left, y: baseline - barHeight, width: barWidth, height: barHeight,
                                              radius: min(barWidth / 2, 6 * scale), color: palette.accent)))
            let peak = max(level, crest) * tallest
            ops.append(.bar(MessageCardRectOp(x: left, y: baseline - peak - headroom + capHeight / 2, width: barWidth, height: capHeight,
                                              radius: capHeight / 2, color: palette.replyInk)))
        }
        let rule = 4 * scale
        ops.append(.bar(MessageCardRectOp(x: x, y: baseline + 4 * scale, width: width, height: rule, radius: rule / 2, color: palette.accent.withAlpha(0.3))))
        if let progress = moment.progress, progress > 0 {
            ops.append(.bar(MessageCardRectOp(x: x, y: baseline + 4 * scale, width: max(rule, width * progress), height: rule, radius: rule / 2, color: palette.accent)))
        }
        if let clock {
            ops.append(label(clock, x: x + width / 2, baseline: y + area + MessageCardAudioMetrics.clockRow * 0.78 * scale,
                             size: MessageCardAudioMetrics.clockSize * scale, align: .center, color: palette.quoteInk))
        }
        return ops
    }

    /// LA PASTILLE : le bouton de lecture, une onde fine et le minuteur.
    private func pillOps(_ moment: MessageCardSoundMoment, clock: String?, x: Double, y: Double, width: Double, height: Double, scale: Double) -> [MessageCardOp] {
        let radius = height * 0.34
        let center = (x: x + height / 2, y: y + height / 2)
        let clockSize = 30 * scale
        let clockWidth = clock.map { measure($0, MessageCardFont(face: .system(600), size: clockSize)) } ?? 0
        let right = x + width - height * 0.36
        let barsEnd = clock == nil ? right : right - clockWidth - 24 * scale
        var ops: [MessageCardOp] = [
            .panel(MessageCardRectOp(x: x, y: y, width: width, height: height, radius: height / 2, color: palette.replyPanel)),
            .dot(MessageCardDotOp(x: center.x, y: center.y, radius: radius, color: palette.accent)),
            .glyph(MessageCardGlyphOp(glyph: .play, x: center.x, y: center.y, size: radius * 0.95, color: Self.white)),
        ]
        let left = x + height + 8 * scale
        let count = 32
        let step = max(1, barsEnd - left) / Double(count)
        let barWidth = max(3, step * 0.56)
        let faded = palette.accent.withAlpha(0.35)
        ops.append(contentsOf: moment.levels(count).enumerated().map { index, level -> MessageCardOp in
            let barHeight = max(8 * scale, level * height * 0.5)
            let played = moment.progress.map { Double(index) / Double(count) < $0 } ?? true
            return .bar(MessageCardRectOp(
                x: left + step * Double(index) + (step - barWidth) / 2, y: center.y - barHeight / 2,
                width: barWidth, height: barHeight, radius: barWidth / 2, color: played ? palette.accent : faded
            ))
        })
        if let clock { ops.append(label(clock, x: right, baseline: center.y + 11 * scale, size: clockSize, align: .right, color: palette.replyInk)) }
        return ops
    }

    /// LA FICHE : le nom du fichier et le minuteur, sous une icône de note.
    private func ticketOps(_ audio: MessageCardMedia, clock: String?, x: Double, y: Double, width: Double, height: Double, scale: Double) -> [MessageCardOp] {
        let radius = min(46 * scale, height * 0.3)
        let center = (x: x + 36 * scale + radius, y: y + height / 2)
        let textX = center.x + radius + 28 * scale
        let nameFont = MessageCardFont(face: .system(700), size: 34 * scale)
        var ops: [MessageCardOp] = [
            .panel(MessageCardRectOp(x: x, y: y, width: width, height: height, radius: 32 * scale, color: palette.replyPanel)),
            .dot(MessageCardDotOp(x: center.x, y: center.y, radius: radius, color: palette.accent)),
            .glyph(MessageCardGlyphOp(glyph: .note, x: center.x, y: center.y, size: radius * 1.05, color: Self.white)),
        ]
        let room = x + width - 32 * scale - textX
        if let name = audio.name {
            let line = MessageCardText.truncate(MessageCardText.wrap(name, maxWidth: room, font: nameFont, measure: measure), count: 1, maxWidth: room, font: nameFont, measure: measure).first ?? name
            let baseline = clock == nil ? center.y + 12 * scale : center.y - 4 * scale
            ops.append(.text(MessageCardTextOp(text: line, x: textX, y: baseline, font: nameFont, color: palette.replyInk, align: .left, direction: MessageCardText.direction(of: line))))
            if let clock { ops.append(label(clock, x: textX, baseline: center.y + 36 * scale, size: 26 * scale, align: .left, color: palette.quoteInk)) }
        } else if let clock {
            ops.append(label(clock, x: textX, baseline: center.y + 12 * scale, size: 34 * scale, align: .left, color: palette.replyInk))
        }
        return ops
    }
}

/// **L'ÉGALISEUR** (#8979) — des bandes qui ne sont pas des fréquences (la
/// carte n'a que l'enveloppe du son) mais qui en ont l'allure : chaque bande a
/// son gain, les graves portent plus haut que les aigus, et toutes suivent
/// l'énergie du son autour de la tête de lecture — chacune un peu plus tôt ou
/// un peu plus tard que sa voisine, ce qui les fait danser.
enum MessageCardSpectrum {

    /// Où lire le son : la tête de lecture en vidéo ; sur une image, l'instant le plus fort.
    static func position(progress: Double?, in samples: [Double]) -> Double {
        guard samples.count > 1 else { return 0 }
        if let progress { return progress * Double(samples.count - 1) }
        let loudest = samples.indices.max { energy(at: Double($0), in: samples) < energy(at: Double($1), in: samples) } ?? 0
        return Double(loudest)
    }

    /// La hauteur (0…1) de la bande `band` à la position `position` du son.
    static func level(band: Int, of bands: Int, at position: Double, in samples: [Double]) -> Double {
        guard !samples.isEmpty else { return 0.1 }
        let spread = max(2, Double(samples.count) / 40)
        let offset = (Double(band) - Double(bands - 1) / 2) / Double(bands) * spread
        let local = sample(at: position + offset, in: samples)
        let tilt = 1 - 0.38 * Double(band) / Double(max(1, bands - 1))
        let raw = (0.45 * energy(at: position, in: samples) + 0.55 * local) * gain(band) * tilt * 1.35
        return min(1, max(0.06, raw))
    }

    /// Le gain propre à une bande — stable, et différent de sa voisine.
    private static func gain(_ band: Int) -> Double {
        let hashed = (band &* 2_654_435_761 &+ 977) % 1000
        return 0.62 + 0.38 * Double(hashed) / 1000
    }

    /// L'énergie moyenne du son autour de `position`.
    private static func energy(at position: Double, in samples: [Double]) -> Double {
        let radius = max(1, samples.count / 60)
        let center = Int(position.rounded())
        let window = (center - radius...center + radius).map { samples[min(samples.count - 1, max(0, $0))] }
        return window.reduce(0, +) / Double(window.count)
    }

    /// L'amplitude à une position fractionnaire, interpolée — bornée au son.
    private static func sample(at position: Double, in samples: [Double]) -> Double {
        let clamped = min(Double(samples.count - 1), max(0, position))
        let lower = Int(clamped.rounded(.down))
        let upper = min(samples.count - 1, lower + 1)
        let fraction = clamped - Double(lower)
        return samples[lower] * (1 - fraction) + samples[upper] * fraction
    }
}

extension MessageCardColor {
    /// La même couleur, à `alpha` de son opacité.
    func withAlpha(_ alpha: Double) -> MessageCardColor {
        MessageCardColor(red: red, green: green, blue: blue, alpha: self.alpha * alpha)
    }
}
