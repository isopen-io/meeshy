// GÉNÉRÉ — ne pas éditer; source: packages/shared/design/call-capture-frames
// Régénérer : `cd packages/shared && bun run generate:call-frames`.
// Fraîcheur gardée par packages/shared/__tests__/call-capture-frames-swift.test.ts.

import MeeshySDK

nonisolated extension CallFrameCatalogue {
    static let fantastiqueFrames: [CallFrameDesign] = [
        CallFrameDesign(
            id: "fantastique.tarot.duo",
            motif: "fantastique.tarot",
            mood: .fantastique,
            name: "Tarot",
            bucket: .duo,
            look: CallFrameLook(
                layout: CallFrameLayout(arrangement: .cascade, margin: 0.08, gap: 0.03, top: 0.2, bottom: 0.1),
                slot: CallFrameSlotStyle(shape: .round, radius: 0.04, stroke: CallFrameStroke(color: "#D4AF37", width: 0.008), double: true, glow: nil, shadow: true, card: CallFrameCard(color: "#241338", pad: 0.05, foot: 0.05), tilt: .gentle, tone: .warm, duotone: nil),
                background: .linear(colors: ["#2E1A47", "#140B24"], angle: 0.0),
                pattern: CallFramePattern(kind: .stars, color: "#D4AF37", opacity: 0.18),
                border: CallFrameBorder(kind: .baroque, color: "#D4AF37", width: 0.006, inset: 0.025),
                ornaments: [
                    CallFrameOrnament(kind: .stars, color: "#D4AF3766", density: .mid, layer: .back),
                    CallFrameOrnament(kind: .moon, color: "#F3E2A9", density: .low, layer: .front)
                ],
                brand: CallFrameBrand(mark: .logo, place: .topRight, color: "#D4AF37", size: .s, font: nil),
                names: CallFrameNames(show: .name, style: .ribbon, font: .fantasy, color: "#2E1A47", fill: "#F3E2A9"),
                title: CallFrameTitle(source: .names, font: .fantasy, color: "#D4AF37", place: .top, size: .l, effect: CallFrameTextEffect.glow, letterCase: nil),
                subtitle: CallFrameTitle(source: .date, font: .calligraphy, color: "#F3E2A9", place: .top, size: .s, effect: nil, letterCase: nil)
            )
        ),
        CallFrameDesign(
            id: "fantastique.tarot.comite",
            motif: "fantastique.tarot",
            mood: .fantastique,
            name: "Tarot",
            bucket: .comite,
            look: CallFrameLook(
                layout: CallFrameLayout(arrangement: .arch, margin: 0.07, gap: 0.03, top: 0.2, bottom: 0.12),
                slot: CallFrameSlotStyle(shape: .round, radius: 0.04, stroke: CallFrameStroke(color: "#D4AF37", width: 0.008), double: true, glow: nil, shadow: true, card: CallFrameCard(color: "#241338", pad: 0.05, foot: 0.05), tilt: .gentle, tone: .warm, duotone: nil),
                background: .linear(colors: ["#2E1A47", "#140B24"], angle: 0.0),
                pattern: CallFramePattern(kind: .stars, color: "#D4AF37", opacity: 0.18),
                border: CallFrameBorder(kind: .baroque, color: "#D4AF37", width: 0.006, inset: 0.025),
                ornaments: [
                    CallFrameOrnament(kind: .stars, color: "#D4AF3766", density: .mid, layer: .back),
                    CallFrameOrnament(kind: .moon, color: "#F3E2A9", density: .low, layer: .front)
                ],
                brand: CallFrameBrand(mark: .logo, place: .topRight, color: "#D4AF37", size: .s, font: nil),
                names: CallFrameNames(show: .name, style: .plate, font: .fantasy, color: "#F3E2A9", fill: "#2E1A47E6"),
                title: CallFrameTitle(source: .group, font: .fantasy, color: "#D4AF37", place: .top, size: .l, effect: CallFrameTextEffect.glow, letterCase: CallFrameLetterCase.upper),
                subtitle: CallFrameTitle(source: .date, font: .calligraphy, color: "#F3E2A9", place: .top, size: .s, effect: nil, letterCase: nil)
            )
        ),
        CallFrameDesign(
            id: "fantastique.tarot.groupe",
            motif: "fantastique.tarot",
            mood: .fantastique,
            name: "Tarot",
            bucket: .groupe,
            look: CallFrameLook(
                layout: CallFrameLayout(arrangement: .tiers, margin: 0.06, gap: 0.02, top: 0.18, bottom: 0.1),
                slot: CallFrameSlotStyle(shape: .round, radius: 0.04, stroke: CallFrameStroke(color: "#D4AF37", width: 0.008), double: true, glow: nil, shadow: true, card: CallFrameCard(color: "#241338", pad: 0.05, foot: 0.05), tilt: .none, tone: .warm, duotone: nil),
                background: .linear(colors: ["#2E1A47", "#140B24"], angle: 0.0),
                pattern: CallFramePattern(kind: .stars, color: "#D4AF37", opacity: 0.18),
                border: CallFrameBorder(kind: .baroque, color: "#D4AF37", width: 0.006, inset: 0.025),
                ornaments: [
                    CallFrameOrnament(kind: .stars, color: "#D4AF3766", density: .mid, layer: .back),
                    CallFrameOrnament(kind: .moon, color: "#F3E2A9", density: .low, layer: .front)
                ],
                brand: CallFrameBrand(mark: .logo, place: .topRight, color: "#D4AF37", size: .s, font: nil),
                names: CallFrameNames(show: .name, style: .badge, font: .fantasy, color: "#F3E2A9", fill: "#140B24D9"),
                title: CallFrameTitle(source: .group, font: .fantasy, color: "#D4AF37", place: .top, size: .l, effect: CallFrameTextEffect.glow, letterCase: CallFrameLetterCase.upper),
                subtitle: CallFrameTitle(source: .date, font: .calligraphy, color: "#F3E2A9", place: .top, size: .s, effect: nil, letterCase: nil)
            )
        ),
        CallFrameDesign(
            id: "fantastique.tarot.tablee",
            motif: "fantastique.tarot",
            mood: .fantastique,
            name: "Tarot",
            bucket: .tablee,
            look: CallFrameLook(
                layout: CallFrameLayout(arrangement: .grid, margin: 0.05, gap: 0.015, top: 0.14, bottom: 0.08),
                slot: CallFrameSlotStyle(shape: .round, radius: 0.04, stroke: CallFrameStroke(color: "#D4AF37", width: 0.004), double: false, glow: nil, shadow: false, card: nil, tilt: .none, tone: .warm, duotone: nil),
                background: .linear(colors: ["#2E1A47", "#140B24"], angle: 0.0),
                pattern: CallFramePattern(kind: .stars, color: "#D4AF37", opacity: 0.18),
                border: CallFrameBorder(kind: .baroque, color: "#D4AF37", width: 0.006, inset: 0.025),
                ornaments: [
                    CallFrameOrnament(kind: .stars, color: "#D4AF3755", density: .low, layer: .back)
                ],
                brand: CallFrameBrand(mark: .logo, place: .topRight, color: "#D4AF37", size: .s, font: nil),
                names: CallFrameNames(show: .none, style: .badge, font: .fantasy, color: "#F3E2A9", fill: nil),
                title: CallFrameTitle(source: .group, font: .fantasy, color: "#D4AF37", place: .top, size: .l, effect: CallFrameTextEffect.glow, letterCase: CallFrameLetterCase.upper),
                subtitle: CallFrameTitle(source: .date, font: .calligraphy, color: "#F3E2A9", place: .top, size: .s, effect: nil, letterCase: nil)
            )
        ),
        CallFrameDesign(
            id: "fantastique.grimoire.duo",
            motif: "fantastique.grimoire",
            mood: .fantastique,
            name: "Grimoire",
            bucket: .duo,
            look: CallFrameLook(
                layout: CallFrameLayout(arrangement: .split, margin: 0.09, gap: 0.04, top: 0.2, bottom: 0.12),
                slot: CallFrameSlotStyle(shape: .arch, radius: nil, stroke: CallFrameStroke(color: "#5B3A1E", width: 0.006), double: false, glow: nil, shadow: true, card: nil, tilt: .none, tone: .sepia, duotone: nil),
                background: .linear(colors: ["#E9D8B4", "#CDB384"], angle: 0.0),
                pattern: CallFramePattern(kind: .damask, color: "#7A5A2F", opacity: 0.08),
                border: CallFrameBorder(kind: .baroque, color: "#5B3A1E", width: 0.007, inset: 0.03),
                ornaments: [
                    CallFrameOrnament(kind: .runes, color: "#7A5A2F40", density: .low, layer: .back),
                    CallFrameOrnament(kind: .vignette, color: "#5B3A1E66", density: .mid, layer: .back),
                    CallFrameOrnament(kind: .candles, color: "#B8862B", density: .low, layer: .front)
                ],
                brand: CallFrameBrand(mark: .wordmark, place: .bottom, color: "#5B3A1E", size: .m, font: StoryTextStyle.calligraphy),
                names: CallFrameNames(show: .name, style: .caption, font: .calligraphy, color: "#3B2412", fill: nil),
                title: CallFrameTitle(source: .names, font: .calligraphy, color: "#3B2412", place: .top, size: .l, effect: CallFrameTextEffect.none, letterCase: nil),
                subtitle: CallFrameTitle(source: .date, font: .fantasy, color: "#7A5A2F", place: .top, size: .s, effect: CallFrameTextEffect.none, letterCase: CallFrameLetterCase.upper)
            )
        ),
        CallFrameDesign(
            id: "fantastique.grimoire.comite",
            motif: "fantastique.grimoire",
            mood: .fantastique,
            name: "Grimoire",
            bucket: .comite,
            look: CallFrameLook(
                layout: CallFrameLayout(arrangement: .hero, margin: 0.08, gap: 0.03, top: 0.2, bottom: 0.12),
                slot: CallFrameSlotStyle(shape: .arch, radius: nil, stroke: CallFrameStroke(color: "#5B3A1E", width: 0.006), double: false, glow: nil, shadow: true, card: nil, tilt: .none, tone: .sepia, duotone: nil),
                background: .linear(colors: ["#E9D8B4", "#CDB384"], angle: 0.0),
                pattern: CallFramePattern(kind: .damask, color: "#7A5A2F", opacity: 0.08),
                border: CallFrameBorder(kind: .baroque, color: "#5B3A1E", width: 0.007, inset: 0.03),
                ornaments: [
                    CallFrameOrnament(kind: .runes, color: "#7A5A2F40", density: .low, layer: .back),
                    CallFrameOrnament(kind: .vignette, color: "#5B3A1E66", density: .mid, layer: .back),
                    CallFrameOrnament(kind: .candles, color: "#B8862B", density: .low, layer: .front)
                ],
                brand: CallFrameBrand(mark: .wordmark, place: .bottom, color: "#5B3A1E", size: .m, font: StoryTextStyle.calligraphy),
                names: CallFrameNames(show: .name, style: .caption, font: .calligraphy, color: "#3B2412", fill: nil),
                title: CallFrameTitle(source: .group, font: .calligraphy, color: "#3B2412", place: .top, size: .l, effect: CallFrameTextEffect.none, letterCase: nil),
                subtitle: CallFrameTitle(source: .date, font: .fantasy, color: "#7A5A2F", place: .top, size: .s, effect: CallFrameTextEffect.none, letterCase: CallFrameLetterCase.upper)
            )
        ),
        CallFrameDesign(
            id: "fantastique.grimoire.groupe",
            motif: "fantastique.grimoire",
            mood: .fantastique,
            name: "Grimoire",
            bucket: .groupe,
            look: CallFrameLook(
                layout: CallFrameLayout(arrangement: .grid, margin: 0.07, gap: 0.025, top: 0.18, bottom: 0.16),
                slot: CallFrameSlotStyle(shape: .oval, radius: nil, stroke: CallFrameStroke(color: "#5B3A1E", width: 0.005), double: true, glow: nil, shadow: false, card: nil, tilt: .none, tone: .sepia, duotone: nil),
                background: .linear(colors: ["#E9D8B4", "#CDB384"], angle: 0.0),
                pattern: CallFramePattern(kind: .damask, color: "#7A5A2F", opacity: 0.08),
                border: CallFrameBorder(kind: .baroque, color: "#5B3A1E", width: 0.007, inset: 0.03),
                ornaments: [
                    CallFrameOrnament(kind: .runes, color: "#7A5A2F40", density: .low, layer: .back),
                    CallFrameOrnament(kind: .vignette, color: "#5B3A1E66", density: .mid, layer: .back),
                    CallFrameOrnament(kind: .candles, color: "#B8862B", density: .low, layer: .front)
                ],
                brand: CallFrameBrand(mark: .wordmark, place: .bottom, color: "#5B3A1E", size: .m, font: StoryTextStyle.calligraphy),
                names: CallFrameNames(show: .name, style: .list, font: .calligraphy, color: "#3B2412", fill: nil),
                title: CallFrameTitle(source: .group, font: .calligraphy, color: "#3B2412", place: .top, size: .l, effect: CallFrameTextEffect.none, letterCase: nil),
                subtitle: CallFrameTitle(source: .date, font: .fantasy, color: "#7A5A2F", place: .top, size: .s, effect: CallFrameTextEffect.none, letterCase: CallFrameLetterCase.upper)
            )
        ),
        CallFrameDesign(
            id: "fantastique.portail.duo",
            motif: "fantastique.portail",
            mood: .fantastique,
            name: "Portail",
            bucket: .duo,
            look: CallFrameLook(
                layout: CallFrameLayout(arrangement: .diagonal, margin: 0.07, gap: 0.03, top: 0.16, bottom: 0.1),
                slot: CallFrameSlotStyle(shape: .circle, radius: nil, stroke: CallFrameStroke(color: "#D4AF37", width: 0.006), double: false, glow: "#50C878", shadow: false, card: nil, tilt: .none, tone: .duotone, duotone: CallFrameDuotone(shadow: "#1A0E2E", light: "#C6F7DE")),
                background: .radial(colors: ["#0E3B2E", "#2E1A47", "#0A0614"]),
                pattern: nil,
                border: nil,
                ornaments: [
                    CallFrameOrnament(kind: .orbits, color: "#D4AF3780", density: .mid, layer: .back),
                    CallFrameOrnament(kind: .runes, color: "#50C87866", density: .mid, layer: .back),
                    CallFrameOrnament(kind: .sparkles, color: "#F3E2A9", density: .low, layer: .front)
                ],
                brand: CallFrameBrand(mark: .both, place: .bottom, color: "#D4AF37", size: .m, font: nil),
                names: CallFrameNames(show: .handle, style: .caption, font: .fantasy, color: "#F3E2A9", fill: nil),
                title: CallFrameTitle(source: .names, font: .fantasy, color: "#F3E2A9", place: .top, size: .l, effect: CallFrameTextEffect.glow, letterCase: nil),
                subtitle: nil
            )
        ),
        CallFrameDesign(
            id: "fantastique.portail.comite",
            motif: "fantastique.portail",
            mood: .fantastique,
            name: "Portail",
            bucket: .comite,
            look: CallFrameLook(
                layout: CallFrameLayout(arrangement: .orbit, margin: 0.07, gap: 0.03, top: 0.16, bottom: 0.1),
                slot: CallFrameSlotStyle(shape: .circle, radius: nil, stroke: CallFrameStroke(color: "#D4AF37", width: 0.006), double: false, glow: "#50C878", shadow: false, card: nil, tilt: .none, tone: .duotone, duotone: CallFrameDuotone(shadow: "#1A0E2E", light: "#C6F7DE")),
                background: .radial(colors: ["#0E3B2E", "#2E1A47", "#0A0614"]),
                pattern: nil,
                border: nil,
                ornaments: [
                    CallFrameOrnament(kind: .orbits, color: "#D4AF3780", density: .mid, layer: .back),
                    CallFrameOrnament(kind: .runes, color: "#50C87866", density: .mid, layer: .back),
                    CallFrameOrnament(kind: .sparkles, color: "#F3E2A9", density: .low, layer: .front)
                ],
                brand: CallFrameBrand(mark: .both, place: .bottom, color: "#D4AF37", size: .m, font: nil),
                names: CallFrameNames(show: .handle, style: .badge, font: .fantasy, color: "#F3E2A9", fill: "#140B24D9"),
                title: CallFrameTitle(source: .group, font: .fantasy, color: "#F3E2A9", place: .top, size: .l, effect: CallFrameTextEffect.glow, letterCase: nil),
                subtitle: nil
            )
        ),
        CallFrameDesign(
            id: "fantastique.portail.groupe",
            motif: "fantastique.portail",
            mood: .fantastique,
            name: "Portail",
            bucket: .groupe,
            look: CallFrameLook(
                layout: CallFrameLayout(arrangement: .scatter, margin: 0.06, gap: 0.03, top: 0.16, bottom: 0.1),
                slot: CallFrameSlotStyle(shape: .circle, radius: nil, stroke: CallFrameStroke(color: "#D4AF37", width: 0.006), double: false, glow: "#50C878", shadow: false, card: nil, tilt: .none, tone: .duotone, duotone: CallFrameDuotone(shadow: "#1A0E2E", light: "#C6F7DE")),
                background: .radial(colors: ["#0E3B2E", "#2E1A47", "#0A0614"]),
                pattern: nil,
                border: nil,
                ornaments: [
                    CallFrameOrnament(kind: .orbits, color: "#D4AF3780", density: .mid, layer: .back),
                    CallFrameOrnament(kind: .runes, color: "#50C87866", density: .mid, layer: .back),
                    CallFrameOrnament(kind: .sparkles, color: "#F3E2A9", density: .low, layer: .front)
                ],
                brand: CallFrameBrand(mark: .both, place: .bottom, color: "#D4AF37", size: .m, font: nil),
                names: CallFrameNames(show: .handle, style: .badge, font: .fantasy, color: "#F3E2A9", fill: "#140B24D9"),
                title: CallFrameTitle(source: .group, font: .fantasy, color: "#F3E2A9", place: .top, size: .l, effect: CallFrameTextEffect.glow, letterCase: nil),
                subtitle: nil
            )
        ),
        CallFrameDesign(
            id: "fantastique.portail.tablee",
            motif: "fantastique.portail",
            mood: .fantastique,
            name: "Portail",
            bucket: .tablee,
            look: CallFrameLook(
                layout: CallFrameLayout(arrangement: .grid, margin: 0.05, gap: 0.02, top: 0.14, bottom: 0.08),
                slot: CallFrameSlotStyle(shape: .circle, radius: nil, stroke: CallFrameStroke(color: "#D4AF37", width: 0.004), double: false, glow: nil, shadow: false, card: nil, tilt: .none, tone: .duotone, duotone: CallFrameDuotone(shadow: "#1A0E2E", light: "#C6F7DE")),
                background: .radial(colors: ["#0E3B2E", "#2E1A47", "#0A0614"]),
                pattern: nil,
                border: nil,
                ornaments: [
                    CallFrameOrnament(kind: .orbits, color: "#D4AF3780", density: .mid, layer: .back),
                    CallFrameOrnament(kind: .runes, color: "#50C87866", density: .mid, layer: .back),
                    CallFrameOrnament(kind: .sparkles, color: "#F3E2A9", density: .low, layer: .front)
                ],
                brand: CallFrameBrand(mark: .both, place: .bottom, color: "#D4AF37", size: .m, font: nil),
                names: CallFrameNames(show: .none, style: .badge, font: .fantasy, color: "#F3E2A9", fill: nil),
                title: CallFrameTitle(source: .group, font: .fantasy, color: "#F3E2A9", place: .top, size: .l, effect: CallFrameTextEffect.glow, letterCase: nil),
                subtitle: nil
            )
        ),
        CallFrameDesign(
            id: "fantastique.pacte.duo",
            motif: "fantastique.pacte",
            mood: .fantastique,
            name: "Pacte",
            bucket: .duo,
            look: CallFrameLook(
                layout: CallFrameLayout(arrangement: .column, margin: 0.08, gap: 0.05, top: 0.22, bottom: 0.14),
                slot: CallFrameSlotStyle(shape: .diamond, radius: nil, stroke: CallFrameStroke(color: "#D4AF37", width: 0.007), double: true, glow: "#50C87899", shadow: false, card: nil, tilt: .none, tone: .warm, duotone: nil),
                background: .linear(colors: ["#0B3D2E", "#062019"], angle: 20.0),
                pattern: CallFramePattern(kind: .damask, color: "#D4AF37", opacity: 0.07),
                border: CallFrameBorder(kind: .double, color: "#D4AF37", width: 0.005, inset: 0.03),
                ornaments: [
                    CallFrameOrnament(kind: .runes, color: "#D4AF3759", density: .mid, layer: .back),
                    CallFrameOrnament(kind: .lightning, color: "#C6F7DE", density: .low, layer: .front)
                ],
                brand: CallFrameBrand(mark: .wordmark, place: .watermark, color: "#D4AF3726", size: .s, font: nil),
                names: CallFrameNames(show: .both, style: .ribbon, font: .calligraphy, color: "#062019", fill: "#D4AF37"),
                title: CallFrameTitle(source: .names, font: .calligraphy, color: "#F3E2A9", place: .top, size: .l, effect: CallFrameTextEffect.glow, letterCase: nil),
                subtitle: CallFrameTitle(source: .date, font: .fantasy, color: "#D4AF37", place: .top, size: .s, effect: CallFrameTextEffect.none, letterCase: CallFrameLetterCase.upper)
            )
        )
    ]
}
