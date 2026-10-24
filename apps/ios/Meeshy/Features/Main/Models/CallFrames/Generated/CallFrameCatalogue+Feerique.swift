// GÉNÉRÉ — ne pas éditer; source: packages/shared/design/call-capture-frames
// Régénérer : `cd packages/shared && bun run generate:call-frames`.
// Fraîcheur gardée par packages/shared/__tests__/call-capture-frames-swift.test.ts.

import MeeshySDK

nonisolated extension CallFrameCatalogue {
    static let feeriqueFrames: [CallFrameDesign] = [
        CallFrameDesign(
            id: "feerique.conte.duo",
            motif: "feerique.conte",
            mood: .feerique,
            name: "Conte",
            bucket: .duo,
            look: CallFrameLook(
                layout: CallFrameLayout(arrangement: .cascade, margin: 0.08, gap: 0.03, top: 0.19, bottom: 0.13),
                slot: CallFrameSlotStyle(shape: .round, radius: 0.2, stroke: CallFrameStroke(color: "#F4B6C8", width: 0.008), double: false, glow: nil, shadow: true, card: CallFrameCard(color: "#FFFFFF", pad: 0.04, foot: 0.06), tilt: .gentle, tone: .warm, duotone: nil),
                background: .linear(colors: ["#FFF1F5", "#FDF6EC", "#EAF4FB"], angle: 0.0),
                pattern: CallFramePattern(kind: .waves, color: "#F4B6C8", opacity: 0.16),
                border: CallFrameBorder(kind: .vines, color: "#7FA37A", width: 0.014, inset: 0.02),
                ornaments: [
                    CallFrameOrnament(kind: .petals, color: "#F4B6C8", density: .mid, layer: .back),
                    CallFrameOrnament(kind: .stars, color: "#E9B949", density: .low, layer: .back),
                    CallFrameOrnament(kind: .sparkles, color: "#E9B949", density: .low, layer: .front)
                ],
                brand: CallFrameBrand(mark: .wordmark, place: .bottom, color: "#8A6A4A", size: .s, font: StoryTextStyle.curve),
                names: CallFrameNames(show: .name, style: .caption, font: .handwriting, color: "#5A3E2E", fill: nil),
                title: CallFrameTitle(source: .names, font: .curve, color: "#7A3E62", place: .top, size: .l, effect: CallFrameTextEffect.none, letterCase: CallFrameLetterCase.asIs),
                subtitle: CallFrameTitle(source: .date, font: .handwriting, color: "#8A6A4A", place: .top, size: .s, effect: CallFrameTextEffect.none, letterCase: CallFrameLetterCase.asIs)
            ),
            surfaces: [.capture, .live]
        ),
        CallFrameDesign(
            id: "feerique.conte.comite",
            motif: "feerique.conte",
            mood: .feerique,
            name: "Conte",
            bucket: .comite,
            look: CallFrameLook(
                layout: CallFrameLayout(arrangement: .arch, margin: 0.08, gap: 0.035, top: 0.19, bottom: 0.13),
                slot: CallFrameSlotStyle(shape: .round, radius: 0.2, stroke: CallFrameStroke(color: "#F4B6C8", width: 0.008), double: false, glow: nil, shadow: true, card: CallFrameCard(color: "#FFFFFF", pad: 0.04, foot: 0.06), tilt: .gentle, tone: .warm, duotone: nil),
                background: .linear(colors: ["#FFF1F5", "#FDF6EC", "#EAF4FB"], angle: 0.0),
                pattern: CallFramePattern(kind: .waves, color: "#F4B6C8", opacity: 0.16),
                border: CallFrameBorder(kind: .vines, color: "#7FA37A", width: 0.014, inset: 0.02),
                ornaments: [
                    CallFrameOrnament(kind: .petals, color: "#F4B6C8", density: .mid, layer: .back),
                    CallFrameOrnament(kind: .stars, color: "#E9B949", density: .low, layer: .back),
                    CallFrameOrnament(kind: .sparkles, color: "#E9B949", density: .low, layer: .front)
                ],
                brand: CallFrameBrand(mark: .wordmark, place: .bottom, color: "#8A6A4A", size: .s, font: StoryTextStyle.curve),
                names: CallFrameNames(show: .name, style: .caption, font: .handwriting, color: "#5A3E2E", fill: nil),
                title: CallFrameTitle(source: .group, font: .curve, color: "#7A3E62", place: .top, size: .l, effect: CallFrameTextEffect.none, letterCase: CallFrameLetterCase.asIs),
                subtitle: CallFrameTitle(source: .date, font: .handwriting, color: "#8A6A4A", place: .top, size: .s, effect: CallFrameTextEffect.none, letterCase: CallFrameLetterCase.asIs)
            ),
            surfaces: [.capture, .live]
        ),
        CallFrameDesign(
            id: "feerique.conte.groupe",
            motif: "feerique.conte",
            mood: .feerique,
            name: "Conte",
            bucket: .groupe,
            look: CallFrameLook(
                layout: CallFrameLayout(arrangement: .tiers, margin: 0.07, gap: 0.025, top: 0.17, bottom: 0.12),
                slot: CallFrameSlotStyle(shape: .round, radius: 0.2, stroke: CallFrameStroke(color: "#F4B6C8", width: 0.006), double: false, glow: nil, shadow: true, card: CallFrameCard(color: "#FFFFFF", pad: 0.035, foot: 0.04), tilt: .none, tone: .warm, duotone: nil),
                background: .linear(colors: ["#FFF1F5", "#FDF6EC", "#EAF4FB"], angle: 0.0),
                pattern: CallFramePattern(kind: .waves, color: "#F4B6C8", opacity: 0.16),
                border: CallFrameBorder(kind: .vines, color: "#7FA37A", width: 0.014, inset: 0.02),
                ornaments: [
                    CallFrameOrnament(kind: .petals, color: "#F4B6C8", density: .mid, layer: .back),
                    CallFrameOrnament(kind: .stars, color: "#E9B949", density: .low, layer: .back),
                    CallFrameOrnament(kind: .sparkles, color: "#E9B949", density: .low, layer: .front)
                ],
                brand: CallFrameBrand(mark: .wordmark, place: .bottom, color: "#8A6A4A", size: .s, font: StoryTextStyle.curve),
                names: CallFrameNames(show: .name, style: .ribbon, font: .handwriting, color: "#5A3E2E", fill: "#F9C6D3"),
                title: CallFrameTitle(source: .group, font: .curve, color: "#7A3E62", place: .top, size: .l, effect: CallFrameTextEffect.none, letterCase: CallFrameLetterCase.asIs),
                subtitle: CallFrameTitle(source: .date, font: .handwriting, color: "#8A6A4A", place: .top, size: .s, effect: CallFrameTextEffect.none, letterCase: CallFrameLetterCase.asIs)
            ),
            surfaces: [.capture, .live]
        ),
        CallFrameDesign(
            id: "feerique.lucioles.duo",
            motif: "feerique.lucioles",
            mood: .feerique,
            name: "Lucioles",
            bucket: .duo,
            look: CallFrameLook(
                layout: CallFrameLayout(arrangement: .diagonal, margin: 0.07, gap: 0.03, top: 0.16, bottom: 0.1),
                slot: CallFrameSlotStyle(shape: .blob, radius: nil, stroke: nil, double: false, glow: "#F7E27A66", shadow: false, card: nil, tilt: .gentle, tone: .warm, duotone: nil),
                background: .radial(colors: ["#1F4A3A", "#0D241D", "#04100C"]),
                pattern: nil,
                border: nil,
                ornaments: [
                    CallFrameOrnament(kind: .fireflies, color: "#FFE680", density: .high, layer: .back, motion: .loop),
                    CallFrameOrnament(kind: .bokeh, color: "#7CFFB2", density: .low, layer: .back, motion: .loop),
                    CallFrameOrnament(kind: .leaves, color: "#2F6B4F", density: .mid, layer: .front, motion: .loop),
                    CallFrameOrnament(kind: .fireflies, color: "#FFF4B8", density: .low, layer: .front, motion: .loop)
                ],
                brand: CallFrameBrand(mark: .wordmark, place: .bottom, color: "#FFF4B8", size: .m, font: StoryTextStyle.handwriting),
                names: CallFrameNames(show: .name, style: .badge, font: .brush, color: "#FFF4B8", fill: "#0D241DCC"),
                title: CallFrameTitle(source: .names, font: .handwriting, color: "#FFF4B8", place: .top, size: .l, effect: CallFrameTextEffect.glow, letterCase: nil),
                subtitle: nil
            ),
            surfaces: [.capture, .live]
        ),
        CallFrameDesign(
            id: "feerique.lucioles.comite",
            motif: "feerique.lucioles",
            mood: .feerique,
            name: "Lucioles",
            bucket: .comite,
            look: CallFrameLook(
                layout: CallFrameLayout(arrangement: .scatter, margin: 0.07, gap: 0.03, top: 0.16, bottom: 0.1),
                slot: CallFrameSlotStyle(shape: .blob, radius: nil, stroke: nil, double: false, glow: "#F7E27A66", shadow: false, card: nil, tilt: .gentle, tone: .warm, duotone: nil),
                background: .radial(colors: ["#1F4A3A", "#0D241D", "#04100C"]),
                pattern: nil,
                border: nil,
                ornaments: [
                    CallFrameOrnament(kind: .fireflies, color: "#FFE680", density: .high, layer: .back, motion: .loop),
                    CallFrameOrnament(kind: .bokeh, color: "#7CFFB2", density: .low, layer: .back, motion: .loop),
                    CallFrameOrnament(kind: .leaves, color: "#2F6B4F", density: .mid, layer: .front, motion: .loop),
                    CallFrameOrnament(kind: .fireflies, color: "#FFF4B8", density: .low, layer: .front, motion: .loop)
                ],
                brand: CallFrameBrand(mark: .wordmark, place: .bottom, color: "#FFF4B8", size: .m, font: StoryTextStyle.handwriting),
                names: CallFrameNames(show: .name, style: .badge, font: .brush, color: "#FFF4B8", fill: "#0D241DCC"),
                title: CallFrameTitle(source: .group, font: .handwriting, color: "#FFF4B8", place: .top, size: .l, effect: CallFrameTextEffect.glow, letterCase: nil),
                subtitle: nil
            ),
            surfaces: [.capture, .live]
        ),
        CallFrameDesign(
            id: "feerique.lucioles.groupe",
            motif: "feerique.lucioles",
            mood: .feerique,
            name: "Lucioles",
            bucket: .groupe,
            look: CallFrameLook(
                layout: CallFrameLayout(arrangement: .honeycomb, margin: 0.06, gap: 0.02, top: 0.15, bottom: 0.1),
                slot: CallFrameSlotStyle(shape: .blob, radius: nil, stroke: nil, double: false, glow: "#F7E27A66", shadow: false, card: nil, tilt: .gentle, tone: .warm, duotone: nil),
                background: .radial(colors: ["#1F4A3A", "#0D241D", "#04100C"]),
                pattern: nil,
                border: nil,
                ornaments: [
                    CallFrameOrnament(kind: .fireflies, color: "#FFE680", density: .high, layer: .back, motion: .loop),
                    CallFrameOrnament(kind: .bokeh, color: "#7CFFB2", density: .low, layer: .back, motion: .loop),
                    CallFrameOrnament(kind: .leaves, color: "#2F6B4F", density: .low, layer: .front, motion: .loop)
                ],
                brand: CallFrameBrand(mark: .wordmark, place: .bottom, color: "#FFF4B8", size: .m, font: StoryTextStyle.handwriting),
                names: CallFrameNames(show: .name, style: .badge, font: .brush, color: "#FFF4B8", fill: "#0D241DCC"),
                title: CallFrameTitle(source: .group, font: .handwriting, color: "#FFF4B8", place: .top, size: .l, effect: CallFrameTextEffect.glow, letterCase: nil),
                subtitle: nil
            ),
            surfaces: [.capture, .live]
        ),
        CallFrameDesign(
            id: "feerique.lucioles.tablee",
            motif: "feerique.lucioles",
            mood: .feerique,
            name: "Lucioles",
            bucket: .tablee,
            look: CallFrameLook(
                layout: CallFrameLayout(arrangement: .grid, margin: 0.05, gap: 0.02, top: 0.13, bottom: 0.1),
                slot: CallFrameSlotStyle(shape: .blob, radius: nil, stroke: nil, double: false, glow: "#F7E27A55", shadow: false, card: nil, tilt: .none, tone: .warm, duotone: nil),
                background: .radial(colors: ["#1F4A3A", "#0D241D", "#04100C"]),
                pattern: nil,
                border: nil,
                ornaments: [
                    CallFrameOrnament(kind: .fireflies, color: "#FFE680", density: .high, layer: .back, motion: .loop),
                    CallFrameOrnament(kind: .bokeh, color: "#7CFFB2", density: .low, layer: .back, motion: .loop),
                    CallFrameOrnament(kind: .leaves, color: "#2F6B4F", density: .mid, layer: .front, motion: .loop),
                    CallFrameOrnament(kind: .fireflies, color: "#FFF4B8", density: .low, layer: .front, motion: .loop)
                ],
                brand: CallFrameBrand(mark: .wordmark, place: .bottom, color: "#FFF4B8", size: .m, font: StoryTextStyle.handwriting),
                names: CallFrameNames(show: .name, style: .list, font: .brush, color: "#FFF4B8", fill: nil),
                title: CallFrameTitle(source: .group, font: .handwriting, color: "#FFF4B8", place: .top, size: .l, effect: CallFrameTextEffect.glow, letterCase: nil),
                subtitle: nil
            ),
            surfaces: [.capture, .live]
        ),
        CallFrameDesign(
            id: "feerique.clair-de-lune.duo",
            motif: "feerique.clair-de-lune",
            mood: .feerique,
            name: "Clair de lune",
            bucket: .duo,
            look: CallFrameLook(
                layout: CallFrameLayout(arrangement: .row, margin: 0.08, gap: 0.05, top: 0.17, bottom: 0.11),
                slot: CallFrameSlotStyle(shape: .circle, radius: nil, stroke: CallFrameStroke(color: "#F3E8FF", width: 0.008), double: false, glow: "#C4B5FDAA", shadow: false, card: nil, tilt: .none, tone: .cool, duotone: nil),
                background: .linear(colors: ["#0B0A26", "#2A2466", "#6A55B5", "#E2B6E8"], angle: 0.0),
                pattern: CallFramePattern(kind: .stars, color: "#FFF6D6", opacity: 0.25),
                border: nil,
                ornaments: [
                    CallFrameOrnament(kind: .moon, color: "#FFF6D6", density: .low, layer: .front, motion: .loop),
                    CallFrameOrnament(kind: .stars, color: "#FFF6D6", density: .mid, layer: .back, motion: .loop),
                    CallFrameOrnament(kind: .clouds, color: "#F3E8FF", density: .low, layer: .back, motion: .loop),
                    CallFrameOrnament(kind: .sparkles, color: "#FFE9FB", density: .low, layer: .front, motion: .loop)
                ],
                brand: CallFrameBrand(mark: .both, place: .bottom, color: "#F3E8FF", size: .m, font: StoryTextStyle.elegant),
                names: CallFrameNames(show: .name, style: .caption, font: .elegant, color: "#FFF6D6", fill: nil),
                title: CallFrameTitle(source: .names, font: .elegant, color: "#FFF6D6", place: .top, size: .m, effect: CallFrameTextEffect.glow, letterCase: CallFrameLetterCase.upper),
                subtitle: CallFrameTitle(source: .date, font: .calligraphy, color: "#F3E8FF", place: .top, size: .m, effect: nil, letterCase: nil)
            ),
            surfaces: [.capture, .live]
        ),
        CallFrameDesign(
            id: "feerique.clair-de-lune.comite",
            motif: "feerique.clair-de-lune",
            mood: .feerique,
            name: "Clair de lune",
            bucket: .comite,
            look: CallFrameLook(
                layout: CallFrameLayout(arrangement: .orbit, margin: 0.07, gap: 0.03, top: 0.17, bottom: 0.1),
                slot: CallFrameSlotStyle(shape: .circle, radius: nil, stroke: CallFrameStroke(color: "#F3E8FF", width: 0.008), double: false, glow: "#C4B5FDAA", shadow: false, card: nil, tilt: .none, tone: .cool, duotone: nil),
                background: .linear(colors: ["#0B0A26", "#2A2466", "#6A55B5", "#E2B6E8"], angle: 0.0),
                pattern: CallFramePattern(kind: .stars, color: "#FFF6D6", opacity: 0.25),
                border: nil,
                ornaments: [
                    CallFrameOrnament(kind: .moon, color: "#FFF6D6", density: .low, layer: .front, motion: .loop),
                    CallFrameOrnament(kind: .stars, color: "#FFF6D6", density: .mid, layer: .back, motion: .loop),
                    CallFrameOrnament(kind: .clouds, color: "#F3E8FF", density: .low, layer: .back, motion: .loop),
                    CallFrameOrnament(kind: .sparkles, color: "#FFE9FB", density: .low, layer: .front, motion: .loop)
                ],
                brand: CallFrameBrand(mark: .both, place: .bottom, color: "#F3E8FF", size: .m, font: StoryTextStyle.elegant),
                names: CallFrameNames(show: .name, style: .caption, font: .elegant, color: "#FFF6D6", fill: nil),
                title: CallFrameTitle(source: .group, font: .elegant, color: "#FFF6D6", place: .top, size: .m, effect: CallFrameTextEffect.glow, letterCase: CallFrameLetterCase.upper),
                subtitle: nil
            ),
            surfaces: [.capture, .live]
        ),
        CallFrameDesign(
            id: "feerique.clair-de-lune.groupe",
            motif: "feerique.clair-de-lune",
            mood: .feerique,
            name: "Clair de lune",
            bucket: .groupe,
            look: CallFrameLook(
                layout: CallFrameLayout(arrangement: .grid, margin: 0.07, gap: 0.03, top: 0.16, bottom: 0.1),
                slot: CallFrameSlotStyle(shape: .circle, radius: nil, stroke: CallFrameStroke(color: "#F3E8FF", width: 0.008), double: false, glow: "#C4B5FDAA", shadow: false, card: nil, tilt: .none, tone: .cool, duotone: nil),
                background: .linear(colors: ["#0B0A26", "#2A2466", "#6A55B5", "#E2B6E8"], angle: 0.0),
                pattern: CallFramePattern(kind: .stars, color: "#FFF6D6", opacity: 0.25),
                border: nil,
                ornaments: [
                    CallFrameOrnament(kind: .moon, color: "#FFF6D6", density: .low, layer: .front, motion: .loop),
                    CallFrameOrnament(kind: .stars, color: "#FFF6D6", density: .mid, layer: .back, motion: .loop),
                    CallFrameOrnament(kind: .clouds, color: "#F3E8FF", density: .low, layer: .back, motion: .loop),
                    CallFrameOrnament(kind: .sparkles, color: "#FFE9FB", density: .low, layer: .front, motion: .loop)
                ],
                brand: CallFrameBrand(mark: .both, place: .bottom, color: "#F3E8FF", size: .m, font: StoryTextStyle.elegant),
                names: CallFrameNames(show: .name, style: .badge, font: .elegant, color: "#FFF6D6", fill: "#2A2466CC"),
                title: CallFrameTitle(source: .group, font: .elegant, color: "#FFF6D6", place: .top, size: .m, effect: CallFrameTextEffect.glow, letterCase: CallFrameLetterCase.upper),
                subtitle: nil
            ),
            surfaces: [.capture, .live]
        ),
        CallFrameDesign(
            id: "feerique.clair-de-lune.tablee",
            motif: "feerique.clair-de-lune",
            mood: .feerique,
            name: "Clair de lune",
            bucket: .tablee,
            look: CallFrameLook(
                layout: CallFrameLayout(arrangement: .honeycomb, margin: 0.05, gap: 0.02, top: 0.14, bottom: 0.11),
                slot: CallFrameSlotStyle(shape: .hex, radius: nil, stroke: CallFrameStroke(color: "#F3E8FF", width: 0.006), double: false, glow: "#C4B5FD88", shadow: false, card: nil, tilt: .none, tone: .cool, duotone: nil),
                background: .linear(colors: ["#0B0A26", "#2A2466", "#6A55B5", "#E2B6E8"], angle: 0.0),
                pattern: CallFramePattern(kind: .stars, color: "#FFF6D6", opacity: 0.25),
                border: nil,
                ornaments: [
                    CallFrameOrnament(kind: .moon, color: "#FFF6D6", density: .low, layer: .front, motion: .loop),
                    CallFrameOrnament(kind: .stars, color: "#FFF6D6", density: .mid, layer: .back, motion: .loop),
                    CallFrameOrnament(kind: .clouds, color: "#F3E8FF", density: .low, layer: .back, motion: .loop),
                    CallFrameOrnament(kind: .sparkles, color: "#FFE9FB", density: .low, layer: .front, motion: .loop)
                ],
                brand: CallFrameBrand(mark: .both, place: .bottom, color: "#F3E8FF", size: .m, font: StoryTextStyle.elegant),
                names: CallFrameNames(show: .name, style: .list, font: .elegant, color: "#FFF6D6", fill: nil),
                title: CallFrameTitle(source: .group, font: .elegant, color: "#FFF6D6", place: .top, size: .m, effect: CallFrameTextEffect.glow, letterCase: CallFrameLetterCase.upper),
                subtitle: nil
            ),
            surfaces: [.capture, .live]
        ),
        CallFrameDesign(
            id: "feerique.coeur-de-rose.duo",
            motif: "feerique.coeur-de-rose",
            mood: .feerique,
            name: "Cœur de rose",
            bucket: .duo,
            look: CallFrameLook(
                layout: CallFrameLayout(arrangement: .split, margin: 0.08, gap: 0.04, top: 0.16, bottom: 0.12),
                slot: CallFrameSlotStyle(shape: .heart, radius: nil, stroke: CallFrameStroke(color: "#FFFFFF", width: 0.014), double: false, glow: "#FF5C8DAA", shadow: false, card: nil, tilt: .gentle, tone: .warm, duotone: nil),
                background: .linear(colors: ["#FFB8D2", "#FFE4EE", "#FFC9DD"], angle: 0.0),
                pattern: CallFramePattern(kind: .hearts, color: "#FFFFFF", opacity: 0.4),
                border: nil,
                ornaments: [
                    CallFrameOrnament(kind: .hearts, color: "#FF3D7F", density: .mid, layer: .back, motion: .loop),
                    CallFrameOrnament(kind: .petals, color: "#FF8FB1", density: .mid, layer: .back, motion: .loop),
                    CallFrameOrnament(kind: .sparkles, color: "#FFFFFF", density: .mid, layer: .front, motion: .loop),
                    CallFrameOrnament(kind: .hearts, color: "#E0115F", density: .low, layer: .front, motion: .loop)
                ],
                brand: CallFrameBrand(mark: .both, place: .bottom, color: "#C9184A", size: .m, font: StoryTextStyle.handwriting),
                names: CallFrameNames(show: .both, style: .ribbon, font: .bubble, color: "#FFFFFF", fill: "#FF3D7F"),
                title: CallFrameTitle(source: .names, font: .handwriting, color: "#C9184A", place: .top, size: .l, effect: CallFrameTextEffect.shadow, letterCase: nil),
                subtitle: nil
            ),
            surfaces: [.capture, .live]
        )
    ]
}
