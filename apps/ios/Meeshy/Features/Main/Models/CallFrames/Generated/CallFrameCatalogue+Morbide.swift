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
                layout: CallFrameLayout(arrangement: .row, margin: 0.1, gap: 0.05, top: 0.17, bottom: 0.12),
                slot: CallFrameSlotStyle(shape: .rect, radius: nil, stroke: CallFrameStroke(color: "#111111", width: 0.006), double: false, glow: nil, shadow: true, card: CallFrameCard(color: "#FFFFFF", pad: 0.05, foot: 0.05), tilt: .none, tone: .mono, duotone: nil),
                background: .solid(color: "#F4F0E8"),
                pattern: CallFramePattern(kind: .grain, color: "#3A3530", opacity: 0.12),
                border: CallFrameBorder(kind: .mourning, color: "#111111", width: 0.05, inset: 0.0),
                ornaments: [
                    CallFrameOrnament(kind: .roses, color: "#151515", density: .low, layer: .front),
                    CallFrameOrnament(kind: .petals, color: "#9B111E", density: .mid, layer: .back, motion: .loop),
                    CallFrameOrnament(kind: .candles, color: "#FFB347", density: .low, layer: .front, motion: .loop)
                ],
                brand: CallFrameBrand(mark: .wordmark, place: .bottom, color: "#111111", size: .s, font: StoryTextStyle.elegant),
                names: CallFrameNames(show: .name, style: .caption, font: .italic, color: "#111111", fill: nil),
                title: CallFrameTitle(source: .names, font: .elegant, color: "#111111", place: .top, size: .l, effect: CallFrameTextEffect.none, letterCase: CallFrameLetterCase.upper),
                subtitle: CallFrameTitle(source: .date, font: .italic, color: "#3A3530", place: .top, size: .s, effect: nil, letterCase: nil)
            ),
            surfaces: [.capture, .live]
        ),
        CallFrameDesign(
            id: "morbide.faire-part.comite",
            motif: "morbide.faire-part",
            mood: .morbide,
            name: "Faire-part",
            bucket: .comite,
            look: CallFrameLook(
                layout: CallFrameLayout(arrangement: .grid, margin: 0.1, gap: 0.035, top: 0.17, bottom: 0.12),
                slot: CallFrameSlotStyle(shape: .rect, radius: nil, stroke: CallFrameStroke(color: "#111111", width: 0.006), double: false, glow: nil, shadow: true, card: CallFrameCard(color: "#FFFFFF", pad: 0.05, foot: 0.05), tilt: .none, tone: .mono, duotone: nil),
                background: .solid(color: "#F4F0E8"),
                pattern: CallFramePattern(kind: .grain, color: "#3A3530", opacity: 0.12),
                border: CallFrameBorder(kind: .mourning, color: "#111111", width: 0.05, inset: 0.0),
                ornaments: [
                    CallFrameOrnament(kind: .roses, color: "#151515", density: .low, layer: .front),
                    CallFrameOrnament(kind: .petals, color: "#9B111E", density: .mid, layer: .back, motion: .loop),
                    CallFrameOrnament(kind: .candles, color: "#FFB347", density: .low, layer: .front, motion: .loop)
                ],
                brand: CallFrameBrand(mark: .wordmark, place: .bottom, color: "#111111", size: .s, font: StoryTextStyle.elegant),
                names: CallFrameNames(show: .name, style: .caption, font: .italic, color: "#111111", fill: nil),
                title: CallFrameTitle(source: .group, font: .elegant, color: "#111111", place: .top, size: .l, effect: CallFrameTextEffect.none, letterCase: CallFrameLetterCase.upper),
                subtitle: CallFrameTitle(source: .date, font: .italic, color: "#3A3530", place: .top, size: .s, effect: nil, letterCase: nil)
            ),
            surfaces: [.capture, .live]
        ),
        CallFrameDesign(
            id: "morbide.faire-part.groupe",
            motif: "morbide.faire-part",
            mood: .morbide,
            name: "Faire-part",
            bucket: .groupe,
            look: CallFrameLook(
                layout: CallFrameLayout(arrangement: .grid, margin: 0.09, gap: 0.03, top: 0.16, bottom: 0.12),
                slot: CallFrameSlotStyle(shape: .rect, radius: nil, stroke: CallFrameStroke(color: "#111111", width: 0.005), double: false, glow: nil, shadow: true, card: CallFrameCard(color: "#FFFFFF", pad: 0.05, foot: 0.05), tilt: .none, tone: .mono, duotone: nil),
                background: .solid(color: "#F4F0E8"),
                pattern: CallFramePattern(kind: .grain, color: "#3A3530", opacity: 0.12),
                border: CallFrameBorder(kind: .mourning, color: "#111111", width: 0.05, inset: 0.0),
                ornaments: [
                    CallFrameOrnament(kind: .roses, color: "#151515", density: .low, layer: .front),
                    CallFrameOrnament(kind: .petals, color: "#9B111E", density: .mid, layer: .back, motion: .loop),
                    CallFrameOrnament(kind: .candles, color: "#FFB347", density: .low, layer: .front, motion: .loop)
                ],
                brand: CallFrameBrand(mark: .wordmark, place: .bottom, color: "#111111", size: .s, font: StoryTextStyle.elegant),
                names: CallFrameNames(show: .name, style: .caption, font: .italic, color: "#111111", fill: nil),
                title: CallFrameTitle(source: .group, font: .elegant, color: "#111111", place: .top, size: .l, effect: CallFrameTextEffect.none, letterCase: CallFrameLetterCase.upper),
                subtitle: CallFrameTitle(source: .date, font: .italic, color: "#3A3530", place: .top, size: .s, effect: nil, letterCase: nil)
            ),
            surfaces: [.capture, .live]
        ),
        CallFrameDesign(
            id: "morbide.memento.duo",
            motif: "morbide.memento",
            mood: .morbide,
            name: "Memento",
            bucket: .duo,
            look: CallFrameLook(
                layout: CallFrameLayout(arrangement: .row, margin: 0.08, gap: 0.04, top: 0.17, bottom: 0.11),
                slot: CallFrameSlotStyle(shape: .frameOval, radius: nil, stroke: CallFrameStroke(color: "#D4AF37", width: 0.01), double: true, glow: nil, shadow: false, card: nil, tilt: .none, tone: .duotone, duotone: CallFrameDuotone(shadow: "#1A0606", light: "#F2E3C6")),
                background: .radial(colors: ["#3D0A0A", "#1A0505", "#070202"]),
                pattern: CallFramePattern(kind: .damask, color: "#D4AF37", opacity: 0.07),
                border: CallFrameBorder(kind: .baroque, color: "#D4AF37", width: 0.008, inset: 0.025),
                ornaments: [
                    CallFrameOrnament(kind: .lightleak, color: "#C1121F", density: .low, layer: .back, motion: .loop),
                    CallFrameOrnament(kind: .vignette, color: "#000000", density: .mid, layer: .back),
                    CallFrameOrnament(kind: .skulls, color: "#EDE4D0", density: .low, layer: .front),
                    CallFrameOrnament(kind: .roses, color: "#C1121F", density: .mid, layer: .front),
                    CallFrameOrnament(kind: .candles, color: "#FF9F1C", density: .low, layer: .front, motion: .loop)
                ],
                brand: CallFrameBrand(mark: .both, place: .bottom, color: "#D4AF37", size: .s, font: StoryTextStyle.fantasy),
                names: CallFrameNames(show: .name, style: .caption, font: .fantasy, color: "#F2E3C6", fill: nil),
                title: CallFrameTitle(source: .names, font: .fantasy, color: "#D4AF37", place: .top, size: .l, effect: CallFrameTextEffect.glow, letterCase: CallFrameLetterCase.upper),
                subtitle: nil
            ),
            surfaces: [.capture, .live]
        ),
        CallFrameDesign(
            id: "morbide.memento.comite",
            motif: "morbide.memento",
            mood: .morbide,
            name: "Memento",
            bucket: .comite,
            look: CallFrameLook(
                layout: CallFrameLayout(arrangement: .grid, margin: 0.07, gap: 0.03, top: 0.16, bottom: 0.11),
                slot: CallFrameSlotStyle(shape: .frameOval, radius: nil, stroke: CallFrameStroke(color: "#D4AF37", width: 0.01), double: true, glow: nil, shadow: false, card: nil, tilt: .none, tone: .duotone, duotone: CallFrameDuotone(shadow: "#1A0606", light: "#F2E3C6")),
                background: .radial(colors: ["#3D0A0A", "#1A0505", "#070202"]),
                pattern: CallFramePattern(kind: .damask, color: "#D4AF37", opacity: 0.07),
                border: CallFrameBorder(kind: .baroque, color: "#D4AF37", width: 0.008, inset: 0.025),
                ornaments: [
                    CallFrameOrnament(kind: .lightleak, color: "#C1121F", density: .low, layer: .back, motion: .loop),
                    CallFrameOrnament(kind: .vignette, color: "#000000", density: .mid, layer: .back),
                    CallFrameOrnament(kind: .skulls, color: "#EDE4D0", density: .low, layer: .front),
                    CallFrameOrnament(kind: .roses, color: "#C1121F", density: .mid, layer: .front),
                    CallFrameOrnament(kind: .candles, color: "#FF9F1C", density: .low, layer: .front, motion: .loop)
                ],
                brand: CallFrameBrand(mark: .both, place: .bottom, color: "#D4AF37", size: .s, font: StoryTextStyle.fantasy),
                names: CallFrameNames(show: .name, style: .caption, font: .fantasy, color: "#F2E3C6", fill: nil),
                title: CallFrameTitle(source: .group, font: .fantasy, color: "#D4AF37", place: .top, size: .l, effect: CallFrameTextEffect.glow, letterCase: CallFrameLetterCase.upper),
                subtitle: nil
            ),
            surfaces: [.capture, .live]
        ),
        CallFrameDesign(
            id: "morbide.memento.groupe",
            motif: "morbide.memento",
            mood: .morbide,
            name: "Memento",
            bucket: .groupe,
            look: CallFrameLook(
                layout: CallFrameLayout(arrangement: .grid, margin: 0.06, gap: 0.025, top: 0.15, bottom: 0.11),
                slot: CallFrameSlotStyle(shape: .frameOval, radius: nil, stroke: CallFrameStroke(color: "#D4AF37", width: 0.01), double: true, glow: nil, shadow: false, card: nil, tilt: .none, tone: .duotone, duotone: CallFrameDuotone(shadow: "#1A0606", light: "#F2E3C6")),
                background: .radial(colors: ["#3D0A0A", "#1A0505", "#070202"]),
                pattern: CallFramePattern(kind: .damask, color: "#D4AF37", opacity: 0.07),
                border: CallFrameBorder(kind: .baroque, color: "#D4AF37", width: 0.008, inset: 0.025),
                ornaments: [
                    CallFrameOrnament(kind: .lightleak, color: "#C1121F", density: .low, layer: .back, motion: .loop),
                    CallFrameOrnament(kind: .vignette, color: "#000000", density: .mid, layer: .back),
                    CallFrameOrnament(kind: .skulls, color: "#EDE4D0", density: .low, layer: .front),
                    CallFrameOrnament(kind: .candles, color: "#FF9F1C", density: .low, layer: .front, motion: .loop)
                ],
                brand: CallFrameBrand(mark: .both, place: .bottom, color: "#D4AF37", size: .s, font: StoryTextStyle.fantasy),
                names: CallFrameNames(show: .name, style: .caption, font: .fantasy, color: "#F2E3C6", fill: nil),
                title: CallFrameTitle(source: .group, font: .fantasy, color: "#D4AF37", place: .top, size: .l, effect: CallFrameTextEffect.glow, letterCase: CallFrameLetterCase.upper),
                subtitle: nil
            ),
            surfaces: [.capture, .live]
        ),
        CallFrameDesign(
            id: "morbide.memento.tablee",
            motif: "morbide.memento",
            mood: .morbide,
            name: "Memento",
            bucket: .tablee,
            look: CallFrameLook(
                layout: CallFrameLayout(arrangement: .grid, margin: 0.05, gap: 0.02, top: 0.14, bottom: 0.12),
                slot: CallFrameSlotStyle(shape: .oval, radius: nil, stroke: CallFrameStroke(color: "#D4AF37", width: 0.006), double: false, glow: nil, shadow: false, card: nil, tilt: .none, tone: .duotone, duotone: CallFrameDuotone(shadow: "#1A0606", light: "#F2E3C6")),
                background: .radial(colors: ["#3D0A0A", "#1A0505", "#070202"]),
                pattern: CallFramePattern(kind: .damask, color: "#D4AF37", opacity: 0.07),
                border: CallFrameBorder(kind: .baroque, color: "#D4AF37", width: 0.008, inset: 0.025),
                ornaments: [
                    CallFrameOrnament(kind: .lightleak, color: "#C1121F", density: .low, layer: .back, motion: .loop),
                    CallFrameOrnament(kind: .vignette, color: "#000000", density: .mid, layer: .back),
                    CallFrameOrnament(kind: .skulls, color: "#EDE4D0", density: .low, layer: .front),
                    CallFrameOrnament(kind: .roses, color: "#C1121F", density: .mid, layer: .front),
                    CallFrameOrnament(kind: .candles, color: "#FF9F1C", density: .low, layer: .front, motion: .loop)
                ],
                brand: CallFrameBrand(mark: .both, place: .bottom, color: "#D4AF37", size: .s, font: StoryTextStyle.fantasy),
                names: CallFrameNames(show: .name, style: .list, font: .fantasy, color: "#F2E3C6", fill: nil),
                title: CallFrameTitle(source: .group, font: .fantasy, color: "#D4AF37", place: .top, size: .l, effect: CallFrameTextEffect.glow, letterCase: CallFrameLetterCase.upper),
                subtitle: nil
            ),
            surfaces: [.capture, .live]
        ),
        CallFrameDesign(
            id: "morbide.crypte.duo",
            motif: "morbide.crypte",
            mood: .morbide,
            name: "Crypte",
            bucket: .duo,
            look: CallFrameLook(
                layout: CallFrameLayout(arrangement: .split, margin: 0.08, gap: 0.04, top: 0.16, bottom: 0.11),
                slot: CallFrameSlotStyle(shape: .circle, radius: nil, stroke: CallFrameStroke(color: "#9D7BD8", width: 0.008), double: false, glow: "#7B2CBFAA", shadow: false, card: nil, tilt: .none, tone: .mono, duotone: nil),
                background: .linear(colors: ["#1E0F33", "#0E0718", "#050208"], angle: 0.0),
                pattern: CallFramePattern(kind: .damask, color: "#7B2CBF", opacity: 0.18),
                border: nil,
                ornaments: [
                    CallFrameOrnament(kind: .cobwebs, color: "#CDBDF0", density: .mid, layer: .front),
                    CallFrameOrnament(kind: .runes, color: "#B388FF", density: .low, layer: .back, motion: .loop),
                    CallFrameOrnament(kind: .candles, color: "#C084FC", density: .mid, layer: .front, motion: .loop),
                    CallFrameOrnament(kind: .bats, color: "#B388FF", density: .low, layer: .front, motion: .loop)
                ],
                brand: CallFrameBrand(mark: .both, place: .bottom, color: "#CDBDF0", size: .s, font: StoryTextStyle.fantasy),
                names: CallFrameNames(show: .handle, style: .badge, font: .fantasy, color: "#F3E8FF", fill: "#1E0F33D9"),
                title: CallFrameTitle(source: .names, font: .fantasy, color: "#E9D5FF", place: .top, size: .l, effect: CallFrameTextEffect.glow, letterCase: CallFrameLetterCase.upper),
                subtitle: nil
            ),
            surfaces: [.capture, .live]
        ),
        CallFrameDesign(
            id: "morbide.crypte.comite",
            motif: "morbide.crypte",
            mood: .morbide,
            name: "Crypte",
            bucket: .comite,
            look: CallFrameLook(
                layout: CallFrameLayout(arrangement: .grid, margin: 0.07, gap: 0.03, top: 0.17, bottom: 0.11),
                slot: CallFrameSlotStyle(shape: .circle, radius: nil, stroke: CallFrameStroke(color: "#9D7BD8", width: 0.008), double: false, glow: "#7B2CBFAA", shadow: false, card: nil, tilt: .none, tone: .mono, duotone: nil),
                background: .linear(colors: ["#1E0F33", "#0E0718", "#050208"], angle: 0.0),
                pattern: CallFramePattern(kind: .damask, color: "#7B2CBF", opacity: 0.18),
                border: nil,
                ornaments: [
                    CallFrameOrnament(kind: .cobwebs, color: "#CDBDF0", density: .mid, layer: .front),
                    CallFrameOrnament(kind: .runes, color: "#B388FF", density: .low, layer: .back, motion: .loop),
                    CallFrameOrnament(kind: .candles, color: "#C084FC", density: .mid, layer: .front, motion: .loop),
                    CallFrameOrnament(kind: .bats, color: "#B388FF", density: .low, layer: .front, motion: .loop)
                ],
                brand: CallFrameBrand(mark: .both, place: .bottom, color: "#CDBDF0", size: .s, font: StoryTextStyle.fantasy),
                names: CallFrameNames(show: .handle, style: .badge, font: .fantasy, color: "#F3E8FF", fill: "#1E0F33D9"),
                title: CallFrameTitle(source: .group, font: .fantasy, color: "#E9D5FF", place: .top, size: .l, effect: CallFrameTextEffect.glow, letterCase: CallFrameLetterCase.upper),
                subtitle: nil
            ),
            surfaces: [.capture, .live]
        ),
        CallFrameDesign(
            id: "morbide.crypte.groupe",
            motif: "morbide.crypte",
            mood: .morbide,
            name: "Crypte",
            bucket: .groupe,
            look: CallFrameLook(
                layout: CallFrameLayout(arrangement: .tiers, margin: 0.06, gap: 0.025, top: 0.16, bottom: 0.11),
                slot: CallFrameSlotStyle(shape: .circle, radius: nil, stroke: CallFrameStroke(color: "#9D7BD8", width: 0.006), double: false, glow: "#7B2CBFAA", shadow: false, card: nil, tilt: .none, tone: .mono, duotone: nil),
                background: .linear(colors: ["#1E0F33", "#0E0718", "#050208"], angle: 0.0),
                pattern: CallFramePattern(kind: .damask, color: "#7B2CBF", opacity: 0.18),
                border: nil,
                ornaments: [
                    CallFrameOrnament(kind: .cobwebs, color: "#CDBDF0", density: .mid, layer: .front),
                    CallFrameOrnament(kind: .runes, color: "#B388FF", density: .low, layer: .back, motion: .loop),
                    CallFrameOrnament(kind: .candles, color: "#C084FC", density: .mid, layer: .front, motion: .loop),
                    CallFrameOrnament(kind: .bats, color: "#B388FF", density: .low, layer: .front, motion: .loop)
                ],
                brand: CallFrameBrand(mark: .both, place: .bottom, color: "#CDBDF0", size: .s, font: StoryTextStyle.fantasy),
                names: CallFrameNames(show: .handle, style: .badge, font: .fantasy, color: "#F3E8FF", fill: "#1E0F33D9"),
                title: CallFrameTitle(source: .group, font: .fantasy, color: "#E9D5FF", place: .top, size: .l, effect: CallFrameTextEffect.glow, letterCase: CallFrameLetterCase.upper),
                subtitle: nil
            ),
            surfaces: [.capture, .live]
        ),
        CallFrameDesign(
            id: "morbide.crypte.tablee",
            motif: "morbide.crypte",
            mood: .morbide,
            name: "Crypte",
            bucket: .tablee,
            look: CallFrameLook(
                layout: CallFrameLayout(arrangement: .grid, margin: 0.05, gap: 0.02, top: 0.15, bottom: 0.12),
                slot: CallFrameSlotStyle(shape: .circle, radius: nil, stroke: CallFrameStroke(color: "#9D7BD8", width: 0.005), double: false, glow: "#7B2CBF88", shadow: false, card: nil, tilt: .none, tone: .mono, duotone: nil),
                background: .linear(colors: ["#1E0F33", "#0E0718", "#050208"], angle: 0.0),
                pattern: CallFramePattern(kind: .damask, color: "#7B2CBF", opacity: 0.18),
                border: nil,
                ornaments: [
                    CallFrameOrnament(kind: .cobwebs, color: "#CDBDF0", density: .mid, layer: .front),
                    CallFrameOrnament(kind: .runes, color: "#B388FF", density: .low, layer: .back, motion: .loop),
                    CallFrameOrnament(kind: .bats, color: "#B388FF", density: .low, layer: .front, motion: .loop)
                ],
                brand: CallFrameBrand(mark: .both, place: .bottom, color: "#CDBDF0", size: .s, font: StoryTextStyle.fantasy),
                names: CallFrameNames(show: .handle, style: .list, font: .fantasy, color: "#E9D5FF", fill: nil),
                title: CallFrameTitle(source: .group, font: .fantasy, color: "#E9D5FF", place: .top, size: .l, effect: CallFrameTextEffect.glow, letterCase: CallFrameLetterCase.upper),
                subtitle: nil
            ),
            surfaces: [.capture, .live]
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
            ),
            surfaces: [.capture, .live]
        ),
        CallFrameDesign(
            id: "morbide.tombe.duo",
            motif: "morbide.tombe",
            mood: .morbide,
            name: "Tombe",
            bucket: .duo,
            look: CallFrameLook(
                layout: CallFrameLayout(arrangement: .row, margin: 0.08, gap: 0.06, top: 0.17, bottom: 0.11),
                slot: CallFrameSlotStyle(shape: .arch, radius: nil, stroke: CallFrameStroke(color: "#9AA3AB", width: 0.026), double: true, glow: nil, shadow: true, card: nil, tilt: .none, tone: .mono, duotone: nil),
                background: .linear(colors: ["#6B6F8E", "#2C2F4A", "#14172A", "#1E2B20"], angle: 0.0),
                pattern: CallFramePattern(kind: .grain, color: "#FFFFFF", opacity: 0.06),
                border: CallFrameBorder(kind: .vines, color: "#4E6B3C", width: 0.008, inset: 0.02),
                ornaments: [
                    CallFrameOrnament(kind: .moon, color: "#F4ECCF", density: .low, layer: .front, motion: .loop),
                    CallFrameOrnament(kind: .bats, color: "#0A0B14", density: .mid, layer: .front, motion: .loop),
                    CallFrameOrnament(kind: .fireflies, color: "#BFFFD9", density: .low, layer: .back, motion: .loop),
                    CallFrameOrnament(kind: .candles, color: "#FFB347", density: .mid, layer: .front, motion: .loop)
                ],
                brand: CallFrameBrand(mark: .both, place: .bottom, color: "#C9D0D6", size: .s, font: StoryTextStyle.elegant),
                names: CallFrameNames(show: .name, style: .plate, font: .elegant, color: "#1F2326", fill: "#B8C0C7E6"),
                title: CallFrameTitle(source: .names, font: .fantasy, color: "#E3E7EA", place: .top, size: .m, effect: CallFrameTextEffect.shadow, letterCase: CallFrameLetterCase.upper),
                subtitle: CallFrameTitle(source: .date, font: .elegant, color: "#AEB6BD", place: .top, size: .s, effect: nil, letterCase: CallFrameLetterCase.upper)
            ),
            surfaces: [.capture, .live]
        ),
        CallFrameDesign(
            id: "morbide.tombe.comite",
            motif: "morbide.tombe",
            mood: .morbide,
            name: "Tombe",
            bucket: .comite,
            look: CallFrameLook(
                layout: CallFrameLayout(arrangement: .grid, margin: 0.07, gap: 0.035, top: 0.17, bottom: 0.11),
                slot: CallFrameSlotStyle(shape: .arch, radius: nil, stroke: CallFrameStroke(color: "#9AA3AB", width: 0.026), double: true, glow: nil, shadow: true, card: nil, tilt: .none, tone: .mono, duotone: nil),
                background: .linear(colors: ["#6B6F8E", "#2C2F4A", "#14172A", "#1E2B20"], angle: 0.0),
                pattern: CallFramePattern(kind: .grain, color: "#FFFFFF", opacity: 0.06),
                border: CallFrameBorder(kind: .vines, color: "#4E6B3C", width: 0.008, inset: 0.02),
                ornaments: [
                    CallFrameOrnament(kind: .moon, color: "#F4ECCF", density: .low, layer: .front, motion: .loop),
                    CallFrameOrnament(kind: .bats, color: "#0A0B14", density: .mid, layer: .front, motion: .loop),
                    CallFrameOrnament(kind: .fireflies, color: "#BFFFD9", density: .low, layer: .back, motion: .loop),
                    CallFrameOrnament(kind: .candles, color: "#FFB347", density: .mid, layer: .front, motion: .loop)
                ],
                brand: CallFrameBrand(mark: .both, place: .bottom, color: "#C9D0D6", size: .s, font: StoryTextStyle.elegant),
                names: CallFrameNames(show: .name, style: .plate, font: .elegant, color: "#1F2326", fill: "#B8C0C7E6"),
                title: CallFrameTitle(source: .group, font: .fantasy, color: "#E3E7EA", place: .top, size: .m, effect: CallFrameTextEffect.shadow, letterCase: CallFrameLetterCase.upper),
                subtitle: CallFrameTitle(source: .date, font: .elegant, color: "#AEB6BD", place: .top, size: .s, effect: nil, letterCase: CallFrameLetterCase.upper)
            ),
            surfaces: [.capture, .live]
        ),
        CallFrameDesign(
            id: "morbide.tombe.groupe",
            motif: "morbide.tombe",
            mood: .morbide,
            name: "Tombe",
            bucket: .groupe,
            look: CallFrameLook(
                layout: CallFrameLayout(arrangement: .grid, margin: 0.06, gap: 0.03, top: 0.16, bottom: 0.11),
                slot: CallFrameSlotStyle(shape: .arch, radius: nil, stroke: CallFrameStroke(color: "#9AA3AB", width: 0.018), double: true, glow: nil, shadow: true, card: nil, tilt: .none, tone: .mono, duotone: nil),
                background: .linear(colors: ["#6B6F8E", "#2C2F4A", "#14172A", "#1E2B20"], angle: 0.0),
                pattern: CallFramePattern(kind: .grain, color: "#FFFFFF", opacity: 0.06),
                border: CallFrameBorder(kind: .vines, color: "#4E6B3C", width: 0.008, inset: 0.02),
                ornaments: [
                    CallFrameOrnament(kind: .moon, color: "#F4ECCF", density: .low, layer: .front, motion: .loop),
                    CallFrameOrnament(kind: .bats, color: "#0A0B14", density: .mid, layer: .front, motion: .loop),
                    CallFrameOrnament(kind: .fireflies, color: "#BFFFD9", density: .low, layer: .back, motion: .loop),
                    CallFrameOrnament(kind: .candles, color: "#FFB347", density: .mid, layer: .front, motion: .loop)
                ],
                brand: CallFrameBrand(mark: .both, place: .bottom, color: "#C9D0D6", size: .s, font: StoryTextStyle.elegant),
                names: CallFrameNames(show: .name, style: .plate, font: .elegant, color: "#1F2326", fill: "#B8C0C7E6"),
                title: CallFrameTitle(source: .group, font: .fantasy, color: "#E3E7EA", place: .top, size: .m, effect: CallFrameTextEffect.shadow, letterCase: CallFrameLetterCase.upper),
                subtitle: CallFrameTitle(source: .date, font: .elegant, color: "#AEB6BD", place: .top, size: .s, effect: nil, letterCase: CallFrameLetterCase.upper)
            ),
            surfaces: [.capture, .live]
        ),
        CallFrameDesign(
            id: "morbide.tombe.tablee",
            motif: "morbide.tombe",
            mood: .morbide,
            name: "Tombe",
            bucket: .tablee,
            look: CallFrameLook(
                layout: CallFrameLayout(arrangement: .grid, margin: 0.05, gap: 0.025, top: 0.15, bottom: 0.12),
                slot: CallFrameSlotStyle(shape: .arch, radius: nil, stroke: CallFrameStroke(color: "#9AA3AB", width: 0.012), double: false, glow: nil, shadow: true, card: nil, tilt: .none, tone: .mono, duotone: nil),
                background: .linear(colors: ["#6B6F8E", "#2C2F4A", "#14172A", "#1E2B20"], angle: 0.0),
                pattern: CallFramePattern(kind: .grain, color: "#FFFFFF", opacity: 0.06),
                border: CallFrameBorder(kind: .vines, color: "#4E6B3C", width: 0.008, inset: 0.02),
                ornaments: [
                    CallFrameOrnament(kind: .moon, color: "#F4ECCF", density: .low, layer: .front, motion: .loop),
                    CallFrameOrnament(kind: .bats, color: "#0A0B14", density: .mid, layer: .front, motion: .loop),
                    CallFrameOrnament(kind: .fireflies, color: "#BFFFD9", density: .low, layer: .back, motion: .loop),
                    CallFrameOrnament(kind: .candles, color: "#FFB347", density: .mid, layer: .front, motion: .loop)
                ],
                brand: CallFrameBrand(mark: .both, place: .bottom, color: "#C9D0D6", size: .s, font: StoryTextStyle.elegant),
                names: CallFrameNames(show: .name, style: .plate, font: .elegant, color: "#1F2326", fill: "#B8C0C7E6"),
                title: CallFrameTitle(source: .group, font: .fantasy, color: "#E3E7EA", place: .top, size: .m, effect: CallFrameTextEffect.shadow, letterCase: CallFrameLetterCase.upper),
                subtitle: CallFrameTitle(source: .date, font: .elegant, color: "#AEB6BD", place: .top, size: .s, effect: nil, letterCase: CallFrameLetterCase.upper)
            ),
            surfaces: [.capture, .live]
        )
    ]
}
