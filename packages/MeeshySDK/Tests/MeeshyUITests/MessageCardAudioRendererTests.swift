import Testing
import Foundation
import UIKit
import MeeshySDK
@testable import MeeshyUI

/// **Imager un vocal, en pixels** (#8979) — la carte PEINTE distingue l'onde
/// (une enveloppe en miroir autour de sa ligne médiane) du spectre (des barres
/// posées sur une ligne de base), et une image de la vidéo SURLIGNE la phrase
/// en cours de sa transcription.
struct MessageCardAudioRendererTests {

    private static let template = MessageCardTemplateID(palette: .minuit, typeface: .systeme, link: .silence)

    private static let transcript = MessageCardTranscript(text: nil, segments: [
        .init(text: "Bonjour à tous.", start: 0, end: 3),
        .init(text: "On se retrouve demain à la gare.", start: 3, end: 6),
        .init(text: "Prenez vos billets.", start: 6, end: 9),
    ])

    private static func input(style: MessageCardAudioStyle, transcript: MessageCardTranscript? = nil, clip: MessageCardClip? = nil, time: Double? = nil) -> MessageCardInput {
        let samples = (0..<180).map { 0.35 + 0.6 * abs(sin(Double($0) * 0.21)) }
        return MessageCardInput(
            quoted: nil,
            reply: MessageCardPart(author: "Awa", text: "Écoute ça"),
            template: template,
            handle: "awa",
            media: [MessageCardMedia(id: "a1", kind: .audio, duration: 9, samples: samples, transcript: transcript)],
            disposition: MessageCardDisposition(audioStyle: style, showsTimer: false),
            clip: clip,
            time: time
        )
    }

    /// Les pixels RGBA d'une carte peinte.
    private static func pixels(_ card: MessageCardImage) throws -> (bytes: [UInt8], width: Int, height: Int) {
        let image = try #require(UIImage(data: card.png)?.cgImage)
        let width = image.width
        let height = image.height
        var bytes = [UInt8](repeating: 0, count: width * height * 4)
        bytes.withUnsafeMutableBytes { buffer in
            guard let context = CGContext(
                data: buffer.baseAddress, width: width, height: height, bitsPerComponent: 8, bytesPerRow: width * 4,
                space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
            ) else { return }
            context.draw(image, in: CGRect(x: 0, y: 0, width: width, height: height))
        }
        return (bytes, width, height)
    }

    /// Les pixels d'une zone proches d'une couleur, colonne par colonne : la plus haute et la plus basse ligne touchées.
    private static func columns(_ card: MessageCardImage, in zone: MessageCardRegion, near color: MessageCardColor, tolerance: Int = 60) throws -> [Int: (top: Int, bottom: Int, count: Int)] {
        try columns(card, in: zone, near: color, tolerance: tolerance, keepingRows: false).columns
    }

    private static func columns(_ card: MessageCardImage, in zone: MessageCardRegion, near color: MessageCardColor, tolerance: Int, keepingRows: Bool)
        throws -> (columns: [Int: (top: Int, bottom: Int, count: Int)], rowCounts: [Int: Int]) {
        let (bytes, width, height) = try pixels(card)
        let target = [color.red, color.green, color.blue].map { Int(($0 * 255).rounded()) }
        var columns: [Int: (top: Int, bottom: Int, count: Int)] = [:]
        var rowCounts: [Int: Int] = [:]
        for y in Int(zone.y)..<min(height, Int(zone.y + zone.height)) {
            for x in max(0, Int(zone.x))..<min(width, Int(zone.x + zone.width)) {
                let index = (y * width + x) * 4
                let distance = abs(Int(bytes[index]) - target[0]) + abs(Int(bytes[index + 1]) - target[1]) + abs(Int(bytes[index + 2]) - target[2])
                guard distance < tolerance else { continue }
                let seen = columns[x]
                columns[x] = (min(seen?.top ?? y, y), max(seen?.bottom ?? y, y), (seen?.count ?? 0) + 1)
                if keepingRows { rowCounts[y, default: 0] += 1 }
            }
        }
        return (columns, rowCounts)
    }

    /// Combien de pixels proches d'une couleur, rangée par rangée.
    private static func rows(_ card: MessageCardImage, in zone: MessageCardRegion, near color: MessageCardColor, tolerance: Int) throws -> [Int: Int] {
        var rows: [Int: Int] = [:]
        for column in try columns(card, in: zone, near: color, tolerance: tolerance, keepingRows: true).rowCounts {
            rows[column.key, default: 0] += column.value
        }
        return rows
    }

    @Test func render_theWaveIsMirrored_theSpectrumStandsOnItsBaseline() throws {
        let accent = Self.template.palette.palette.accent
        let wave = try #require(MessageCardRenderer.render(Self.input(style: .wave)))
        let waveZone = try #require(wave.regions.first { $0.part == .media })
        let waveColumns = try Self.columns(wave, in: waveZone, near: accent).values.filter { $0.count >= 6 }
        #expect(waveColumns.count > 200, "\(waveColumns.count) colonnes d'onde")
        let middles = waveColumns.map { Double($0.top + $0.bottom) / 2 }.sorted()
        let midline = middles[middles.count / 2]
        let offCenter = middles.filter { abs($0 - midline) > 2 }
        #expect(Double(offCenter.count) / Double(middles.count) < 0.05, "l'onde se reflète autour d'UNE ligne médiane (\(midline)) : \(offCenter.prefix(12))")
        let waveBottoms = Set(waveColumns.map(\.bottom))
        #expect(waveBottoms.count > 10, "le bas d'une onde suit son volume")

        let spectrum = try #require(MessageCardRenderer.render(Self.input(style: .spectrum)))
        let spectrumZone = try #require(spectrum.regions.first { $0.part == .media })
        let spectrumColumns = try Self.columns(spectrum, in: spectrumZone, near: accent).values.filter { $0.count >= 6 }
        #expect(spectrumColumns.count > 200, "\(spectrumColumns.count) colonnes de spectre")
        let floor = spectrumColumns.map(\.bottom).max() ?? 0
        let standing = spectrumColumns.filter { abs($0.bottom - floor) <= 3 }
        #expect(Double(standing.count) / Double(spectrumColumns.count) > 0.9, "les barres se POSENT sur une ligne de base")
        let tops = Set(spectrumColumns.map { $0.top / 4 })
        #expect(tops.count > 5, "chaque bande a sa hauteur")
    }

    @Test func frame_highlightsThePhraseBeingSaid() throws {
        let clip = MessageCardClip(start: 0, duration: 9)
        let still = try #require(MessageCardRenderer.render(Self.input(style: .wave, transcript: Self.transcript, clip: clip)))
        let zone = try #require(still.regions.first { $0.part == .transcript })
        let moving = try #require(MessageCardRenderer.render(Self.input(style: .wave, transcript: Self.transcript, clip: clip, time: 4)))
        let accent = Self.template.palette.palette.accent
        // L'accent à 26 % sur le fond nuit de la palette.
        let tint = MessageCardColor(
            red: accent.red * 0.26 + 0x0E / 255.0 * 0.74, green: accent.green * 0.26 + 0x14 / 255.0 * 0.74,
            blue: accent.blue * 0.26 + 0x24 / 255.0 * 0.74
        )
        let highlighted = try Self.rows(moving, in: zone, near: tint, tolerance: 45)
        let plain = try Self.rows(still, in: zone, near: tint, tolerance: 45)
        let total = { (rows: [Int: Int]) in rows.values.reduce(0, +) }
        #expect(total(highlighted) > total(plain) + 2_000, "la phrase dite est surlignée : \(total(highlighted)) contre \(total(plain))")
        // Le surlignage couvre des RANGÉES entières de la phrase — un bord de lettre n'en couvre jamais autant.
        let band = highlighted.filter { $0.value > 200 }.keys.sorted()
        let lit = try #require(band.first)
        #expect(lit > Int(zone.y + zone.height / 3) - 5, "à 4 s, c'est la DEUXIÈME phrase qui se surligne : rangées \(band.first ?? 0)…\(band.last ?? 0), zone \(zone.y)")
    }
}
