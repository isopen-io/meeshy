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
            )
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
            )
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
            )
        ),
        CallFrameDesign(
            id: "feerique.lucioles.duo",
            motif: "feerique.lucioles",
            mood: .feerique,
            name: "Lucioles",
            bucket: .duo,
            look: CallFrameLook(
                layout: CallFrameLayout(arrangement: .diagonal, margin: 0.07, gap: 0.03, top: 0.16, bottom: 0.1),
                slot: CallFrameSlotStyle(shape: .blob, radius: nil, stroke: nil, double: false, glow: "#FFD98A", shadow: false, card: nil, tilt: .gentle, tone: .warm, duotone: nil),
                background: .radial(colors: ["#1D3530", "#0C1A18", "#050B0A"]),
                pattern: nil,
                border: nil,
                ornaments: [
                    CallFrameOrnament(kind: .fireflies, color: "#FFE9A8", density: .high, layer: .back),
                    CallFrameOrnament(kind: .bokeh, color: "#F6D58A33", density: .low, layer: .back),
                    CallFrameOrnament(kind: .leaves, color: "#2F5A47", density: .mid, layer: .back)
                ],
                brand: CallFrameBrand(mark: .logo, place: .topRight, color: "#FFE9A8", size: .s, font: nil),
                names: CallFrameNames(show: .handle, style: .tag, font: .handwriting, color: "#FFE9A8", fill: "#0A1412CC"),
                title: CallFrameTitle(source: .names, font: .curve, color: "#FFE9A8", place: .top, size: .l, effect: CallFrameTextEffect.glow, letterCase: CallFrameLetterCase.asIs),
                subtitle: nil
            )
        ),
        CallFrameDesign(
            id: "feerique.lucioles.comite",
            motif: "feerique.lucioles",
            mood: .feerique,
            name: "Lucioles",
            bucket: .comite,
            look: CallFrameLook(
                layout: CallFrameLayout(arrangement: .scatter, margin: 0.07, gap: 0.03, top: 0.16, bottom: 0.1),
                slot: CallFrameSlotStyle(shape: .blob, radius: nil, stroke: nil, double: false, glow: "#FFD98A", shadow: false, card: nil, tilt: .gentle, tone: .warm, duotone: nil),
                background: .radial(colors: ["#1D3530", "#0C1A18", "#050B0A"]),
                pattern: nil,
                border: nil,
                ornaments: [
                    CallFrameOrnament(kind: .fireflies, color: "#FFE9A8", density: .high, layer: .back),
                    CallFrameOrnament(kind: .bokeh, color: "#F6D58A33", density: .low, layer: .back),
                    CallFrameOrnament(kind: .leaves, color: "#2F5A47", density: .mid, layer: .back)
                ],
                brand: CallFrameBrand(mark: .logo, place: .topRight, color: "#FFE9A8", size: .s, font: nil),
                names: CallFrameNames(show: .handle, style: .badge, font: .curve, color: "#FFE9A8", fill: "#0A1412CC"),
                title: CallFrameTitle(source: .group, font: .curve, color: "#FFE9A8", place: .top, size: .l, effect: CallFrameTextEffect.glow, letterCase: CallFrameLetterCase.asIs),
                subtitle: nil
            )
        ),
        CallFrameDesign(
            id: "feerique.lucioles.groupe",
            motif: "feerique.lucioles",
            mood: .feerique,
            name: "Lucioles",
            bucket: .groupe,
            look: CallFrameLook(
                layout: CallFrameLayout(arrangement: .hero, margin: 0.06, gap: 0.025, top: 0.15, bottom: 0.1),
                slot: CallFrameSlotStyle(shape: .blob, radius: nil, stroke: nil, double: false, glow: "#FFD98A", shadow: false, card: nil, tilt: .gentle, tone: .warm, duotone: nil),
                background: .radial(colors: ["#1D3530", "#0C1A18", "#050B0A"]),
                pattern: nil,
                border: nil,
                ornaments: [
                    CallFrameOrnament(kind: .fireflies, color: "#FFE9A8", density: .high, layer: .back),
                    CallFrameOrnament(kind: .bokeh, color: "#F6D58A33", density: .mid, layer: .back),
                    CallFrameOrnament(kind: .sparkles, color: "#FFE9A8", density: .low, layer: .front)
                ],
                brand: CallFrameBrand(mark: .logo, place: .topRight, color: "#FFE9A8", size: .s, font: nil),
                names: CallFrameNames(show: .handle, style: .badge, font: .curve, color: "#FFE9A8", fill: "#0A1412CC"),
                title: CallFrameTitle(source: .group, font: .curve, color: "#FFE9A8", place: .top, size: .l, effect: CallFrameTextEffect.glow, letterCase: CallFrameLetterCase.asIs),
                subtitle: nil
            )
        ),
        CallFrameDesign(
            id: "feerique.lucioles.tablee",
            motif: "feerique.lucioles",
            mood: .feerique,
            name: "Lucioles",
            bucket: .tablee,
            look: CallFrameLook(
                layout: CallFrameLayout(arrangement: .grid, margin: 0.05, gap: 0.018, top: 0.14, bottom: 0.09),
                slot: CallFrameSlotStyle(shape: .circle, radius: nil, stroke: nil, double: false, glow: "#FFD98AAA", shadow: false, card: nil, tilt: .gentle, tone: .warm, duotone: nil),
                background: .radial(colors: ["#1D3530", "#0C1A18", "#050B0A"]),
                pattern: nil,
                border: nil,
                ornaments: [
                    CallFrameOrnament(kind: .fireflies, color: "#FFE9A8", density: .high, layer: .back),
                    CallFrameOrnament(kind: .bokeh, color: "#F6D58A33", density: .low, layer: .back),
                    CallFrameOrnament(kind: .leaves, color: "#2F5A47", density: .mid, layer: .back)
                ],
                brand: CallFrameBrand(mark: .logo, place: .topRight, color: "#FFE9A8", size: .s, font: nil),
                names: CallFrameNames(show: .none, style: .badge, font: .curve, color: "#FFE9A8", fill: nil),
                title: CallFrameTitle(source: .group, font: .curve, color: "#FFE9A8", place: .top, size: .l, effect: CallFrameTextEffect.glow, letterCase: CallFrameLetterCase.asIs),
                subtitle: nil
            )
        ),
        CallFrameDesign(
            id: "feerique.clair-de-lune.duo",
            motif: "feerique.clair-de-lune",
            mood: .feerique,
            name: "Clair de lune",
            bucket: .duo,
            look: CallFrameLook(
                layout: CallFrameLayout(arrangement: .column, margin: 0.08, gap: 0.04, top: 0.2, bottom: 0.14),
                slot: CallFrameSlotStyle(shape: .circle, radius: nil, stroke: CallFrameStroke(color: "#F9C6D3", width: 0.006), double: false, glow: "#C7B8F0", shadow: false, card: nil, tilt: .none, tone: .cool, duotone: nil),
                background: .linear(colors: ["#1E2A5A", "#4B4A8F", "#6E5BA8"], angle: 0.0),
                pattern: CallFramePattern(kind: .stars, color: "#FFFFFF", opacity: 0.25),
                border: nil,
                ornaments: [
                    CallFrameOrnament(kind: .moon, color: "#FFF6D8", density: .low, layer: .front),
                    CallFrameOrnament(kind: .clouds, color: "#FFFFFF2E", density: .low, layer: .back),
                    CallFrameOrnament(kind: .sparkles, color: "#FFF6D8", density: .low, layer: .front),
                    CallFrameOrnament(kind: .snow, color: "#FFFFFFB3", density: .low, layer: .back)
                ],
                brand: CallFrameBrand(mark: .both, place: .bottomLeft, color: "#FFF6D8", size: .s, font: StoryTextStyle.curve),
                names: CallFrameNames(show: .name, style: .caption, font: .curve, color: "#FFFFFF", fill: nil),
                title: CallFrameTitle(source: .names, font: .calligraphy, color: "#FFF6D8", place: .top, size: .l, effect: CallFrameTextEffect.glow, letterCase: CallFrameLetterCase.asIs),
                subtitle: CallFrameTitle(source: .date, font: .curve, color: "#F9C6D3", place: .top, size: .s, effect: CallFrameTextEffect.none, letterCase: CallFrameLetterCase.asIs)
            )
        ),
        CallFrameDesign(
            id: "feerique.clair-de-lune.comite",
            motif: "feerique.clair-de-lune",
            mood: .feerique,
            name: "Clair de lune",
            bucket: .comite,
            look: CallFrameLook(
                layout: CallFrameLayout(arrangement: .orbit, margin: 0.07, gap: 0.03, top: 0.18, bottom: 0.12),
                slot: CallFrameSlotStyle(shape: .circle, radius: nil, stroke: CallFrameStroke(color: "#F9C6D3", width: 0.006), double: false, glow: "#C7B8F0", shadow: false, card: nil, tilt: .none, tone: .cool, duotone: nil),
                background: .linear(colors: ["#1E2A5A", "#4B4A8F", "#6E5BA8"], angle: 0.0),
                pattern: CallFramePattern(kind: .stars, color: "#FFFFFF", opacity: 0.25),
                border: nil,
                ornaments: [
                    CallFrameOrnament(kind: .moon, color: "#FFF6D8", density: .low, layer: .front),
                    CallFrameOrnament(kind: .clouds, color: "#FFFFFF2E", density: .low, layer: .back),
                    CallFrameOrnament(kind: .sparkles, color: "#FFF6D8", density: .low, layer: .front),
                    CallFrameOrnament(kind: .snow, color: "#FFFFFFB3", density: .low, layer: .back)
                ],
                brand: CallFrameBrand(mark: .both, place: .bottomLeft, color: "#FFF6D8", size: .s, font: StoryTextStyle.curve),
                names: CallFrameNames(show: .name, style: .caption, font: .curve, color: "#FFFFFF", fill: nil),
                title: CallFrameTitle(source: .group, font: .calligraphy, color: "#FFF6D8", place: .top, size: .l, effect: CallFrameTextEffect.glow, letterCase: CallFrameLetterCase.asIs),
                subtitle: CallFrameTitle(source: .date, font: .curve, color: "#F9C6D3", place: .top, size: .s, effect: CallFrameTextEffect.none, letterCase: CallFrameLetterCase.asIs)
            )
        ),
        CallFrameDesign(
            id: "feerique.clair-de-lune.groupe",
            motif: "feerique.clair-de-lune",
            mood: .feerique,
            name: "Clair de lune",
            bucket: .groupe,
            look: CallFrameLook(
                layout: CallFrameLayout(arrangement: .scatter, margin: 0.06, gap: 0.025, top: 0.17, bottom: 0.12),
                slot: CallFrameSlotStyle(shape: .circle, radius: nil, stroke: CallFrameStroke(color: "#F9C6D3", width: 0.006), double: false, glow: "#C7B8F0", shadow: false, card: nil, tilt: .none, tone: .cool, duotone: nil),
                background: .linear(colors: ["#1E2A5A", "#4B4A8F", "#6E5BA8"], angle: 0.0),
                pattern: CallFramePattern(kind: .stars, color: "#FFFFFF", opacity: 0.25),
                border: nil,
                ornaments: [
                    CallFrameOrnament(kind: .moon, color: "#FFF6D8", density: .low, layer: .front),
                    CallFrameOrnament(kind: .clouds, color: "#FFFFFF2E", density: .low, layer: .back),
                    CallFrameOrnament(kind: .sparkles, color: "#FFF6D8", density: .low, layer: .front),
                    CallFrameOrnament(kind: .snow, color: "#FFFFFFB3", density: .low, layer: .back)
                ],
                brand: CallFrameBrand(mark: .both, place: .bottomLeft, color: "#FFF6D8", size: .s, font: StoryTextStyle.curve),
                names: CallFrameNames(show: .name, style: .badge, font: .curve, color: "#FFFFFF", fill: "#1E2A5ACC"),
                title: CallFrameTitle(source: .group, font: .calligraphy, color: "#FFF6D8", place: .top, size: .l, effect: CallFrameTextEffect.glow, letterCase: CallFrameLetterCase.asIs),
                subtitle: CallFrameTitle(source: .date, font: .curve, color: "#F9C6D3", place: .top, size: .s, effect: CallFrameTextEffect.none, letterCase: CallFrameLetterCase.asIs)
            )
        ),
        CallFrameDesign(
            id: "feerique.clair-de-lune.tablee",
            motif: "feerique.clair-de-lune",
            mood: .feerique,
            name: "Clair de lune",
            bucket: .tablee,
            look: CallFrameLook(
                layout: CallFrameLayout(arrangement: .grid, margin: 0.05, gap: 0.018, top: 0.16, bottom: 0.1),
                slot: CallFrameSlotStyle(shape: .circle, radius: nil, stroke: CallFrameStroke(color: "#F9C6D3", width: 0.004), double: false, glow: nil, shadow: false, card: nil, tilt: .none, tone: .cool, duotone: nil),
                background: .linear(colors: ["#1E2A5A", "#4B4A8F", "#6E5BA8"], angle: 0.0),
                pattern: CallFramePattern(kind: .stars, color: "#FFFFFF", opacity: 0.25),
                border: nil,
                ornaments: [
                    CallFrameOrnament(kind: .moon, color: "#FFF6D8", density: .low, layer: .front),
                    CallFrameOrnament(kind: .clouds, color: "#FFFFFF2E", density: .low, layer: .back),
                    CallFrameOrnament(kind: .sparkles, color: "#FFF6D8", density: .low, layer: .front),
                    CallFrameOrnament(kind: .snow, color: "#FFFFFFB3", density: .low, layer: .back)
                ],
                brand: CallFrameBrand(mark: .both, place: .bottomLeft, color: "#FFF6D8", size: .s, font: StoryTextStyle.curve),
                names: CallFrameNames(show: .none, style: .badge, font: .curve, color: "#FFFFFF", fill: nil),
                title: CallFrameTitle(source: .group, font: .calligraphy, color: "#FFF6D8", place: .top, size: .l, effect: CallFrameTextEffect.glow, letterCase: CallFrameLetterCase.asIs),
                subtitle: CallFrameTitle(source: .date, font: .curve, color: "#F9C6D3", place: .top, size: .s, effect: CallFrameTextEffect.none, letterCase: CallFrameLetterCase.asIs)
            )
        ),
        CallFrameDesign(
            id: "feerique.coeur-de-rose.duo",
            motif: "feerique.coeur-de-rose",
            mood: .feerique,
            name: "Cœur de rose",
            bucket: .duo,
            look: CallFrameLook(
                layout: CallFrameLayout(arrangement: .split, margin: 0.08, gap: 0.04, top: 0.16, bottom: 0.12),
                slot: CallFrameSlotStyle(shape: .heart, radius: nil, stroke: CallFrameStroke(color: "#FFFFFF", width: 0.008), double: false, glow: "#FFB3C7", shadow: false, card: nil, tilt: .gentle, tone: .warm, duotone: nil),
                background: .linear(colors: ["#F9C6D3", "#FCE3EA", "#BFE6D2"], angle: 0.0),
                pattern: CallFramePattern(kind: .hearts, color: "#FFFFFF", opacity: 0.35),
                border: nil,
                ornaments: [
                    CallFrameOrnament(kind: .petals, color: "#F28FAD", density: .high, layer: .back),
                    CallFrameOrnament(kind: .sparkles, color: "#D4AF6A", density: .low, layer: .front),
                    CallFrameOrnament(kind: .hearts, color: "#F28BA8", density: .low, layer: .back)
                ],
                brand: CallFrameBrand(mark: .logo, place: .bottom, color: "#8C3B5C", size: .m, font: nil),
                names: CallFrameNames(show: .both, style: .ribbon, font: .curve, color: "#FFFFFF", fill: "#C24D78"),
                title: CallFrameTitle(source: .names, font: .calligraphy, color: "#8C3B5C", place: .top, size: .l, effect: CallFrameTextEffect.none, letterCase: CallFrameLetterCase.asIs),
                subtitle: CallFrameTitle(source: .date, font: .handwriting, color: "#A0587A", place: .top, size: .s, effect: CallFrameTextEffect.none, letterCase: CallFrameLetterCase.asIs)
            )
        )
    ]
}
