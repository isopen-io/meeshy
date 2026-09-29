// GÉNÉRÉ — ne pas éditer; source: packages/shared/design/call-capture-frames
// Régénérer : `cd packages/shared && bun run generate:call-frames`.
// Fraîcheur gardée par packages/shared/__tests__/call-capture-frames-swift.test.ts.

import MeeshySDK

nonisolated extension CallFrameCatalogue {
    static let morbideFrames: [CallFrameDesign] = [
        CallFrameDesign(
            id: "morbide.faire-part.duo",
            motif: "morbide.faire-part",
            mood: .morbide,
            name: "Faire-part",
            bucket: .duo,
            look: CallFrameLook(
                layout: CallFrameLayout(arrangement: .column, margin: 0.1, gap: 0.04, top: 0.22, bottom: 0.14),
                slot: CallFrameSlotStyle(shape: .rect, radius: nil, stroke: CallFrameStroke(color: "#1A1A1A", width: 0.004), double: false, glow: nil, shadow: true, card: nil, tilt: .none, tone: .mono, duotone: nil),
                background: .solid(color: "#F4F0E8"),
                pattern: CallFramePattern(kind: .grain, color: "#5A4A3A", opacity: 0.08),
                border: CallFrameBorder(kind: .mourning, color: "#0A0A0A", width: 0.045, inset: 0.0),
                ornaments: [
                    CallFrameOrnament(kind: .roses, color: "#2A2A2A", density: .low, layer: .front)
                ],
                brand: CallFrameBrand(mark: .wordmark, place: .bottom, color: "#4A4A4A", size: .s, font: StoryTextStyle.classic),
                names: CallFrameNames(show: .name, style: .caption, font: .elegant, color: "#1A1A1A", fill: nil),
                title: CallFrameTitle(source: .names, font: .elegant, color: "#1A1A1A", place: .top, size: .l, effect: CallFrameTextEffect.none, letterCase: CallFrameLetterCase.asIs),
                subtitle: CallFrameTitle(source: .date, font: .classic, color: "#4A4A4A", place: .top, size: .s, effect: CallFrameTextEffect.none, letterCase: CallFrameLetterCase.upper)
            )
        ),
        CallFrameDesign(
            id: "morbide.faire-part.comite",
            motif: "morbide.faire-part",
            mood: .morbide,
            name: "Faire-part",
            bucket: .comite,
            look: CallFrameLook(
                layout: CallFrameLayout(arrangement: .arch, margin: 0.1, gap: 0.035, top: 0.2, bottom: 0.14),
                slot: CallFrameSlotStyle(shape: .rect, radius: nil, stroke: CallFrameStroke(color: "#1A1A1A", width: 0.004), double: false, glow: nil, shadow: true, card: nil, tilt: .none, tone: .mono, duotone: nil),
                background: .solid(color: "#F4F0E8"),
                pattern: CallFramePattern(kind: .grain, color: "#5A4A3A", opacity: 0.08),
                border: CallFrameBorder(kind: .mourning, color: "#0A0A0A", width: 0.045, inset: 0.0),
                ornaments: [
                    CallFrameOrnament(kind: .roses, color: "#2A2A2A", density: .low, layer: .front)
                ],
                brand: CallFrameBrand(mark: .wordmark, place: .bottom, color: "#4A4A4A", size: .s, font: StoryTextStyle.classic),
                names: CallFrameNames(show: .name, style: .caption, font: .elegant, color: "#1A1A1A", fill: nil),
                title: CallFrameTitle(source: .group, font: .elegant, color: "#1A1A1A", place: .top, size: .l, effect: CallFrameTextEffect.none, letterCase: CallFrameLetterCase.asIs),
                subtitle: CallFrameTitle(source: .date, font: .classic, color: "#4A4A4A", place: .top, size: .s, effect: CallFrameTextEffect.none, letterCase: CallFrameLetterCase.upper)
            )
        ),
        CallFrameDesign(
            id: "morbide.faire-part.groupe",
            motif: "morbide.faire-part",
            mood: .morbide,
            name: "Faire-part",
            bucket: .groupe,
            look: CallFrameLook(
                layout: CallFrameLayout(arrangement: .grid, margin: 0.09, gap: 0.03, top: 0.18, bottom: 0.16),
                slot: CallFrameSlotStyle(shape: .rect, radius: nil, stroke: CallFrameStroke(color: "#1A1A1A", width: 0.003), double: false, glow: nil, shadow: false, card: nil, tilt: .none, tone: .mono, duotone: nil),
                background: .solid(color: "#F4F0E8"),
                pattern: CallFramePattern(kind: .grain, color: "#5A4A3A", opacity: 0.08),
                border: CallFrameBorder(kind: .mourning, color: "#0A0A0A", width: 0.045, inset: 0.0),
                ornaments: [
                    CallFrameOrnament(kind: .roses, color: "#2A2A2A", density: .low, layer: .front)
                ],
                brand: CallFrameBrand(mark: .wordmark, place: .bottom, color: "#4A4A4A", size: .s, font: StoryTextStyle.classic),
                names: CallFrameNames(show: .name, style: .list, font: .elegant, color: "#1A1A1A", fill: nil),
                title: CallFrameTitle(source: .group, font: .elegant, color: "#1A1A1A", place: .top, size: .l, effect: CallFrameTextEffect.none, letterCase: CallFrameLetterCase.asIs),
                subtitle: CallFrameTitle(source: .date, font: .classic, color: "#4A4A4A", place: .top, size: .s, effect: CallFrameTextEffect.none, letterCase: CallFrameLetterCase.upper)
            )
        ),
        CallFrameDesign(
            id: "morbide.memento.duo",
            motif: "morbide.memento",
            mood: .morbide,
            name: "Memento",
            bucket: .duo,
            look: CallFrameLook(
                layout: CallFrameLayout(arrangement: .diagonal, margin: 0.07, gap: 0.03, top: 0.17, bottom: 0.12),
                slot: CallFrameSlotStyle(shape: .rect, radius: nil, stroke: CallFrameStroke(color: "#B08D57", width: 0.008), double: false, glow: nil, shadow: true, card: CallFrameCard(color: "#1A0A0B", pad: 0.04, foot: 0.04), tilt: .none, tone: .duotone, duotone: CallFrameDuotone(shadow: "#1A0205", light: "#E8C9A0")),
                background: .radial(colors: ["#2B1E14", "#140D08", "#060403"]),
                pattern: CallFramePattern(kind: .grain, color: "#E8C9A0", opacity: 0.06),
                border: nil,
                ornaments: [
                    CallFrameOrnament(kind: .vignette, color: "#000000AA", density: .mid, layer: .back),
                    CallFrameOrnament(kind: .roses, color: "#8E1B24", density: .mid, layer: .back),
                    CallFrameOrnament(kind: .skulls, color: "#E8C9A0", density: .low, layer: .front),
                    CallFrameOrnament(kind: .candles, color: "#F2C46D", density: .low, layer: .front)
                ],
                brand: CallFrameBrand(mark: .both, place: .bottom, color: "#E8C9A0", size: .m, font: StoryTextStyle.classic),
                names: CallFrameNames(show: .handle, style: .ribbon, font: .classic, color: "#1A0205", fill: "#E8C9A0"),
                title: CallFrameTitle(source: .names, font: .fantasy, color: "#E8C9A0", place: .top, size: .l, effect: CallFrameTextEffect.shadow, letterCase: CallFrameLetterCase.asIs),
                subtitle: CallFrameTitle(source: .date, font: .classic, color: "#B08D57", place: .top, size: .s, effect: CallFrameTextEffect.none, letterCase: CallFrameLetterCase.upper)
            )
        ),
        CallFrameDesign(
            id: "morbide.memento.comite",
            motif: "morbide.memento",
            mood: .morbide,
            name: "Memento",
            bucket: .comite,
            look: CallFrameLook(
                layout: CallFrameLayout(arrangement: .hero, margin: 0.07, gap: 0.03, top: 0.17, bottom: 0.12),
                slot: CallFrameSlotStyle(shape: .rect, radius: nil, stroke: CallFrameStroke(color: "#B08D57", width: 0.008), double: false, glow: nil, shadow: true, card: CallFrameCard(color: "#1A0A0B", pad: 0.04, foot: 0.04), tilt: .none, tone: .duotone, duotone: CallFrameDuotone(shadow: "#1A0205", light: "#E8C9A0")),
                background: .radial(colors: ["#2B1E14", "#140D08", "#060403"]),
                pattern: CallFramePattern(kind: .grain, color: "#E8C9A0", opacity: 0.06),
                border: nil,
                ornaments: [
                    CallFrameOrnament(kind: .vignette, color: "#000000AA", density: .mid, layer: .back),
                    CallFrameOrnament(kind: .roses, color: "#8E1B24", density: .mid, layer: .back),
                    CallFrameOrnament(kind: .skulls, color: "#E8C9A0", density: .low, layer: .front),
                    CallFrameOrnament(kind: .candles, color: "#F2C46D", density: .low, layer: .front)
                ],
                brand: CallFrameBrand(mark: .both, place: .bottom, color: "#E8C9A0", size: .m, font: StoryTextStyle.classic),
                names: CallFrameNames(show: .handle, style: .plate, font: .classic, color: "#E8C9A0", fill: "#1A0205D9"),
                title: CallFrameTitle(source: .group, font: .fantasy, color: "#E8C9A0", place: .top, size: .l, effect: CallFrameTextEffect.shadow, letterCase: CallFrameLetterCase.asIs),
                subtitle: CallFrameTitle(source: .date, font: .classic, color: "#B08D57", place: .top, size: .s, effect: CallFrameTextEffect.none, letterCase: CallFrameLetterCase.upper)
            )
        ),
        CallFrameDesign(
            id: "morbide.memento.groupe",
            motif: "morbide.memento",
            mood: .morbide,
            name: "Memento",
            bucket: .groupe,
            look: CallFrameLook(
                layout: CallFrameLayout(arrangement: .mosaic, margin: 0.06, gap: 0.025, top: 0.16, bottom: 0.11),
                slot: CallFrameSlotStyle(shape: .rect, radius: nil, stroke: CallFrameStroke(color: "#B08D57", width: 0.008), double: false, glow: nil, shadow: true, card: CallFrameCard(color: "#1A0A0B", pad: 0.04, foot: 0.04), tilt: .none, tone: .duotone, duotone: CallFrameDuotone(shadow: "#1A0205", light: "#E8C9A0")),
                background: .radial(colors: ["#2B1E14", "#140D08", "#060403"]),
                pattern: CallFramePattern(kind: .grain, color: "#E8C9A0", opacity: 0.06),
                border: nil,
                ornaments: [
                    CallFrameOrnament(kind: .vignette, color: "#000000AA", density: .mid, layer: .back),
                    CallFrameOrnament(kind: .roses, color: "#8E1B24", density: .low, layer: .back),
                    CallFrameOrnament(kind: .skulls, color: "#E8C9A0", density: .low, layer: .front)
                ],
                brand: CallFrameBrand(mark: .both, place: .bottom, color: "#E8C9A0", size: .m, font: StoryTextStyle.classic),
                names: CallFrameNames(show: .handle, style: .plate, font: .classic, color: "#E8C9A0", fill: "#1A0205D9"),
                title: CallFrameTitle(source: .group, font: .fantasy, color: "#E8C9A0", place: .top, size: .l, effect: CallFrameTextEffect.shadow, letterCase: CallFrameLetterCase.asIs),
                subtitle: CallFrameTitle(source: .date, font: .classic, color: "#B08D57", place: .top, size: .s, effect: CallFrameTextEffect.none, letterCase: CallFrameLetterCase.upper)
            )
        ),
        CallFrameDesign(
            id: "morbide.memento.tablee",
            motif: "morbide.memento",
            mood: .morbide,
            name: "Memento",
            bucket: .tablee,
            look: CallFrameLook(
                layout: CallFrameLayout(arrangement: .grid, margin: 0.05, gap: 0.018, top: 0.15, bottom: 0.1),
                slot: CallFrameSlotStyle(shape: .rect, radius: nil, stroke: CallFrameStroke(color: "#B08D57", width: 0.006), double: false, glow: nil, shadow: false, card: nil, tilt: .none, tone: .duotone, duotone: CallFrameDuotone(shadow: "#1A0205", light: "#E8C9A0")),
                background: .radial(colors: ["#2B1E14", "#140D08", "#060403"]),
                pattern: CallFramePattern(kind: .grain, color: "#E8C9A0", opacity: 0.06),
                border: nil,
                ornaments: [
                    CallFrameOrnament(kind: .vignette, color: "#000000AA", density: .mid, layer: .back),
                    CallFrameOrnament(kind: .roses, color: "#8E1B24", density: .mid, layer: .back),
                    CallFrameOrnament(kind: .skulls, color: "#E8C9A0", density: .low, layer: .front),
                    CallFrameOrnament(kind: .candles, color: "#F2C46D", density: .low, layer: .front)
                ],
                brand: CallFrameBrand(mark: .both, place: .bottom, color: "#E8C9A0", size: .m, font: StoryTextStyle.classic),
                names: CallFrameNames(show: .none, style: .plate, font: .classic, color: "#E8C9A0", fill: "#1A0205D9"),
                title: CallFrameTitle(source: .group, font: .fantasy, color: "#E8C9A0", place: .top, size: .l, effect: CallFrameTextEffect.shadow, letterCase: CallFrameLetterCase.asIs),
                subtitle: CallFrameTitle(source: .date, font: .classic, color: "#B08D57", place: .top, size: .s, effect: CallFrameTextEffect.none, letterCase: CallFrameLetterCase.upper)
            )
        ),
        CallFrameDesign(
            id: "morbide.crypte.duo",
            motif: "morbide.crypte",
            mood: .morbide,
            name: "Crypte",
            bucket: .duo,
            look: CallFrameLook(
                layout: CallFrameLayout(arrangement: .split, margin: 0.08, gap: 0.04, top: 0.16, bottom: 0.1),
                slot: CallFrameSlotStyle(shape: .arch, radius: nil, stroke: CallFrameStroke(color: "#5C6474", width: 0.01), double: false, glow: "#9FB4D855", shadow: false, card: nil, tilt: .none, tone: .mono, duotone: nil),
                background: .linear(colors: ["#1A2233", "#0B0F18", "#05070C"], angle: 0.0),
                pattern: CallFramePattern(kind: .grain, color: "#FFFFFF", opacity: 0.06),
                border: CallFrameBorder(kind: .hairline, color: "#5C6474", width: 0.004, inset: 0.035),
                ornaments: [
                    CallFrameOrnament(kind: .cobwebs, color: "#C9D1DC59", density: .mid, layer: .back),
                    CallFrameOrnament(kind: .bats, color: "#3E4860", density: .low, layer: .back),
                    CallFrameOrnament(kind: .moon, color: "#E6EDF5", density: .low, layer: .front),
                    CallFrameOrnament(kind: .candles, color: "#F2C46D", density: .low, layer: .front)
                ],
                brand: CallFrameBrand(mark: .logo, place: .topLeft, color: "#AEB8C8", size: .s, font: nil),
                names: CallFrameNames(show: .both, style: .plate, font: .classic, color: "#D8DEE9", fill: "#05070CCC"),
                title: CallFrameTitle(source: .names, font: .fantasy, color: "#D8DEE9", place: .top, size: .l, effect: CallFrameTextEffect.glow, letterCase: CallFrameLetterCase.asIs),
                subtitle: nil
            )
        ),
        CallFrameDesign(
            id: "morbide.crypte.comite",
            motif: "morbide.crypte",
            mood: .morbide,
            name: "Crypte",
            bucket: .comite,
            look: CallFrameLook(
                layout: CallFrameLayout(arrangement: .grid, margin: 0.07, gap: 0.03, top: 0.17, bottom: 0.12),
                slot: CallFrameSlotStyle(shape: .arch, radius: nil, stroke: CallFrameStroke(color: "#5C6474", width: 0.01), double: false, glow: "#9FB4D855", shadow: false, card: nil, tilt: .none, tone: .mono, duotone: nil),
                background: .linear(colors: ["#1A2233", "#0B0F18", "#05070C"], angle: 0.0),
                pattern: CallFramePattern(kind: .grain, color: "#FFFFFF", opacity: 0.06),
                border: CallFrameBorder(kind: .hairline, color: "#5C6474", width: 0.004, inset: 0.035),
                ornaments: [
                    CallFrameOrnament(kind: .cobwebs, color: "#C9D1DC59", density: .mid, layer: .back),
                    CallFrameOrnament(kind: .bats, color: "#3E4860", density: .low, layer: .back),
                    CallFrameOrnament(kind: .moon, color: "#E6EDF5", density: .low, layer: .front),
                    CallFrameOrnament(kind: .candles, color: "#F2C46D", density: .low, layer: .front)
                ],
                brand: CallFrameBrand(mark: .logo, place: .topLeft, color: "#AEB8C8", size: .s, font: nil),
                names: CallFrameNames(show: .both, style: .caption, font: .classic, color: "#AEB8C8", fill: nil),
                title: CallFrameTitle(source: .group, font: .fantasy, color: "#D8DEE9", place: .top, size: .l, effect: CallFrameTextEffect.glow, letterCase: CallFrameLetterCase.asIs),
                subtitle: nil
            )
        ),
        CallFrameDesign(
            id: "morbide.crypte.groupe",
            motif: "morbide.crypte",
            mood: .morbide,
            name: "Crypte",
            bucket: .groupe,
            look: CallFrameLook(
                layout: CallFrameLayout(arrangement: .tiers, margin: 0.06, gap: 0.025, top: 0.16, bottom: 0.12),
                slot: CallFrameSlotStyle(shape: .arch, radius: nil, stroke: CallFrameStroke(color: "#5C6474", width: 0.008), double: false, glow: "#9FB4D855", shadow: false, card: nil, tilt: .none, tone: .mono, duotone: nil),
                background: .linear(colors: ["#1A2233", "#0B0F18", "#05070C"], angle: 0.0),
                pattern: CallFramePattern(kind: .grain, color: "#FFFFFF", opacity: 0.06),
                border: CallFrameBorder(kind: .hairline, color: "#5C6474", width: 0.004, inset: 0.035),
                ornaments: [
                    CallFrameOrnament(kind: .cobwebs, color: "#C9D1DC59", density: .mid, layer: .back),
                    CallFrameOrnament(kind: .bats, color: "#3E4860", density: .low, layer: .back),
                    CallFrameOrnament(kind: .moon, color: "#E6EDF5", density: .low, layer: .front),
                    CallFrameOrnament(kind: .candles, color: "#F2C46D", density: .low, layer: .front)
                ],
                brand: CallFrameBrand(mark: .logo, place: .topLeft, color: "#AEB8C8", size: .s, font: nil),
                names: CallFrameNames(show: .handle, style: .badge, font: .classic, color: "#D8DEE9", fill: "#05070CCC"),
                title: CallFrameTitle(source: .group, font: .fantasy, color: "#D8DEE9", place: .top, size: .l, effect: CallFrameTextEffect.glow, letterCase: CallFrameLetterCase.asIs),
                subtitle: nil
            )
        ),
        CallFrameDesign(
            id: "morbide.crypte.tablee",
            motif: "morbide.crypte",
            mood: .morbide,
            name: "Crypte",
            bucket: .tablee,
            look: CallFrameLook(
                layout: CallFrameLayout(arrangement: .tiers, margin: 0.05, gap: 0.018, top: 0.15, bottom: 0.1),
                slot: CallFrameSlotStyle(shape: .arch, radius: nil, stroke: CallFrameStroke(color: "#5C6474", width: 0.006), double: false, glow: "#9FB4D855", shadow: false, card: nil, tilt: .none, tone: .mono, duotone: nil),
                background: .linear(colors: ["#1A2233", "#0B0F18", "#05070C"], angle: 0.0),
                pattern: CallFramePattern(kind: .grain, color: "#FFFFFF", opacity: 0.06),
                border: CallFrameBorder(kind: .hairline, color: "#5C6474", width: 0.004, inset: 0.035),
                ornaments: [
                    CallFrameOrnament(kind: .cobwebs, color: "#C9D1DC59", density: .mid, layer: .back),
                    CallFrameOrnament(kind: .bats, color: "#3E4860", density: .low, layer: .back),
                    CallFrameOrnament(kind: .moon, color: "#E6EDF5", density: .low, layer: .front),
                    CallFrameOrnament(kind: .candles, color: "#F2C46D", density: .low, layer: .front)
                ],
                brand: CallFrameBrand(mark: .logo, place: .topLeft, color: "#AEB8C8", size: .s, font: nil),
                names: CallFrameNames(show: .none, style: .badge, font: .classic, color: "#D8DEE9", fill: nil),
                title: CallFrameTitle(source: .group, font: .fantasy, color: "#D8DEE9", place: .top, size: .l, effect: CallFrameTextEffect.glow, letterCase: CallFrameLetterCase.asIs),
                subtitle: nil
            )
        ),
        CallFrameDesign(
            id: "morbide.veillee.duo",
            motif: "morbide.veillee",
            mood: .morbide,
            name: "Veillée",
            bucket: .duo,
            look: CallFrameLook(
                layout: CallFrameLayout(arrangement: .diagonal, margin: 0.08, gap: 0.03, top: 0.16, bottom: 0.12),
                slot: CallFrameSlotStyle(shape: .oval, radius: nil, stroke: nil, double: false, glow: "#F5A52466", shadow: true, card: nil, tilt: .none, tone: .noir, duotone: nil),
                background: .radial(colors: ["#2A1608", "#120904", "#050302"]),
                pattern: CallFramePattern(kind: .grain, color: "#F3E3C3", opacity: 0.05),
                border: nil,
                ornaments: [
                    CallFrameOrnament(kind: .candles, color: "#F5A524", density: .high, layer: .back),
                    CallFrameOrnament(kind: .vignette, color: "#000000B3", density: .mid, layer: .back),
                    CallFrameOrnament(kind: .drips, color: "#EDE3CF", density: .low, layer: .front)
                ],
                brand: CallFrameBrand(mark: .wordmark, place: .bottomRight, color: "#C9A56B", size: .s, font: StoryTextStyle.elegant),
                names: CallFrameNames(show: .both, style: .caption, font: .elegant, color: "#EAD9B8", fill: nil),
                title: CallFrameTitle(source: .names, font: .elegant, color: "#F3E3C3", place: .top, size: .l, effect: CallFrameTextEffect.glow, letterCase: CallFrameLetterCase.asIs),
                subtitle: CallFrameTitle(source: .date, font: .classic, color: "#C9A56B", place: .top, size: .s, effect: CallFrameTextEffect.none, letterCase: CallFrameLetterCase.upper)
            )
        )
    ]
}
