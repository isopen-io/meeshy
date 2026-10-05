// GÉNÉRÉ — ne pas éditer; source: packages/shared/design/call-capture-frames
// Régénérer : `cd packages/shared && bun run generate:call-frames`.
// Fraîcheur gardée par packages/shared/__tests__/call-capture-frames-swift.test.ts.

import MeeshySDK

nonisolated extension CallFrameCatalogue {
    static let corporateFrames: [CallFrameDesign] = [
        CallFrameDesign(
            id: "corporate.conseil.duo",
            motif: "corporate.conseil",
            mood: .corporate,
            name: "Conseil",
            bucket: .duo,
            look: CallFrameLook(
                layout: CallFrameLayout(arrangement: .row, margin: 0.08, gap: 0.02, top: 0.14, bottom: 0.1),
                slot: CallFrameSlotStyle(shape: .rect, radius: nil, stroke: CallFrameStroke(color: "#334155", width: 0.006), double: false, glow: nil, shadow: false, card: nil, tilt: .none, tone: .color, duotone: nil),
                background: .solid(color: "#0F1C2E"),
                pattern: CallFramePattern(kind: .grid, color: "#334155", opacity: 0.18),
                border: CallFrameBorder(kind: .hairline, color: "#14B8A6", width: 0.004, inset: 0.03),
                ornaments: [],
                brand: CallFrameBrand(mark: .both, place: .bottomRight, color: "#FFFFFF", size: .s, font: nil),
                names: CallFrameNames(show: .both, style: .plate, font: .bold, color: "#FFFFFF", fill: "#0F1C2ED9"),
                title: CallFrameTitle(source: .names, font: .poster, color: "#FFFFFF", place: .top, size: .m, effect: nil, letterCase: CallFrameLetterCase.upper),
                subtitle: CallFrameTitle(source: .date, font: .classic, color: "#94A3B8", place: .top, size: .s, effect: nil, letterCase: nil)
            )
        ),
        CallFrameDesign(
            id: "corporate.conseil.comite",
            motif: "corporate.conseil",
            mood: .corporate,
            name: "Conseil",
            bucket: .comite,
            look: CallFrameLook(
                layout: CallFrameLayout(arrangement: .grid, margin: 0.06, gap: 0.015, top: 0.14, bottom: 0.1),
                slot: CallFrameSlotStyle(shape: .rect, radius: nil, stroke: CallFrameStroke(color: "#334155", width: 0.006), double: false, glow: nil, shadow: false, card: nil, tilt: .none, tone: .color, duotone: nil),
                background: .solid(color: "#0F1C2E"),
                pattern: CallFramePattern(kind: .grid, color: "#334155", opacity: 0.18),
                border: CallFrameBorder(kind: .hairline, color: "#14B8A6", width: 0.004, inset: 0.03),
                ornaments: [],
                brand: CallFrameBrand(mark: .both, place: .bottomRight, color: "#FFFFFF", size: .s, font: nil),
                names: CallFrameNames(show: .both, style: .plate, font: .bold, color: "#FFFFFF", fill: "#0F1C2ED9"),
                title: CallFrameTitle(source: .group, font: .poster, color: "#FFFFFF", place: .top, size: .m, effect: nil, letterCase: CallFrameLetterCase.upper),
                subtitle: CallFrameTitle(source: .date, font: .classic, color: "#94A3B8", place: .top, size: .s, effect: nil, letterCase: nil)
            )
        ),
        CallFrameDesign(
            id: "corporate.conseil.groupe",
            motif: "corporate.conseil",
            mood: .corporate,
            name: "Conseil",
            bucket: .groupe,
            look: CallFrameLook(
                layout: CallFrameLayout(arrangement: .hero, margin: 0.05, gap: 0.015, top: 0.12, bottom: 0.16),
                slot: CallFrameSlotStyle(shape: .rect, radius: nil, stroke: CallFrameStroke(color: "#334155", width: 0.006), double: false, glow: nil, shadow: false, card: nil, tilt: .none, tone: .color, duotone: nil),
                background: .solid(color: "#0F1C2E"),
                pattern: CallFramePattern(kind: .grid, color: "#334155", opacity: 0.18),
                border: CallFrameBorder(kind: .hairline, color: "#14B8A6", width: 0.004, inset: 0.03),
                ornaments: [],
                brand: CallFrameBrand(mark: .both, place: .bottomRight, color: "#FFFFFF", size: .s, font: nil),
                names: CallFrameNames(show: .both, style: .list, font: .classic, color: "#E2E8F0", fill: nil),
                title: CallFrameTitle(source: .group, font: .poster, color: "#FFFFFF", place: .top, size: .m, effect: nil, letterCase: CallFrameLetterCase.upper),
                subtitle: CallFrameTitle(source: .date, font: .classic, color: "#94A3B8", place: .top, size: .s, effect: nil, letterCase: nil)
            )
        ),
        CallFrameDesign(
            id: "corporate.conseil.tablee",
            motif: "corporate.conseil",
            mood: .corporate,
            name: "Conseil",
            bucket: .tablee,
            look: CallFrameLook(
                layout: CallFrameLayout(arrangement: .grid, margin: 0.05, gap: 0.01, top: 0.12, bottom: 0.08),
                slot: CallFrameSlotStyle(shape: .rect, radius: nil, stroke: CallFrameStroke(color: "#334155", width: 0.006), double: false, glow: nil, shadow: false, card: nil, tilt: .none, tone: .color, duotone: nil),
                background: .solid(color: "#0F1C2E"),
                pattern: CallFramePattern(kind: .grid, color: "#334155", opacity: 0.18),
                border: CallFrameBorder(kind: .hairline, color: "#14B8A6", width: 0.004, inset: 0.03),
                ornaments: [],
                brand: CallFrameBrand(mark: .both, place: .bottomRight, color: "#FFFFFF", size: .s, font: nil),
                names: CallFrameNames(show: .handle, style: .plate, font: .bold, color: "#FFFFFF", fill: "#0F1C2ED9"),
                title: CallFrameTitle(source: .group, font: .poster, color: "#FFFFFF", place: .top, size: .m, effect: nil, letterCase: CallFrameLetterCase.upper),
                subtitle: CallFrameTitle(source: .date, font: .classic, color: "#94A3B8", place: .bottom, size: .s, effect: nil, letterCase: nil)
            )
        ),
        CallFrameDesign(
            id: "corporate.keynote.duo",
            motif: "corporate.keynote",
            mood: .corporate,
            name: "Keynote",
            bucket: .duo,
            look: CallFrameLook(
                layout: CallFrameLayout(arrangement: .hero, margin: 0.07, gap: 0.03, top: 0.16, bottom: 0.1),
                slot: CallFrameSlotStyle(shape: .round, radius: 0.05, stroke: nil, double: false, glow: "#6366F166", shadow: false, card: nil, tilt: .none, tone: .color, duotone: nil),
                background: .radial(colors: ["#243248", "#0F1C2E", "#0A1320"]),
                pattern: nil,
                border: nil,
                ornaments: [
                    CallFrameOrnament(kind: .rays, color: "#6366F1", density: .low, layer: .back),
                    CallFrameOrnament(kind: .vignette, color: "#000000", density: .mid, layer: .back)
                ],
                brand: CallFrameBrand(mark: .wordmark, place: .topLeft, color: "#FFFFFF", size: .s, font: StoryTextStyle.poster),
                names: CallFrameNames(show: .name, style: .plate, font: .bold, color: "#FFFFFF", fill: "#0F1C2ED9"),
                title: CallFrameTitle(source: .names, font: .poster, color: "#FFFFFF", place: .top, size: .l, effect: nil, letterCase: CallFrameLetterCase.upper),
                subtitle: CallFrameTitle(source: .date, font: .classic, color: "#A5B4FC", place: .top, size: .s, effect: nil, letterCase: nil)
            )
        ),
        CallFrameDesign(
            id: "corporate.keynote.comite",
            motif: "corporate.keynote",
            mood: .corporate,
            name: "Keynote",
            bucket: .comite,
            look: CallFrameLook(
                layout: CallFrameLayout(arrangement: .arch, margin: 0.07, gap: 0.03, top: 0.18, bottom: 0.1),
                slot: CallFrameSlotStyle(shape: .round, radius: 0.05, stroke: nil, double: false, glow: "#6366F166", shadow: false, card: nil, tilt: .none, tone: .color, duotone: nil),
                background: .radial(colors: ["#243248", "#0F1C2E", "#0A1320"]),
                pattern: nil,
                border: nil,
                ornaments: [
                    CallFrameOrnament(kind: .rays, color: "#6366F1", density: .low, layer: .back),
                    CallFrameOrnament(kind: .vignette, color: "#000000", density: .mid, layer: .back)
                ],
                brand: CallFrameBrand(mark: .wordmark, place: .topLeft, color: "#FFFFFF", size: .s, font: StoryTextStyle.poster),
                names: CallFrameNames(show: .name, style: .caption, font: .classic, color: "#E2E8F0", fill: nil),
                title: CallFrameTitle(source: .group, font: .poster, color: "#FFFFFF", place: .top, size: .l, effect: nil, letterCase: CallFrameLetterCase.upper),
                subtitle: CallFrameTitle(source: .date, font: .classic, color: "#A5B4FC", place: .top, size: .s, effect: nil, letterCase: nil)
            )
        ),
        CallFrameDesign(
            id: "corporate.keynote.groupe",
            motif: "corporate.keynote",
            mood: .corporate,
            name: "Keynote",
            bucket: .groupe,
            look: CallFrameLook(
                layout: CallFrameLayout(arrangement: .tiers, margin: 0.06, gap: 0.02, top: 0.16, bottom: 0.1),
                slot: CallFrameSlotStyle(shape: .round, radius: 0.04, stroke: nil, double: false, glow: nil, shadow: false, card: nil, tilt: .none, tone: .color, duotone: nil),
                background: .radial(colors: ["#243248", "#0F1C2E", "#0A1320"]),
                pattern: nil,
                border: nil,
                ornaments: [
                    CallFrameOrnament(kind: .rays, color: "#6366F1", density: .low, layer: .back),
                    CallFrameOrnament(kind: .vignette, color: "#000000", density: .mid, layer: .back)
                ],
                brand: CallFrameBrand(mark: .wordmark, place: .topLeft, color: "#FFFFFF", size: .s, font: StoryTextStyle.poster),
                names: CallFrameNames(show: .name, style: .caption, font: .classic, color: "#E2E8F0", fill: nil),
                title: CallFrameTitle(source: .group, font: .poster, color: "#FFFFFF", place: .top, size: .l, effect: nil, letterCase: CallFrameLetterCase.upper),
                subtitle: CallFrameTitle(source: .date, font: .classic, color: "#A5B4FC", place: .top, size: .s, effect: nil, letterCase: nil)
            )
        ),
        CallFrameDesign(
            id: "corporate.keynote.tablee",
            motif: "corporate.keynote",
            mood: .corporate,
            name: "Keynote",
            bucket: .tablee,
            look: CallFrameLook(
                layout: CallFrameLayout(arrangement: .tiers, margin: 0.05, gap: 0.015, top: 0.14, bottom: 0.08),
                slot: CallFrameSlotStyle(shape: .round, radius: 0.04, stroke: nil, double: false, glow: nil, shadow: false, card: nil, tilt: .none, tone: .color, duotone: nil),
                background: .radial(colors: ["#243248", "#0F1C2E", "#0A1320"]),
                pattern: nil,
                border: nil,
                ornaments: [
                    CallFrameOrnament(kind: .rays, color: "#6366F1", density: .low, layer: .back),
                    CallFrameOrnament(kind: .vignette, color: "#000000", density: .mid, layer: .back)
                ],
                brand: CallFrameBrand(mark: .wordmark, place: .topLeft, color: "#FFFFFF", size: .s, font: StoryTextStyle.poster),
                names: CallFrameNames(show: .none, style: .caption, font: .classic, color: "#E2E8F0", fill: nil),
                title: CallFrameTitle(source: .group, font: .poster, color: "#FFFFFF", place: .top, size: .m, effect: nil, letterCase: CallFrameLetterCase.upper),
                subtitle: CallFrameTitle(source: .date, font: .classic, color: "#A5B4FC", place: .top, size: .s, effect: nil, letterCase: nil)
            )
        ),
        CallFrameDesign(
            id: "corporate.badge.duo",
            motif: "corporate.badge",
            mood: .corporate,
            name: "Badge",
            bucket: .duo,
            look: CallFrameLook(
                layout: CallFrameLayout(arrangement: .column, margin: 0.08, gap: 0.05, top: 0.16, bottom: 0.1),
                slot: CallFrameSlotStyle(shape: .round, radius: 0.06, stroke: nil, double: false, glow: nil, shadow: true, card: CallFrameCard(color: "#FFFFFF", pad: 0.06, foot: 0.24), tilt: .none, tone: .color, duotone: nil),
                background: .solid(color: "#F1F5F9"),
                pattern: CallFramePattern(kind: .dots, color: "#CBD5E1", opacity: 0.5),
                border: nil,
                ornaments: [],
                brand: CallFrameBrand(mark: .logo, place: .topRight, color: "#0F766E", size: .m, font: nil),
                names: CallFrameNames(show: .both, style: .caption, font: .bold, color: "#0F1C2E", fill: nil),
                title: CallFrameTitle(source: .names, font: .poster, color: "#0F1C2E", place: .top, size: .m, effect: nil, letterCase: CallFrameLetterCase.upper),
                subtitle: CallFrameTitle(source: .date, font: .classic, color: "#334155", place: .top, size: .s, effect: nil, letterCase: nil)
            )
        ),
        CallFrameDesign(
            id: "corporate.badge.comite",
            motif: "corporate.badge",
            mood: .corporate,
            name: "Badge",
            bucket: .comite,
            look: CallFrameLook(
                layout: CallFrameLayout(arrangement: .grid, margin: 0.08, gap: 0.035, top: 0.16, bottom: 0.1),
                slot: CallFrameSlotStyle(shape: .round, radius: 0.06, stroke: nil, double: false, glow: nil, shadow: true, card: CallFrameCard(color: "#FFFFFF", pad: 0.06, foot: 0.24), tilt: .none, tone: .color, duotone: nil),
                background: .solid(color: "#F1F5F9"),
                pattern: CallFramePattern(kind: .dots, color: "#CBD5E1", opacity: 0.5),
                border: nil,
                ornaments: [],
                brand: CallFrameBrand(mark: .logo, place: .topRight, color: "#0F766E", size: .m, font: nil),
                names: CallFrameNames(show: .both, style: .caption, font: .bold, color: "#0F1C2E", fill: nil),
                title: CallFrameTitle(source: .group, font: .poster, color: "#0F1C2E", place: .top, size: .m, effect: nil, letterCase: CallFrameLetterCase.upper),
                subtitle: CallFrameTitle(source: .date, font: .classic, color: "#334155", place: .top, size: .s, effect: nil, letterCase: nil)
            )
        ),
        CallFrameDesign(
            id: "corporate.badge.groupe",
            motif: "corporate.badge",
            mood: .corporate,
            name: "Badge",
            bucket: .groupe,
            look: CallFrameLook(
                layout: CallFrameLayout(arrangement: .mosaic, margin: 0.06, gap: 0.025, top: 0.14, bottom: 0.08),
                slot: CallFrameSlotStyle(shape: .round, radius: 0.06, stroke: nil, double: false, glow: nil, shadow: true, card: CallFrameCard(color: "#FFFFFF", pad: 0.05, foot: 0.2), tilt: .none, tone: .color, duotone: nil),
                background: .solid(color: "#F1F5F9"),
                pattern: CallFramePattern(kind: .dots, color: "#CBD5E1", opacity: 0.5),
                border: nil,
                ornaments: [],
                brand: CallFrameBrand(mark: .logo, place: .topRight, color: "#0F766E", size: .m, font: nil),
                names: CallFrameNames(show: .handle, style: .caption, font: .bold, color: "#0F1C2E", fill: nil),
                title: CallFrameTitle(source: .group, font: .poster, color: "#0F1C2E", place: .top, size: .m, effect: nil, letterCase: CallFrameLetterCase.upper),
                subtitle: CallFrameTitle(source: .date, font: .classic, color: "#334155", place: .top, size: .s, effect: nil, letterCase: nil)
            )
        ),
        CallFrameDesign(
            id: "corporate.poignee-de-main.duo",
            motif: "corporate.poignee-de-main",
            mood: .corporate,
            name: "Poignée de main",
            bucket: .duo,
            look: CallFrameLook(
                layout: CallFrameLayout(arrangement: .split, margin: 0.07, gap: 0.012, top: 0.15, bottom: 0.1),
                slot: CallFrameSlotStyle(shape: .rect, radius: nil, stroke: CallFrameStroke(color: "#14B8A6", width: 0.004), double: false, glow: nil, shadow: false, card: nil, tilt: .none, tone: .cool, duotone: nil),
                background: .linear(colors: ["#0F1C2E", "#16263D"], angle: 0.0),
                pattern: nil,
                border: CallFrameBorder(kind: .brackets, color: "#14B8A6", width: 0.006, inset: 0.035),
                ornaments: [],
                brand: CallFrameBrand(mark: .both, place: .bottom, color: "#FFFFFF", size: .s, font: nil),
                names: CallFrameNames(show: .both, style: .plate, font: .classic, color: "#FFFFFF", fill: "#0F1C2ED9"),
                title: CallFrameTitle(source: .names, font: .poster, color: "#FFFFFF", place: .top, size: .m, effect: nil, letterCase: CallFrameLetterCase.upper),
                subtitle: CallFrameTitle(source: .date, font: .classic, color: "#14B8A6", place: .top, size: .s, effect: nil, letterCase: nil)
            )
        )
    ]
}
