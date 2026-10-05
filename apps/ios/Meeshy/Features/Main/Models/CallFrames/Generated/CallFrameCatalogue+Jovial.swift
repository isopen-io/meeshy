// GÉNÉRÉ — ne pas éditer; source: packages/shared/design/call-capture-frames
// Régénérer : `cd packages/shared && bun run generate:call-frames`.
// Fraîcheur gardée par packages/shared/__tests__/call-capture-frames-swift.test.ts.

import MeeshySDK

nonisolated extension CallFrameCatalogue {
    static let jovialFrames: [CallFrameDesign] = [
        CallFrameDesign(
            id: "jovial.fete.duo",
            motif: "jovial.fete",
            mood: .jovial,
            name: "Fête",
            bucket: .duo,
            look: CallFrameLook(
                layout: CallFrameLayout(arrangement: .diagonal, margin: 0.07, gap: 0.03, top: 0.15, bottom: 0.1),
                slot: CallFrameSlotStyle(shape: .round, radius: 0.16, stroke: CallFrameStroke(color: "#FFFFFF", width: 0.04), double: false, glow: nil, shadow: true, card: nil, tilt: .wild, tone: .warm, duotone: nil),
                background: .solid(color: "#FFF8E7"),
                pattern: CallFramePattern(kind: .confetti, color: "#EF476F", opacity: 0.12),
                border: nil,
                ornaments: [
                    CallFrameOrnament(kind: .confetti, color: "#FFD166", density: .mid, layer: .back),
                    CallFrameOrnament(kind: .ribbon, color: "#06D6A0", density: .low, layer: .front),
                    CallFrameOrnament(kind: .sparkles, color: "#EF476F", density: .low, layer: .front)
                ],
                brand: CallFrameBrand(mark: .both, place: .bottom, color: "#EF476F", size: .m, font: StoryTextStyle.bubble),
                names: CallFrameNames(show: .name, style: .bubble, font: .bubble, color: "#073B4C", fill: "#FFFFFF"),
                title: CallFrameTitle(source: .names, font: .bubble, color: "#EF476F", place: .top, size: .l, effect: CallFrameTextEffect.shadow, letterCase: nil),
                subtitle: nil
            )
        ),
        CallFrameDesign(
            id: "jovial.fete.comite",
            motif: "jovial.fete",
            mood: .jovial,
            name: "Fête",
            bucket: .comite,
            look: CallFrameLook(
                layout: CallFrameLayout(arrangement: .arch, margin: 0.06, gap: 0.03, top: 0.16, bottom: 0.1),
                slot: CallFrameSlotStyle(shape: .round, radius: 0.14, stroke: CallFrameStroke(color: "#FFFFFF", width: 0.035), double: false, glow: nil, shadow: true, card: nil, tilt: .gentle, tone: .warm, duotone: nil),
                background: .solid(color: "#FFF8E7"),
                pattern: CallFramePattern(kind: .confetti, color: "#EF476F", opacity: 0.12),
                border: nil,
                ornaments: [
                    CallFrameOrnament(kind: .confetti, color: "#FFD166", density: .mid, layer: .back),
                    CallFrameOrnament(kind: .ribbon, color: "#06D6A0", density: .low, layer: .front),
                    CallFrameOrnament(kind: .sparkles, color: "#EF476F", density: .low, layer: .front)
                ],
                brand: CallFrameBrand(mark: .both, place: .bottom, color: "#EF476F", size: .m, font: StoryTextStyle.bubble),
                names: CallFrameNames(show: .name, style: .badge, font: .bubble, color: "#FFFFFF", fill: "#D6335A"),
                title: CallFrameTitle(source: .group, font: .bubble, color: "#EF476F", place: .top, size: .l, effect: CallFrameTextEffect.shadow, letterCase: nil),
                subtitle: nil
            )
        ),
        CallFrameDesign(
            id: "jovial.fete.groupe",
            motif: "jovial.fete",
            mood: .jovial,
            name: "Fête",
            bucket: .groupe,
            look: CallFrameLook(
                layout: CallFrameLayout(arrangement: .mosaic, margin: 0.05, gap: 0.025, top: 0.14, bottom: 0.1),
                slot: CallFrameSlotStyle(shape: .round, radius: 0.1, stroke: CallFrameStroke(color: "#FFFFFF", width: 0.03), double: false, glow: nil, shadow: true, card: nil, tilt: .gentle, tone: .warm, duotone: nil),
                background: .solid(color: "#FFF8E7"),
                pattern: CallFramePattern(kind: .confetti, color: "#EF476F", opacity: 0.12),
                border: nil,
                ornaments: [
                    CallFrameOrnament(kind: .confetti, color: "#FFD166", density: .high, layer: .back),
                    CallFrameOrnament(kind: .balloons, color: "#118AB2", density: .low, layer: .back),
                    CallFrameOrnament(kind: .sparkles, color: "#EF476F", density: .low, layer: .front)
                ],
                brand: CallFrameBrand(mark: .both, place: .bottom, color: "#EF476F", size: .m, font: StoryTextStyle.bubble),
                names: CallFrameNames(show: .name, style: .badge, font: .bubble, color: "#073B4C", fill: "#FFD166"),
                title: CallFrameTitle(source: .group, font: .bubble, color: "#EF476F", place: .top, size: .l, effect: CallFrameTextEffect.shadow, letterCase: nil),
                subtitle: nil
            )
        ),
        CallFrameDesign(
            id: "jovial.fete.tablee",
            motif: "jovial.fete",
            mood: .jovial,
            name: "Fête",
            bucket: .tablee,
            look: CallFrameLook(
                layout: CallFrameLayout(arrangement: .grid, margin: 0.05, gap: 0.02, top: 0.12, bottom: 0.08),
                slot: CallFrameSlotStyle(shape: .round, radius: 0.12, stroke: CallFrameStroke(color: "#FFFFFF", width: 0.025), double: false, glow: nil, shadow: false, card: nil, tilt: .gentle, tone: .warm, duotone: nil),
                background: .solid(color: "#FFF8E7"),
                pattern: CallFramePattern(kind: .confetti, color: "#EF476F", opacity: 0.12),
                border: nil,
                ornaments: [
                    CallFrameOrnament(kind: .confetti, color: "#FFD166", density: .high, layer: .back),
                    CallFrameOrnament(kind: .ribbon, color: "#06D6A0", density: .low, layer: .front)
                ],
                brand: CallFrameBrand(mark: .both, place: .bottom, color: "#EF476F", size: .s, font: StoryTextStyle.bubble),
                names: CallFrameNames(show: .none, style: .badge, font: .bubble, color: "#FFFFFF", fill: "#EF476F"),
                title: CallFrameTitle(source: .group, font: .bubble, color: "#EF476F", place: .top, size: .m, effect: CallFrameTextEffect.shadow, letterCase: nil),
                subtitle: nil
            )
        ),
        CallFrameDesign(
            id: "jovial.fanfare.duo",
            motif: "jovial.fanfare",
            mood: .jovial,
            name: "Fanfare",
            bucket: .duo,
            look: CallFrameLook(
                layout: CallFrameLayout(arrangement: .row, margin: 0.08, gap: 0.04, top: 0.18, bottom: 0.12),
                slot: CallFrameSlotStyle(shape: .ticket, radius: 0.08, stroke: CallFrameStroke(color: "#073B4C", width: 0.014), double: false, glow: nil, shadow: true, card: nil, tilt: .gentle, tone: .warm, duotone: nil),
                background: .linear(colors: ["#FFF4DC", "#FFE3AE"], angle: 0.0),
                pattern: CallFramePattern(kind: .stripes, color: "#EF476F", opacity: 0.14),
                border: CallFrameBorder(kind: .ticket, color: "#EF476F", width: 0.012, inset: 0.03),
                ornaments: [
                    CallFrameOrnament(kind: .notes, color: "#118AB2", density: .low, layer: .back),
                    CallFrameOrnament(kind: .stars, color: "#FFD166", density: .low, layer: .front)
                ],
                brand: CallFrameBrand(mark: .wordmark, place: .topRight, color: "#073B4C", size: .s, font: StoryTextStyle.cartoon),
                names: CallFrameNames(show: .handle, style: .ribbon, font: .cartoon, color: "#FFD166", fill: "#073B4C"),
                title: CallFrameTitle(source: .names, font: .cartoon, color: "#073B4C", place: .top, size: .l, effect: CallFrameTextEffect.shadow, letterCase: CallFrameLetterCase.upper),
                subtitle: CallFrameTitle(source: .date, font: .brush, color: "#B5294E", place: .top, size: .s, effect: nil, letterCase: nil)
            )
        ),
        CallFrameDesign(
            id: "jovial.fanfare.comite",
            motif: "jovial.fanfare",
            mood: .jovial,
            name: "Fanfare",
            bucket: .comite,
            look: CallFrameLook(
                layout: CallFrameLayout(arrangement: .orbit, margin: 0.07, gap: 0.03, top: 0.17, bottom: 0.11),
                slot: CallFrameSlotStyle(shape: .ticket, radius: 0.08, stroke: CallFrameStroke(color: "#073B4C", width: 0.012), double: false, glow: nil, shadow: true, card: nil, tilt: .none, tone: .warm, duotone: nil),
                background: .linear(colors: ["#FFF4DC", "#FFE3AE"], angle: 0.0),
                pattern: CallFramePattern(kind: .stripes, color: "#EF476F", opacity: 0.14),
                border: CallFrameBorder(kind: .ticket, color: "#EF476F", width: 0.012, inset: 0.03),
                ornaments: [
                    CallFrameOrnament(kind: .notes, color: "#118AB2", density: .low, layer: .back),
                    CallFrameOrnament(kind: .stars, color: "#FFD166", density: .low, layer: .front)
                ],
                brand: CallFrameBrand(mark: .wordmark, place: .topRight, color: "#073B4C", size: .s, font: StoryTextStyle.cartoon),
                names: CallFrameNames(show: .handle, style: .badge, font: .cartoon, color: "#FFD166", fill: "#073B4C"),
                title: CallFrameTitle(source: .group, font: .cartoon, color: "#073B4C", place: .top, size: .l, effect: CallFrameTextEffect.shadow, letterCase: CallFrameLetterCase.upper),
                subtitle: nil
            )
        ),
        CallFrameDesign(
            id: "jovial.fanfare.groupe",
            motif: "jovial.fanfare",
            mood: .jovial,
            name: "Fanfare",
            bucket: .groupe,
            look: CallFrameLook(
                layout: CallFrameLayout(arrangement: .honeycomb, margin: 0.06, gap: 0.02, top: 0.15, bottom: 0.16),
                slot: CallFrameSlotStyle(shape: .hex, radius: nil, stroke: CallFrameStroke(color: "#073B4C", width: 0.01), double: false, glow: nil, shadow: false, card: nil, tilt: .none, tone: .warm, duotone: nil),
                background: .linear(colors: ["#FFF4DC", "#FFE3AE"], angle: 0.0),
                pattern: CallFramePattern(kind: .stripes, color: "#EF476F", opacity: 0.14),
                border: CallFrameBorder(kind: .ticket, color: "#EF476F", width: 0.012, inset: 0.03),
                ornaments: [
                    CallFrameOrnament(kind: .notes, color: "#118AB2", density: .low, layer: .back),
                    CallFrameOrnament(kind: .stars, color: "#FFD166", density: .low, layer: .front)
                ],
                brand: CallFrameBrand(mark: .wordmark, place: .topRight, color: "#073B4C", size: .s, font: StoryTextStyle.cartoon),
                names: CallFrameNames(show: .handle, style: .list, font: .cartoon, color: "#073B4C", fill: nil),
                title: CallFrameTitle(source: .group, font: .cartoon, color: "#073B4C", place: .top, size: .l, effect: CallFrameTextEffect.shadow, letterCase: CallFrameLetterCase.upper),
                subtitle: nil
            )
        ),
        CallFrameDesign(
            id: "jovial.fanfare.tablee",
            motif: "jovial.fanfare",
            mood: .jovial,
            name: "Fanfare",
            bucket: .tablee,
            look: CallFrameLook(
                layout: CallFrameLayout(arrangement: .tiers, margin: 0.05, gap: 0.02, top: 0.14, bottom: 0.14),
                slot: CallFrameSlotStyle(shape: .ticket, radius: 0.06, stroke: CallFrameStroke(color: "#073B4C", width: 0.008), double: false, glow: nil, shadow: false, card: nil, tilt: .none, tone: .warm, duotone: nil),
                background: .linear(colors: ["#FFF4DC", "#FFE3AE"], angle: 0.0),
                pattern: CallFramePattern(kind: .stripes, color: "#EF476F", opacity: 0.14),
                border: CallFrameBorder(kind: .ticket, color: "#EF476F", width: 0.012, inset: 0.03),
                ornaments: [
                    CallFrameOrnament(kind: .notes, color: "#118AB2", density: .low, layer: .back),
                    CallFrameOrnament(kind: .stars, color: "#FFD166", density: .low, layer: .front)
                ],
                brand: CallFrameBrand(mark: .wordmark, place: .topRight, color: "#073B4C", size: .s, font: StoryTextStyle.cartoon),
                names: CallFrameNames(show: .handle, style: .list, font: .cartoon, color: "#073B4C", fill: nil),
                title: CallFrameTitle(source: .group, font: .cartoon, color: "#073B4C", place: .top, size: .m, effect: CallFrameTextEffect.shadow, letterCase: CallFrameLetterCase.upper),
                subtitle: nil
            )
        ),
        CallFrameDesign(
            id: "jovial.ballons.duo",
            motif: "jovial.ballons",
            mood: .jovial,
            name: "Ballons",
            bucket: .duo,
            look: CallFrameLook(
                layout: CallFrameLayout(arrangement: .column, margin: 0.07, gap: 0.05, top: 0.16, bottom: 0.1),
                slot: CallFrameSlotStyle(shape: .oval, radius: nil, stroke: CallFrameStroke(color: "#FFFFFF", width: 0.035), double: false, glow: "#FFFFFFAA", shadow: false, card: nil, tilt: .wild, tone: .color, duotone: nil),
                background: .linear(colors: ["#BDE8F5", "#E8F7FB", "#FFF8E7"], angle: 0.0),
                pattern: nil,
                border: nil,
                ornaments: [
                    CallFrameOrnament(kind: .balloons, color: "#EF476F", density: .mid, layer: .back),
                    CallFrameOrnament(kind: .balloons, color: "#FFD166", density: .low, layer: .back),
                    CallFrameOrnament(kind: .clouds, color: "#FFFFFF", density: .low, layer: .back)
                ],
                brand: CallFrameBrand(mark: .logo, place: .topLeft, color: "#118AB2", size: .m, font: nil),
                names: CallFrameNames(show: .name, style: .tag, font: .brush, color: "#073B4C", fill: nil),
                title: CallFrameTitle(source: .names, font: .brush, color: "#118AB2", place: .top, size: .l, effect: nil, letterCase: nil),
                subtitle: CallFrameTitle(source: .date, font: .bubble, color: "#B5294E", place: .top, size: .s, effect: nil, letterCase: nil)
            )
        ),
        CallFrameDesign(
            id: "jovial.ballons.comite",
            motif: "jovial.ballons",
            mood: .jovial,
            name: "Ballons",
            bucket: .comite,
            look: CallFrameLook(
                layout: CallFrameLayout(arrangement: .scatter, margin: 0.07, gap: 0.03, top: 0.15, bottom: 0.1),
                slot: CallFrameSlotStyle(shape: .oval, radius: nil, stroke: CallFrameStroke(color: "#FFFFFF", width: 0.03), double: false, glow: "#FFFFFFAA", shadow: false, card: nil, tilt: .gentle, tone: .color, duotone: nil),
                background: .linear(colors: ["#BDE8F5", "#E8F7FB", "#FFF8E7"], angle: 0.0),
                pattern: nil,
                border: nil,
                ornaments: [
                    CallFrameOrnament(kind: .balloons, color: "#EF476F", density: .mid, layer: .back),
                    CallFrameOrnament(kind: .balloons, color: "#FFD166", density: .low, layer: .back),
                    CallFrameOrnament(kind: .clouds, color: "#FFFFFF", density: .low, layer: .back)
                ],
                brand: CallFrameBrand(mark: .logo, place: .topLeft, color: "#118AB2", size: .m, font: nil),
                names: CallFrameNames(show: .name, style: .tag, font: .brush, color: "#073B4C", fill: nil),
                title: CallFrameTitle(source: .group, font: .brush, color: "#118AB2", place: .top, size: .l, effect: nil, letterCase: nil),
                subtitle: nil
            )
        ),
        CallFrameDesign(
            id: "jovial.ballons.groupe",
            motif: "jovial.ballons",
            mood: .jovial,
            name: "Ballons",
            bucket: .groupe,
            look: CallFrameLook(
                layout: CallFrameLayout(arrangement: .grid, margin: 0.06, gap: 0.03, top: 0.14, bottom: 0.1),
                slot: CallFrameSlotStyle(shape: .circle, radius: nil, stroke: CallFrameStroke(color: "#FFFFFF", width: 0.03), double: false, glow: nil, shadow: false, card: nil, tilt: .wild, tone: .color, duotone: nil),
                background: .linear(colors: ["#BDE8F5", "#E8F7FB", "#FFF8E7"], angle: 0.0),
                pattern: nil,
                border: nil,
                ornaments: [
                    CallFrameOrnament(kind: .balloons, color: "#EF476F", density: .mid, layer: .back),
                    CallFrameOrnament(kind: .balloons, color: "#06D6A0", density: .mid, layer: .back),
                    CallFrameOrnament(kind: .balloons, color: "#FFD166", density: .low, layer: .back),
                    CallFrameOrnament(kind: .clouds, color: "#FFFFFF", density: .low, layer: .back)
                ],
                brand: CallFrameBrand(mark: .logo, place: .topLeft, color: "#118AB2", size: .m, font: nil),
                names: CallFrameNames(show: .name, style: .badge, font: .bubble, color: "#FFFFFF", fill: "#0B6E8F"),
                title: CallFrameTitle(source: .group, font: .brush, color: "#118AB2", place: .top, size: .l, effect: nil, letterCase: nil),
                subtitle: nil
            )
        ),
        CallFrameDesign(
            id: "jovial.grimaces.duo",
            motif: "jovial.grimaces",
            mood: .jovial,
            name: "Grimaces",
            bucket: .duo,
            look: CallFrameLook(
                layout: CallFrameLayout(arrangement: .split, margin: 0.08, gap: 0.04, top: 0.12, bottom: 0.12),
                slot: CallFrameSlotStyle(shape: .rect, radius: nil, stroke: nil, double: false, glow: nil, shadow: true, card: CallFrameCard(color: "#FFFFFF", pad: 0.05, foot: 0.16), tilt: .wild, tone: .color, duotone: nil),
                background: .solid(color: "#EF476F"),
                pattern: CallFramePattern(kind: .dots, color: "#FFFFFF", opacity: 0.18),
                border: nil,
                ornaments: [
                    CallFrameOrnament(kind: .stars, color: "#FFD166", density: .low, layer: .front),
                    CallFrameOrnament(kind: .confetti, color: "#FFFFFF", density: .low, layer: .back)
                ],
                brand: CallFrameBrand(mark: .logo, place: .bottomRight, color: "#FFFFFF", size: .m, font: nil),
                names: CallFrameNames(show: .both, style: .caption, font: .cartoon, color: "#073B4C", fill: nil),
                title: CallFrameTitle(source: .date, font: .cartoon, color: "#FFFFFF", place: .top, size: .m, effect: CallFrameTextEffect.shadow, letterCase: CallFrameLetterCase.upper),
                subtitle: nil
            )
        )
    ]
}
