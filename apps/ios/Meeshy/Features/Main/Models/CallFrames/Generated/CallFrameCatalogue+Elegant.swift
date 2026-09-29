// GÉNÉRÉ — ne pas éditer; source: packages/shared/design/call-capture-frames
// Régénérer : `cd packages/shared && bun run generate:call-frames`.
// Fraîcheur gardée par packages/shared/__tests__/call-capture-frames-swift.test.ts.

import MeeshySDK

nonisolated extension CallFrameCatalogue {
    static let elegantFrames: [CallFrameDesign] = [
        CallFrameDesign(
            id: "elegant.gala.duo",
            motif: "elegant.gala",
            mood: .elegant,
            name: "Gala",
            bucket: .duo,
            look: CallFrameLook(
                layout: CallFrameLayout(arrangement: .column, margin: 0.08, gap: 0.04, top: 0.22, bottom: 0.14),
                slot: CallFrameSlotStyle(shape: .arch, radius: nil, stroke: CallFrameStroke(color: "#C9A45C", width: 0.006), double: true, glow: nil, shadow: false, card: nil, tilt: .none, tone: .warm, duotone: nil),
                background: .radial(colors: ["#1F1A12", "#0B0B0F"]),
                pattern: nil,
                border: CallFrameBorder(kind: .deco, color: "#C9A45C", width: 0.006, inset: 0.03),
                ornaments: [
                    CallFrameOrnament(kind: .bokeh, color: "#C9A45C55", density: .mid, layer: .back),
                    CallFrameOrnament(kind: .sparkles, color: "#F3E3B5", density: .low, layer: .front)
                ],
                brand: CallFrameBrand(mark: .both, place: .bottom, color: "#C9A45C", size: .m, font: StoryTextStyle.elegant),
                names: CallFrameNames(show: .name, style: .caption, font: .elegant, color: "#F3E3B5", fill: nil),
                title: CallFrameTitle(source: .names, font: .calligraphy, color: "#F3E3B5", place: .top, size: .l, effect: CallFrameTextEffect.glow, letterCase: nil),
                subtitle: CallFrameTitle(source: .date, font: .elegant, color: "#C9A45C", place: .top, size: .s, effect: nil, letterCase: CallFrameLetterCase.upper)
            )
        ),
        CallFrameDesign(
            id: "elegant.gala.comite",
            motif: "elegant.gala",
            mood: .elegant,
            name: "Gala",
            bucket: .comite,
            look: CallFrameLook(
                layout: CallFrameLayout(arrangement: .arch, margin: 0.07, gap: 0.03, top: 0.2, bottom: 0.14),
                slot: CallFrameSlotStyle(shape: .arch, radius: nil, stroke: CallFrameStroke(color: "#C9A45C", width: 0.006), double: true, glow: nil, shadow: false, card: nil, tilt: .none, tone: .warm, duotone: nil),
                background: .radial(colors: ["#1F1A12", "#0B0B0F"]),
                pattern: nil,
                border: CallFrameBorder(kind: .deco, color: "#C9A45C", width: 0.006, inset: 0.03),
                ornaments: [
                    CallFrameOrnament(kind: .bokeh, color: "#C9A45C55", density: .mid, layer: .back),
                    CallFrameOrnament(kind: .sparkles, color: "#F3E3B5", density: .low, layer: .front)
                ],
                brand: CallFrameBrand(mark: .both, place: .bottom, color: "#C9A45C", size: .m, font: StoryTextStyle.elegant),
                names: CallFrameNames(show: .name, style: .caption, font: .elegant, color: "#F3E3B5", fill: nil),
                title: CallFrameTitle(source: .group, font: .calligraphy, color: "#F3E3B5", place: .top, size: .l, effect: CallFrameTextEffect.glow, letterCase: nil),
                subtitle: CallFrameTitle(source: .date, font: .elegant, color: "#C9A45C", place: .top, size: .s, effect: nil, letterCase: CallFrameLetterCase.upper)
            )
        ),
        CallFrameDesign(
            id: "elegant.gala.groupe",
            motif: "elegant.gala",
            mood: .elegant,
            name: "Gala",
            bucket: .groupe,
            look: CallFrameLook(
                layout: CallFrameLayout(arrangement: .tiers, margin: 0.06, gap: 0.02, top: 0.18, bottom: 0.12),
                slot: CallFrameSlotStyle(shape: .arch, radius: nil, stroke: CallFrameStroke(color: "#C9A45C", width: 0.006), double: true, glow: nil, shadow: false, card: nil, tilt: .none, tone: .warm, duotone: nil),
                background: .radial(colors: ["#1F1A12", "#0B0B0F"]),
                pattern: nil,
                border: CallFrameBorder(kind: .deco, color: "#C9A45C", width: 0.006, inset: 0.03),
                ornaments: [
                    CallFrameOrnament(kind: .bokeh, color: "#C9A45C55", density: .mid, layer: .back),
                    CallFrameOrnament(kind: .sparkles, color: "#F3E3B5", density: .low, layer: .front)
                ],
                brand: CallFrameBrand(mark: .both, place: .bottom, color: "#C9A45C", size: .m, font: StoryTextStyle.elegant),
                names: CallFrameNames(show: .name, style: .badge, font: .elegant, color: "#F3E3B5", fill: "#0B0B0FD9"),
                title: CallFrameTitle(source: .group, font: .calligraphy, color: "#F3E3B5", place: .top, size: .l, effect: CallFrameTextEffect.glow, letterCase: nil),
                subtitle: CallFrameTitle(source: .date, font: .elegant, color: "#C9A45C", place: .top, size: .s, effect: nil, letterCase: CallFrameLetterCase.upper)
            )
        ),
        CallFrameDesign(
            id: "elegant.gala.tablee",
            motif: "elegant.gala",
            mood: .elegant,
            name: "Gala",
            bucket: .tablee,
            look: CallFrameLook(
                layout: CallFrameLayout(arrangement: .tiers, margin: 0.05, gap: 0.015, top: 0.16, bottom: 0.1),
                slot: CallFrameSlotStyle(shape: .arch, radius: nil, stroke: CallFrameStroke(color: "#C9A45C", width: 0.004), double: false, glow: nil, shadow: false, card: nil, tilt: .none, tone: .warm, duotone: nil),
                background: .radial(colors: ["#1F1A12", "#0B0B0F"]),
                pattern: nil,
                border: CallFrameBorder(kind: .deco, color: "#C9A45C", width: 0.006, inset: 0.03),
                ornaments: [
                    CallFrameOrnament(kind: .bokeh, color: "#C9A45C55", density: .mid, layer: .back),
                    CallFrameOrnament(kind: .sparkles, color: "#F3E3B5", density: .low, layer: .front)
                ],
                brand: CallFrameBrand(mark: .both, place: .bottom, color: "#C9A45C", size: .m, font: StoryTextStyle.elegant),
                names: CallFrameNames(show: .none, style: .badge, font: .elegant, color: "#F3E3B5", fill: nil),
                title: CallFrameTitle(source: .group, font: .calligraphy, color: "#F3E3B5", place: .top, size: .l, effect: CallFrameTextEffect.glow, letterCase: nil),
                subtitle: CallFrameTitle(source: .date, font: .elegant, color: "#C9A45C", place: .top, size: .s, effect: nil, letterCase: CallFrameLetterCase.upper)
            )
        ),
        CallFrameDesign(
            id: "elegant.art-deco.duo",
            motif: "elegant.art-deco",
            mood: .elegant,
            name: "Art déco",
            bucket: .duo,
            look: CallFrameLook(
                layout: CallFrameLayout(arrangement: .split, margin: 0.08, gap: 0.025, top: 0.14, bottom: 0.12),
                slot: CallFrameSlotStyle(shape: .rect, radius: nil, stroke: CallFrameStroke(color: "#C9A45C", width: 0.005), double: true, glow: nil, shadow: false, card: nil, tilt: .none, tone: .mono, duotone: nil),
                background: .solid(color: "#0B0B0F"),
                pattern: CallFramePattern(kind: .sunburst, color: "#C9A45C", opacity: 0.08),
                border: CallFrameBorder(kind: .double, color: "#C9A45C", width: 0.006, inset: 0.025),
                ornaments: [
                    CallFrameOrnament(kind: .rays, color: "#C9A45C1F", density: .low, layer: .back)
                ],
                brand: CallFrameBrand(mark: .logo, place: .top, color: "#C9A45C", size: .m, font: nil),
                names: CallFrameNames(show: .handle, style: .plate, font: .poster, color: "#0B0B0F", fill: "#C9A45CF2"),
                title: CallFrameTitle(source: .names, font: .poster, color: "#F3E3B5", place: .bottom, size: .m, effect: nil, letterCase: CallFrameLetterCase.upper),
                subtitle: nil
            )
        ),
        CallFrameDesign(
            id: "elegant.art-deco.comite",
            motif: "elegant.art-deco",
            mood: .elegant,
            name: "Art déco",
            bucket: .comite,
            look: CallFrameLook(
                layout: CallFrameLayout(arrangement: .grid, margin: 0.07, gap: 0.02, top: 0.16, bottom: 0.12),
                slot: CallFrameSlotStyle(shape: .rect, radius: nil, stroke: CallFrameStroke(color: "#C9A45C", width: 0.005), double: true, glow: nil, shadow: false, card: nil, tilt: .none, tone: .mono, duotone: nil),
                background: .solid(color: "#0B0B0F"),
                pattern: CallFramePattern(kind: .sunburst, color: "#C9A45C", opacity: 0.08),
                border: CallFrameBorder(kind: .double, color: "#C9A45C", width: 0.006, inset: 0.025),
                ornaments: [
                    CallFrameOrnament(kind: .rays, color: "#C9A45C1F", density: .low, layer: .back)
                ],
                brand: CallFrameBrand(mark: .logo, place: .top, color: "#C9A45C", size: .m, font: nil),
                names: CallFrameNames(show: .handle, style: .plate, font: .poster, color: "#0B0B0F", fill: "#C9A45CF2"),
                title: CallFrameTitle(source: .group, font: .poster, color: "#F3E3B5", place: .bottom, size: .m, effect: nil, letterCase: CallFrameLetterCase.upper),
                subtitle: nil
            )
        ),
        CallFrameDesign(
            id: "elegant.art-deco.groupe",
            motif: "elegant.art-deco",
            mood: .elegant,
            name: "Art déco",
            bucket: .groupe,
            look: CallFrameLook(
                layout: CallFrameLayout(arrangement: .honeycomb, margin: 0.06, gap: 0.015, top: 0.14, bottom: 0.12),
                slot: CallFrameSlotStyle(shape: .hex, radius: nil, stroke: CallFrameStroke(color: "#C9A45C", width: 0.005), double: false, glow: nil, shadow: false, card: nil, tilt: .none, tone: .mono, duotone: nil),
                background: .solid(color: "#0B0B0F"),
                pattern: CallFramePattern(kind: .sunburst, color: "#C9A45C", opacity: 0.08),
                border: CallFrameBorder(kind: .double, color: "#C9A45C", width: 0.006, inset: 0.025),
                ornaments: [
                    CallFrameOrnament(kind: .rays, color: "#C9A45C1F", density: .low, layer: .back)
                ],
                brand: CallFrameBrand(mark: .logo, place: .top, color: "#C9A45C", size: .m, font: nil),
                names: CallFrameNames(show: .handle, style: .badge, font: .poster, color: "#0B0B0F", fill: "#C9A45CF2"),
                title: CallFrameTitle(source: .group, font: .poster, color: "#F3E3B5", place: .bottom, size: .m, effect: nil, letterCase: CallFrameLetterCase.upper),
                subtitle: nil
            )
        ),
        CallFrameDesign(
            id: "elegant.art-deco.tablee",
            motif: "elegant.art-deco",
            mood: .elegant,
            name: "Art déco",
            bucket: .tablee,
            look: CallFrameLook(
                layout: CallFrameLayout(arrangement: .honeycomb, margin: 0.05, gap: 0.01, top: 0.12, bottom: 0.1),
                slot: CallFrameSlotStyle(shape: .hex, radius: nil, stroke: CallFrameStroke(color: "#C9A45C", width: 0.004), double: false, glow: nil, shadow: false, card: nil, tilt: .none, tone: .mono, duotone: nil),
                background: .solid(color: "#0B0B0F"),
                pattern: CallFramePattern(kind: .sunburst, color: "#C9A45C", opacity: 0.08),
                border: CallFrameBorder(kind: .double, color: "#C9A45C", width: 0.006, inset: 0.025),
                ornaments: [
                    CallFrameOrnament(kind: .rays, color: "#C9A45C1F", density: .low, layer: .back)
                ],
                brand: CallFrameBrand(mark: .logo, place: .top, color: "#C9A45C", size: .m, font: nil),
                names: CallFrameNames(show: .none, style: .badge, font: .poster, color: "#0B0B0F", fill: nil),
                title: CallFrameTitle(source: .group, font: .poster, color: "#F3E3B5", place: .bottom, size: .m, effect: nil, letterCase: CallFrameLetterCase.upper),
                subtitle: nil
            )
        ),
        CallFrameDesign(
            id: "elegant.opera.duo",
            motif: "elegant.opera",
            mood: .elegant,
            name: "Opéra",
            bucket: .duo,
            look: CallFrameLook(
                layout: CallFrameLayout(arrangement: .diagonal, margin: 0.07, gap: 0.03, top: 0.16, bottom: 0.12),
                slot: CallFrameSlotStyle(shape: .round, radius: 0.06, stroke: CallFrameStroke(color: "#C9A45C", width: 0.005), double: false, glow: nil, shadow: true, card: nil, tilt: .none, tone: .warm, duotone: nil),
                background: .linear(colors: ["#3B0A10", "#1C0508", "#0B0B0F"], angle: 0.0),
                pattern: CallFramePattern(kind: .damask, color: "#C9A45C", opacity: 0.06),
                border: CallFrameBorder(kind: .bulbs, color: "#F3E3B5", width: 0.01, inset: 0.025),
                ornaments: [
                    CallFrameOrnament(kind: .candles, color: "#F3E3B5", density: .low, layer: .front)
                ],
                brand: CallFrameBrand(mark: .wordmark, place: .bottomRight, color: "#F3E3B5", size: .m, font: StoryTextStyle.elegant),
                names: CallFrameNames(show: .handle, style: .ribbon, font: .italic, color: "#0B0B0F", fill: "#C9A45C"),
                title: CallFrameTitle(source: .names, font: .calligraphy, color: "#F3E3B5", place: .top, size: .l, effect: CallFrameTextEffect.shadow, letterCase: nil),
                subtitle: CallFrameTitle(source: .date, font: .italic, color: "#C9A45C", place: .top, size: .s, effect: nil, letterCase: nil)
            )
        ),
        CallFrameDesign(
            id: "elegant.opera.comite",
            motif: "elegant.opera",
            mood: .elegant,
            name: "Opéra",
            bucket: .comite,
            look: CallFrameLook(
                layout: CallFrameLayout(arrangement: .hero, margin: 0.07, gap: 0.03, top: 0.16, bottom: 0.12),
                slot: CallFrameSlotStyle(shape: .arch, radius: nil, stroke: CallFrameStroke(color: "#C9A45C", width: 0.005), double: false, glow: "#C9A45C66", shadow: false, card: nil, tilt: .none, tone: .warm, duotone: nil),
                background: .linear(colors: ["#3B0A10", "#1C0508", "#0B0B0F"], angle: 0.0),
                pattern: CallFramePattern(kind: .damask, color: "#C9A45C", opacity: 0.06),
                border: CallFrameBorder(kind: .bulbs, color: "#F3E3B5", width: 0.01, inset: 0.025),
                ornaments: [
                    CallFrameOrnament(kind: .candles, color: "#F3E3B5", density: .low, layer: .front),
                    CallFrameOrnament(kind: .crown, color: "#D4AF37", density: .low, layer: .front)
                ],
                brand: CallFrameBrand(mark: .wordmark, place: .bottomRight, color: "#F3E3B5", size: .m, font: StoryTextStyle.elegant),
                names: CallFrameNames(show: .handle, style: .ribbon, font: .italic, color: "#0B0B0F", fill: "#C9A45C"),
                title: CallFrameTitle(source: .group, font: .calligraphy, color: "#F3E3B5", place: .top, size: .l, effect: CallFrameTextEffect.shadow, letterCase: nil),
                subtitle: CallFrameTitle(source: .date, font: .italic, color: "#C9A45C", place: .top, size: .s, effect: nil, letterCase: nil)
            )
        ),
        CallFrameDesign(
            id: "elegant.opera.groupe",
            motif: "elegant.opera",
            mood: .elegant,
            name: "Opéra",
            bucket: .groupe,
            look: CallFrameLook(
                layout: CallFrameLayout(arrangement: .grid, margin: 0.06, gap: 0.025, top: 0.16, bottom: 0.12),
                slot: CallFrameSlotStyle(shape: .arch, radius: nil, stroke: CallFrameStroke(color: "#C9A45C", width: 0.005), double: false, glow: "#C9A45C66", shadow: false, card: nil, tilt: .none, tone: .warm, duotone: nil),
                background: .linear(colors: ["#3B0A10", "#1C0508", "#0B0B0F"], angle: 0.0),
                pattern: CallFramePattern(kind: .damask, color: "#C9A45C", opacity: 0.06),
                border: CallFrameBorder(kind: .bulbs, color: "#F3E3B5", width: 0.01, inset: 0.025),
                ornaments: [
                    CallFrameOrnament(kind: .candles, color: "#F3E3B5", density: .low, layer: .front)
                ],
                brand: CallFrameBrand(mark: .wordmark, place: .bottomRight, color: "#F3E3B5", size: .m, font: StoryTextStyle.elegant),
                names: CallFrameNames(show: .handle, style: .badge, font: .italic, color: "#0B0B0F", fill: "#C9A45CF2"),
                title: CallFrameTitle(source: .group, font: .calligraphy, color: "#F3E3B5", place: .top, size: .l, effect: CallFrameTextEffect.shadow, letterCase: nil),
                subtitle: CallFrameTitle(source: .date, font: .italic, color: "#C9A45C", place: .top, size: .s, effect: nil, letterCase: nil)
            )
        ),
        CallFrameDesign(
            id: "elegant.tete-a-tete.duo",
            motif: "elegant.tete-a-tete",
            mood: .elegant,
            name: "Tête-à-tête",
            bucket: .duo,
            look: CallFrameLook(
                layout: CallFrameLayout(arrangement: .row, margin: 0.1, gap: 0.05, top: 0.18, bottom: 0.14),
                slot: CallFrameSlotStyle(shape: .circle, radius: nil, stroke: CallFrameStroke(color: "#C9A45C", width: 0.006), double: true, glow: "#F3E3B566", shadow: false, card: nil, tilt: .none, tone: .warm, duotone: nil),
                background: .radial(colors: ["#1A1712", "#0B0B0F"]),
                pattern: nil,
                border: nil,
                ornaments: [
                    CallFrameOrnament(kind: .bokeh, color: "#F3E3B544", density: .high, layer: .back),
                    CallFrameOrnament(kind: .sparkles, color: "#C9A45C", density: .mid, layer: .front)
                ],
                brand: CallFrameBrand(mark: .both, place: .bottomLeft, color: "#C9A45C", size: .s, font: StoryTextStyle.elegant),
                names: CallFrameNames(show: .name, style: .caption, font: .italic, color: "#F3E3B5", fill: nil),
                title: CallFrameTitle(source: .names, font: .calligraphy, color: "#F3E3B5", place: .top, size: .l, effect: CallFrameTextEffect.glow, letterCase: nil),
                subtitle: CallFrameTitle(source: .date, font: .elegant, color: "#C9A45C", place: .top, size: .s, effect: nil, letterCase: CallFrameLetterCase.upper)
            )
        )
    ]
}
