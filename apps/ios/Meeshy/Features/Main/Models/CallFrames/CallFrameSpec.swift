import CoreGraphics
import Foundation
import MeeshySDK

/// **LE VOCABULAIRE DES CADRES DE CAPTURE** — le miroir Swift de
/// `apps/web/src/lib/calls/frames/frame-spec.ts`, contrat de
/// `docs/superpowers/specs/2026-09-29-cadres-de-capture-d-appel-design.md` § 4.
/// Un cadre est une DONNÉE : `CallFrameCatalogue+Generated.swift` la reçoit du JSON
/// partagé, `CallFrameRenderer` l'interprète. Les valeurs brutes sont celles du JSON.

nonisolated enum CallFrameMood: String, CaseIterable, Equatable, Sendable {
    case signature
    case distingue
    case elegant
    case jovial
    case deconnecte
    case corporate
    case fantastique
    case futuriste
    case glauque
    case horsNorme = "hors-norme"
    case morbide
    case feerique
}

nonisolated enum CallFrameBucket: String, CaseIterable, Equatable, Sendable {
    case duo
    case comite
    case groupe
    case tablee

    var people: ClosedRange<Int> {
        switch self {
        case .duo: return 2 ... 2
        case .comite: return 3 ... 4
        case .groupe: return 5 ... 6
        case .tablee: return 7 ... 12
        }
    }
}

nonisolated enum CallFrameArrangement: String, CaseIterable, Equatable, Sendable {
    case split
    case diagonal
    case hero
    case grid
    case row
    case column
    case arch
    case orbit
    case scatter
    case tiers
    case mosaic
    case honeycomb
    case cascade

    var isDuoOnly: Bool { self == .split || self == .diagonal }
}

nonisolated enum CallFrameSlotShape: String, CaseIterable, Equatable, Sendable {
    case rect
    case round
    case circle
    case oval
    case arch
    case hex
    case diamond
    case heart
    case star
    case ticket
    case stamp
    case blob
    case torn
    case polaroid
    case frameOval = "frame-oval"
}

nonisolated enum CallFrameTone: String, CaseIterable, Equatable, Sendable {
    case color
    case mono
    case sepia
    case noir
    case warm
    case cool
    case faded
    case duotone
}

nonisolated enum CallFrameTilt: String, CaseIterable, Equatable, Sendable {
    case none
    case gentle
    case wild

    var degrees: Double {
        switch self {
        case .none: return 0
        case .gentle: return 4
        case .wild: return 9
        }
    }
}

nonisolated enum CallFramePatternKind: String, CaseIterable, Equatable, Sendable {
    case dots
    case stripes
    case grid
    case checker
    case halftone
    case scanlines
    case grain
    case stars
    case confetti
    case sunburst
    case waves
    case circuit
    case damask
    case hearts
}

nonisolated enum CallFrameBorderKind: String, CaseIterable, Equatable, Sendable {
    case hairline
    case double
    case deco
    case baroque
    case filmstrip
    case ticket
    case perforated
    case neon
    case brackets
    case torn
    case mourning
    case vines
    case bulbs
    case polaroid
}

nonisolated enum CallFrameOrnamentKind: String, CaseIterable, Equatable, Sendable {
    case sparkles
    case bokeh
    case confetti
    case balloons
    case stars
    case hearts
    case fireflies
    case petals
    case leaves
    case bubbles
    case snow
    case rays
    case glitch
    case scanlines
    case grain
    case vignette
    case lightleak
    case crown
    case ribbon
    case tape
    case rec
    case crosshair
    case orbits
    case runes
    case cobwebs
    case drips
    case lightning
    case notes
    case candles
    case moon
    case clouds
    case bats
    case skulls
    case roses
}

nonisolated enum CallFrameDensity: String, CaseIterable, Equatable, Sendable {
    case low
    case mid
    case high
}

nonisolated enum CallFrameLayer: String, CaseIterable, Equatable, Sendable {
    case back
    case front
}

nonisolated enum CallFrameBrandMark: String, CaseIterable, Equatable, Sendable {
    case logo
    case wordmark
    case both
}

nonisolated enum CallFrameBrandPlace: String, CaseIterable, Equatable, Sendable {
    case top
    case bottom
    case topLeft = "top-left"
    case topRight = "top-right"
    case bottomLeft = "bottom-left"
    case bottomRight = "bottom-right"
    case watermark
}

nonisolated enum CallFrameTextSize: String, CaseIterable, Equatable, Sendable {
    case s
    case m
    case l
}

nonisolated enum CallFrameNameShow: String, CaseIterable, Equatable, Sendable {
    case none
    case name
    case handle
    case both
}

nonisolated enum CallFrameNameStyle: String, CaseIterable, Equatable, Sendable {
    case caption
    case plate
    case ribbon
    case badge
    case bubble
    case tag
    case list
}

nonisolated enum CallFrameTitleSource: String, CaseIterable, Equatable, Sendable {
    case group
    case names
    case brand
    case date
    case none
    case time
    case datetime
    case place
    case landmark
    case emotion
}

nonisolated enum CallFrameTitlePlace: String, CaseIterable, Equatable, Sendable {
    case top
    case bottom
}

nonisolated enum CallFrameTextEffect: String, CaseIterable, Equatable, Sendable {
    case none
    case shadow
    case glow
    case outline
}

nonisolated enum CallFrameLetterCase: String, CaseIterable, Equatable, Sendable {
    case upper
    case asIs = "as-is"
}

nonisolated struct CallFrameLayout: Equatable, Sendable {
    let arrangement: CallFrameArrangement
    let margin: Double
    let gap: Double
    let top: Double
    let bottom: Double
}

nonisolated struct CallFrameStroke: Equatable, Sendable {
    let color: String
    let width: Double
}

nonisolated struct CallFrameCard: Equatable, Sendable {
    let color: String
    let pad: Double
    let foot: Double
}

nonisolated struct CallFrameDuotone: Equatable, Sendable {
    let shadow: String
    let light: String
}

nonisolated struct CallFrameSlotStyle: Equatable, Sendable {
    let shape: CallFrameSlotShape
    let radius: Double?
    let stroke: CallFrameStroke?
    let double: Bool
    let glow: String?
    let shadow: Bool
    let card: CallFrameCard?
    let tilt: CallFrameTilt
    let tone: CallFrameTone
    let duotone: CallFrameDuotone?
    /// Les looks de la bibliothèque Meeshy (#9197) — reçus, pas encore dessinés (doc 06, étape 3.5).
    let look: [CallFrameSlotLook]

    init(
        shape: CallFrameSlotShape, radius: Double?, stroke: CallFrameStroke?, double: Bool, glow: String?, shadow: Bool,
        card: CallFrameCard?, tilt: CallFrameTilt, tone: CallFrameTone, duotone: CallFrameDuotone?, look: [CallFrameSlotLook] = []
    ) {
        self.shape = shape
        self.radius = radius
        self.stroke = stroke
        self.double = double
        self.glow = glow
        self.shadow = shadow
        self.card = card
        self.tilt = tilt
        self.tone = tone
        self.duotone = duotone
        self.look = look
    }
}

nonisolated enum CallFrameBackground: Equatable, Sendable {
    case solid(color: String)
    case linear(colors: [String], angle: Double)
    case radial(colors: [String])
    case accent
}

nonisolated struct CallFramePattern: Equatable, Sendable {
    let kind: CallFramePatternKind
    let color: String
    let opacity: Double
}

nonisolated struct CallFrameBorder: Equatable, Sendable {
    let kind: CallFrameBorderKind
    let color: String
    let width: Double
    let inset: Double
}

nonisolated struct CallFrameOrnament: Equatable, Sendable {
    let kind: CallFrameOrnamentKind
    let color: String
    let density: CallFrameDensity
    let layer: CallFrameLayer
    /// `still` par défaut ; `loop` et `onAppear` ne s'animent qu'en direct (doc 06, étape 3.2).
    let motion: CallFrameOrnamentMotion

    init(kind: CallFrameOrnamentKind, color: String, density: CallFrameDensity, layer: CallFrameLayer, motion: CallFrameOrnamentMotion = .still) {
        self.kind = kind
        self.color = color
        self.density = density
        self.layer = layer
        self.motion = motion
    }
}

nonisolated struct CallFrameBrand: Equatable, Sendable {
    let mark: CallFrameBrandMark
    let place: CallFrameBrandPlace
    let color: String
    let size: CallFrameTextSize
    let font: StoryTextStyle?
    /// Le filigrane orientable des Imager (#9197) — reçu ; le rendu garde la diagonale actuelle jusqu'à l'étape 3.4.
    let watermark: CallFrameWatermark?

    init(mark: CallFrameBrandMark, place: CallFrameBrandPlace, color: String, size: CallFrameTextSize, font: StoryTextStyle?, watermark: CallFrameWatermark? = nil) {
        self.mark = mark
        self.place = place
        self.color = color
        self.size = size
        self.font = font
        self.watermark = watermark
    }
}

nonisolated struct CallFrameNames: Equatable, Sendable {
    let show: CallFrameNameShow
    let style: CallFrameNameStyle
    let font: StoryTextStyle
    let color: String
    let fill: String?
}

nonisolated struct CallFrameTitle: Equatable, Sendable {
    let source: CallFrameTitleSource
    let font: StoryTextStyle
    let color: String
    let place: CallFrameTitlePlace
    let size: CallFrameTextSize
    let effect: CallFrameTextEffect?
    let letterCase: CallFrameLetterCase?
    /// La forme de la source (spec 01 § 2) — `nil` : la forme par défaut de la source.
    let form: CallFrameTextForm?

    init(
        source: CallFrameTitleSource, font: StoryTextStyle, color: String, place: CallFrameTitlePlace, size: CallFrameTextSize,
        effect: CallFrameTextEffect?, letterCase: CallFrameLetterCase?, form: CallFrameTextForm? = nil
    ) {
        self.source = source
        self.font = font
        self.color = color
        self.place = place
        self.size = size
        self.effect = effect
        self.letterCase = letterCase
        self.form = form
    }

    var servedEffect: CallFrameTextEffect { effect ?? CallFrameTextEffect.none }
}

/// L'apparence complète d'un cadre — ce qu'une variante surcharge, clé par clé.
/// `brand` est FACULTATIF depuis #9197 : un cadre sans signature se peint sans marque.
nonisolated struct CallFrameLook: Equatable, Sendable {
    let layout: CallFrameLayout
    let slot: CallFrameSlotStyle
    let background: CallFrameBackground
    let pattern: CallFramePattern?
    let border: CallFrameBorder?
    let ornaments: [CallFrameOrnament]
    let brand: CallFrameBrand?
    let names: CallFrameNames
    let title: CallFrameTitle
    let subtitle: CallFrameTitle?
    let elements: [CallFrameElement]
    let scene: [CallFrameSceneLayer]
    let behaviors: [CallFrameBehavior]
    let fallbacks: CallFrameFallbacks?

    init(
        layout: CallFrameLayout, slot: CallFrameSlotStyle, background: CallFrameBackground, pattern: CallFramePattern?,
        border: CallFrameBorder?, ornaments: [CallFrameOrnament], brand: CallFrameBrand? = nil, names: CallFrameNames,
        title: CallFrameTitle, subtitle: CallFrameTitle?, elements: [CallFrameElement] = [], scene: [CallFrameSceneLayer] = [],
        behaviors: [CallFrameBehavior] = [], fallbacks: CallFrameFallbacks? = nil
    ) {
        self.layout = layout
        self.slot = slot
        self.background = background
        self.pattern = pattern
        self.border = border
        self.ornaments = ornaments
        self.brand = brand
        self.names = names
        self.title = title
        self.subtitle = subtitle
        self.elements = elements
        self.scene = scene
        self.behaviors = behaviors
        self.fallbacks = fallbacks
    }
}

/// Un cadre : un motif servi à une tranche. `id` = `<ambiance>.<motif>.<tranche>`, stable.
nonisolated struct CallFrameDesign: Equatable, Sendable, Identifiable {
    let id: String
    let motif: String
    let mood: CallFrameMood
    let name: String
    let bucket: CallFrameBucket
    let people: ClosedRange<Int>
    let look: CallFrameLook
    /// Qui a fait le cadre et quand — le panneau du tap (doc 06, étape 3.4).
    let credits: CallFrameCredits?
    /// Où le cadre se propose : la capture seule, sauf s'il déclare aussi le direct.
    let surfaces: [CallFrameSurface]
    let cost: CallFrameCost?

    init(
        id: String, motif: String, mood: CallFrameMood, name: String, bucket: CallFrameBucket, look: CallFrameLook,
        credits: CallFrameCredits? = nil, surfaces: [CallFrameSurface] = [.capture], cost: CallFrameCost? = nil
    ) {
        self.id = id
        self.motif = motif
        self.mood = mood
        self.name = name
        self.bucket = bucket
        self.people = bucket.people
        self.look = look
        self.credits = credits
        self.surfaces = surfaces
        self.cost = cost
    }

    func isOffered(on surface: CallFrameSurface) -> Bool { surfaces.contains(surface) }

    func serves(people count: Int) -> Bool { people.contains(count) }
}

/// Une couleur `#RGB`, `#RRGGBB` ou `#RRGGBBAA` — `MessageCardColor.hex` ne lit ni l'alpha ni la forme courte.
nonisolated struct CallFrameColor: Equatable, Sendable {
    let red: Double
    let green: Double
    let blue: Double
    let alpha: Double

    static func parse(_ value: String) -> CallFrameColor? {
        guard value.hasPrefix("#") else { return nil }
        let digits = Array(value.dropFirst())
        guard digits.allSatisfy(\.isHexDigit) else { return nil }
        let channels: [String]
        switch digits.count {
        case 3: channels = digits.map { String([$0, $0]) } + ["FF"]
        case 6: channels = stride(from: 0, to: 6, by: 2).map { String(digits[$0 ..< $0 + 2]) } + ["FF"]
        case 8: channels = stride(from: 0, to: 8, by: 2).map { String(digits[$0 ..< $0 + 2]) }
        default: return nil
        }
        let values = channels.compactMap { UInt8($0, radix: 16) }.map { Double($0) / 255 }
        guard values.count == 4 else { return nil }
        return CallFrameColor(red: values[0], green: values[1], blue: values[2], alpha: values[3])
    }

    static func cg(_ value: String, alpha factor: Double = 1) -> CGColor {
        let color = parse(value) ?? CallFrameColor(red: 0, green: 0, blue: 0, alpha: 1)
        return color.cgColor(alpha: factor)
    }

    func cgColor(alpha factor: Double = 1) -> CGColor {
        CGColor(red: CGFloat(red), green: CGFloat(green), blue: CGFloat(blue), alpha: CGFloat(alpha * factor))
    }
}
