// GÉNÉRÉ — ne pas éditer; source: packages/shared/design/call-capture-frames
// Régénérer : `cd packages/shared && bun run generate:call-frames`.
// Fraîcheur gardée par packages/shared/__tests__/call-capture-frames-swift.test.ts.

import MeeshySDK

nonisolated extension CallFrameCatalogue {
    static let horsNormeFrames: [CallFrameDesign] = [
        CallFrameDesign(
            id: "hors-norme.pop-art.duo",
            motif: "hors-norme.pop-art",
            mood: .horsNorme,
            name: "Pop Art",
            bucket: .duo,
            look: CallFrameLook(
                layout: CallFrameLayout(arrangement: .diagonal, margin: 0.07, gap: 0.03, top: 0.15, bottom: 0.1),
                slot: CallFrameSlotStyle(shape: .rect, radius: nil, stroke: CallFrameStroke(color: "#111111", width: 0.014), double: false, glow: nil, shadow: true, card: nil, tilt: .gentle, tone: .duotone, duotone: CallFrameDuotone(shadow: "#2B1BD1", light: "#FF8AD8")),
                background: .solid(color: "#FFE600"),
                pattern: CallFramePattern(kind: .halftone, color: "#FF2E63", opacity: 0.55),
                border: CallFrameBorder(kind: .double, color: "#111111", width: 0.012, inset: 0.025),
                ornaments: [
                    CallFrameOrnament(kind: .rays, color: "#FFFFFF", density: .mid, layer: .back, motion: .loop),
                    CallFrameOrnament(kind: .lightning, color: "#FF2E63", density: .mid, layer: .front, motion: .loop),
                    CallFrameOrnament(kind: .stars, color: "#111111", density: .low, layer: .front, motion: .loop)
                ],
                brand: CallFrameBrand(mark: .wordmark, place: .bottomRight, color: "#111111", size: .m, font: StoryTextStyle.poster),
                names: CallFrameNames(show: .name, style: .bubble, font: .cartoon, color: "#111111", fill: "#FFFFFF"),
                title: CallFrameTitle(source: .names, font: .poster, color: "#FFFFFF", place: .top, size: .l, effect: CallFrameTextEffect.outline, letterCase: CallFrameLetterCase.upper),
                subtitle: nil
            ),
            surfaces: [.capture, .live]
        ),
        CallFrameDesign(
            id: "hors-norme.pop-art.comite",
            motif: "hors-norme.pop-art",
            mood: .horsNorme,
            name: "Pop Art",
            bucket: .comite,
            look: CallFrameLook(
                layout: CallFrameLayout(arrangement: .cascade, margin: 0.07, gap: 0.03, top: 0.16, bottom: 0.1),
                slot: CallFrameSlotStyle(shape: .rect, radius: nil, stroke: CallFrameStroke(color: "#111111", width: 0.014), double: false, glow: nil, shadow: true, card: nil, tilt: .gentle, tone: .duotone, duotone: CallFrameDuotone(shadow: "#1B1BD1", light: "#7CF7FF")),
                background: .solid(color: "#FF2E63"),
                pattern: CallFramePattern(kind: .halftone, color: "#FFE600", opacity: 0.6),
                border: CallFrameBorder(kind: .double, color: "#111111", width: 0.012, inset: 0.025),
                ornaments: [
                    CallFrameOrnament(kind: .rays, color: "#FFFFFF", density: .mid, layer: .back, motion: .loop),
                    CallFrameOrnament(kind: .lightning, color: "#FFE600", density: .mid, layer: .front, motion: .loop),
                    CallFrameOrnament(kind: .stars, color: "#111111", density: .low, layer: .front, motion: .loop)
                ],
                brand: CallFrameBrand(mark: .wordmark, place: .bottomRight, color: "#111111", size: .m, font: StoryTextStyle.poster),
                names: CallFrameNames(show: .name, style: .bubble, font: .cartoon, color: "#111111", fill: "#FFFFFF"),
                title: CallFrameTitle(source: .group, font: .poster, color: "#FFFFFF", place: .top, size: .l, effect: CallFrameTextEffect.outline, letterCase: CallFrameLetterCase.upper),
                subtitle: nil
            ),
            surfaces: [.capture, .live]
        ),
        CallFrameDesign(
            id: "hors-norme.pop-art.groupe",
            motif: "hors-norme.pop-art",
            mood: .horsNorme,
            name: "Pop Art",
            bucket: .groupe,
            look: CallFrameLook(
                layout: CallFrameLayout(arrangement: .mosaic, margin: 0.06, gap: 0.025, top: 0.15, bottom: 0.1),
                slot: CallFrameSlotStyle(shape: .rect, radius: nil, stroke: CallFrameStroke(color: "#111111", width: 0.012), double: false, glow: nil, shadow: false, card: nil, tilt: .none, tone: .duotone, duotone: CallFrameDuotone(shadow: "#E4007C", light: "#FFF27A")),
                background: .solid(color: "#00C2FF"),
                pattern: CallFramePattern(kind: .halftone, color: "#FF2E63", opacity: 0.5),
                border: CallFrameBorder(kind: .double, color: "#111111", width: 0.012, inset: 0.025),
                ornaments: [
                    CallFrameOrnament(kind: .rays, color: "#FFFFFF", density: .mid, layer: .back, motion: .loop),
                    CallFrameOrnament(kind: .lightning, color: "#FFE600", density: .low, layer: .front, motion: .loop),
                    CallFrameOrnament(kind: .stars, color: "#111111", density: .low, layer: .front, motion: .loop)
                ],
                brand: CallFrameBrand(mark: .wordmark, place: .bottomRight, color: "#111111", size: .m, font: StoryTextStyle.poster),
                names: CallFrameNames(show: .handle, style: .bubble, font: .cartoon, color: "#111111", fill: "#FFFFFF"),
                title: CallFrameTitle(source: .group, font: .poster, color: "#FFE600", place: .top, size: .l, effect: CallFrameTextEffect.outline, letterCase: CallFrameLetterCase.upper),
                subtitle: nil
            ),
            surfaces: [.capture, .live]
        ),
        CallFrameDesign(
            id: "hors-norme.pop-art.tablee",
            motif: "hors-norme.pop-art",
            mood: .horsNorme,
            name: "Pop Art",
            bucket: .tablee,
            look: CallFrameLook(
                layout: CallFrameLayout(arrangement: .grid, margin: 0.05, gap: 0.02, top: 0.14, bottom: 0.1),
                slot: CallFrameSlotStyle(shape: .rect, radius: nil, stroke: CallFrameStroke(color: "#111111", width: 0.01), double: false, glow: nil, shadow: false, card: nil, tilt: .none, tone: .duotone, duotone: CallFrameDuotone(shadow: "#2B1BD1", light: "#FF8AD8")),
                background: .solid(color: "#FFE600"),
                pattern: CallFramePattern(kind: .halftone, color: "#FF2E63", opacity: 0.55),
                border: CallFrameBorder(kind: .double, color: "#111111", width: 0.012, inset: 0.025),
                ornaments: [
                    CallFrameOrnament(kind: .rays, color: "#FFFFFF", density: .mid, layer: .back, motion: .loop),
                    CallFrameOrnament(kind: .lightning, color: "#FF2E63", density: .mid, layer: .front, motion: .loop),
                    CallFrameOrnament(kind: .stars, color: "#111111", density: .low, layer: .front, motion: .loop)
                ],
                brand: CallFrameBrand(mark: .wordmark, place: .bottomRight, color: "#111111", size: .m, font: StoryTextStyle.poster),
                names: CallFrameNames(show: .name, style: .plate, font: .cartoon, color: "#111111", fill: "#FFE600"),
                title: CallFrameTitle(source: .group, font: .poster, color: "#FFFFFF", place: .top, size: .l, effect: CallFrameTextEffect.outline, letterCase: CallFrameLetterCase.upper),
                subtitle: nil
            ),
            surfaces: [.capture, .live]
        ),
        CallFrameDesign(
            id: "hors-norme.collage.duo",
            motif: "hors-norme.collage",
            mood: .horsNorme,
            name: "Collage",
            bucket: .duo,
            look: CallFrameLook(
                layout: CallFrameLayout(arrangement: .diagonal, margin: 0.07, gap: 0.03, top: 0.16, bottom: 0.1),
                slot: CallFrameSlotStyle(shape: .torn, radius: nil, stroke: nil, double: false, glow: nil, shadow: true, card: nil, tilt: .wild, tone: .noir, duotone: nil),
                background: .solid(color: "#F3EFE6"),
                pattern: CallFramePattern(kind: .grid, color: "#2E5BFF", opacity: 0.18),
                border: CallFrameBorder(kind: .torn, color: "#1A1A1A", width: 0.012, inset: 0.0),
                ornaments: [
                    CallFrameOrnament(kind: .tape, color: "#FF3EA5", density: .low, layer: .front),
                    CallFrameOrnament(kind: .grain, color: "#2B2B2B", density: .mid, layer: .back),
                    CallFrameOrnament(kind: .stars, color: "#FF3EA5", density: .low, layer: .front, motion: .loop),
                    CallFrameOrnament(kind: .lightning, color: "#2E5BFF", density: .low, layer: .back, motion: .loop)
                ],
                brand: CallFrameBrand(mark: .both, place: .bottom, color: "#111111", size: .m, font: StoryTextStyle.tag),
                names: CallFrameNames(show: .handle, style: .tag, font: .tag, color: "#111111", fill: "#C6FF00"),
                title: CallFrameTitle(source: .names, font: .tag, color: "#111111", place: .top, size: .l, effect: CallFrameTextEffect.none, letterCase: nil),
                subtitle: nil
            ),
            surfaces: [.capture, .live]
        ),
        CallFrameDesign(
            id: "hors-norme.collage.comite",
            motif: "hors-norme.collage",
            mood: .horsNorme,
            name: "Collage",
            bucket: .comite,
            look: CallFrameLook(
                layout: CallFrameLayout(arrangement: .cascade, margin: 0.07, gap: 0.03, top: 0.16, bottom: 0.1),
                slot: CallFrameSlotStyle(shape: .torn, radius: nil, stroke: nil, double: false, glow: nil, shadow: true, card: nil, tilt: .wild, tone: .noir, duotone: nil),
                background: .solid(color: "#F3EFE6"),
                pattern: CallFramePattern(kind: .grid, color: "#2E5BFF", opacity: 0.18),
                border: CallFrameBorder(kind: .torn, color: "#1A1A1A", width: 0.012, inset: 0.0),
                ornaments: [
                    CallFrameOrnament(kind: .tape, color: "#FF3EA5", density: .low, layer: .front),
                    CallFrameOrnament(kind: .grain, color: "#2B2B2B", density: .mid, layer: .back),
                    CallFrameOrnament(kind: .stars, color: "#FF3EA5", density: .low, layer: .front, motion: .loop),
                    CallFrameOrnament(kind: .lightning, color: "#2E5BFF", density: .low, layer: .back, motion: .loop)
                ],
                brand: CallFrameBrand(mark: .both, place: .bottom, color: "#111111", size: .m, font: StoryTextStyle.tag),
                names: CallFrameNames(show: .handle, style: .tag, font: .tag, color: "#111111", fill: "#C6FF00"),
                title: CallFrameTitle(source: .group, font: .tag, color: "#111111", place: .top, size: .l, effect: CallFrameTextEffect.none, letterCase: nil),
                subtitle: nil
            ),
            surfaces: [.capture, .live]
        ),
        CallFrameDesign(
            id: "hors-norme.collage.groupe",
            motif: "hors-norme.collage",
            mood: .horsNorme,
            name: "Collage",
            bucket: .groupe,
            look: CallFrameLook(
                layout: CallFrameLayout(arrangement: .scatter, margin: 0.06, gap: 0.025, top: 0.15, bottom: 0.1),
                slot: CallFrameSlotStyle(shape: .torn, radius: nil, stroke: nil, double: false, glow: nil, shadow: true, card: nil, tilt: .wild, tone: .noir, duotone: nil),
                background: .solid(color: "#F3EFE6"),
                pattern: CallFramePattern(kind: .grid, color: "#2E5BFF", opacity: 0.18),
                border: CallFrameBorder(kind: .torn, color: "#1A1A1A", width: 0.012, inset: 0.0),
                ornaments: [
                    CallFrameOrnament(kind: .tape, color: "#FF3EA5", density: .low, layer: .front),
                    CallFrameOrnament(kind: .grain, color: "#2B2B2B", density: .mid, layer: .back),
                    CallFrameOrnament(kind: .stars, color: "#FF3EA5", density: .low, layer: .front, motion: .loop),
                    CallFrameOrnament(kind: .lightning, color: "#2E5BFF", density: .low, layer: .back, motion: .loop)
                ],
                brand: CallFrameBrand(mark: .both, place: .bottom, color: "#111111", size: .m, font: StoryTextStyle.tag),
                names: CallFrameNames(show: .handle, style: .badge, font: .tag, color: "#111111", fill: "#C6FF00"),
                title: CallFrameTitle(source: .group, font: .tag, color: "#111111", place: .top, size: .l, effect: CallFrameTextEffect.none, letterCase: nil),
                subtitle: nil
            ),
            surfaces: [.capture, .live]
        ),
        CallFrameDesign(
            id: "hors-norme.collage.tablee",
            motif: "hors-norme.collage",
            mood: .horsNorme,
            name: "Collage",
            bucket: .tablee,
            look: CallFrameLook(
                layout: CallFrameLayout(arrangement: .grid, margin: 0.05, gap: 0.02, top: 0.14, bottom: 0.12),
                slot: CallFrameSlotStyle(shape: .torn, radius: nil, stroke: nil, double: false, glow: nil, shadow: false, card: nil, tilt: .gentle, tone: .noir, duotone: nil),
                background: .solid(color: "#F3EFE6"),
                pattern: CallFramePattern(kind: .grid, color: "#2E5BFF", opacity: 0.18),
                border: CallFrameBorder(kind: .torn, color: "#1A1A1A", width: 0.012, inset: 0.0),
                ornaments: [
                    CallFrameOrnament(kind: .tape, color: "#FF3EA5", density: .low, layer: .front),
                    CallFrameOrnament(kind: .grain, color: "#2B2B2B", density: .mid, layer: .back),
                    CallFrameOrnament(kind: .stars, color: "#FF3EA5", density: .low, layer: .front, motion: .loop),
                    CallFrameOrnament(kind: .lightning, color: "#2E5BFF", density: .low, layer: .back, motion: .loop)
                ],
                brand: CallFrameBrand(mark: .both, place: .bottom, color: "#111111", size: .m, font: StoryTextStyle.tag),
                names: CallFrameNames(show: .handle, style: .list, font: .tag, color: "#111111", fill: nil),
                title: CallFrameTitle(source: .group, font: .tag, color: "#111111", place: .top, size: .l, effect: CallFrameTextEffect.none, letterCase: nil),
                subtitle: nil
            ),
            surfaces: [.capture, .live]
        ),
        CallFrameDesign(
            id: "hors-norme.vitrail.duo",
            motif: "hors-norme.vitrail",
            mood: .horsNorme,
            name: "Vitrail",
            bucket: .duo,
            look: CallFrameLook(
                layout: CallFrameLayout(arrangement: .column, margin: 0.08, gap: 0.035, top: 0.18, bottom: 0.12),
                slot: CallFrameSlotStyle(shape: .arch, radius: nil, stroke: CallFrameStroke(color: "#16110C", width: 0.018), double: true, glow: "#B3122E", shadow: false, card: nil, tilt: .none, tone: .warm, duotone: nil),
                background: .radial(colors: ["#3A1B5E", "#120A22", "#07040E"]),
                pattern: CallFramePattern(kind: .grid, color: "#000000", opacity: 0.35),
                border: CallFrameBorder(kind: .double, color: "#E0A93B", width: 0.008, inset: 0.03),
                ornaments: [
                    CallFrameOrnament(kind: .rays, color: "#E0A93B26", density: .mid, layer: .back),
                    CallFrameOrnament(kind: .lightleak, color: "#1D4ED833", density: .low, layer: .back)
                ],
                brand: CallFrameBrand(mark: .logo, place: .bottom, color: "#E0A93B", size: .m, font: nil),
                names: CallFrameNames(show: .name, style: .plate, font: .poster, color: "#F5E6C4", fill: "#0E0B1AD9"),
                title: CallFrameTitle(source: .names, font: .calligraphy, color: "#F5E6C4", place: .top, size: .l, effect: CallFrameTextEffect.glow, letterCase: nil),
                subtitle: CallFrameTitle(source: .date, font: .poster, color: "#E0A93B", place: .top, size: .s, effect: CallFrameTextEffect.none, letterCase: CallFrameLetterCase.upper)
            ),
            surfaces: [.capture, .live]
        ),
        CallFrameDesign(
            id: "hors-norme.vitrail.comite",
            motif: "hors-norme.vitrail",
            mood: .horsNorme,
            name: "Vitrail",
            bucket: .comite,
            look: CallFrameLook(
                layout: CallFrameLayout(arrangement: .orbit, margin: 0.07, gap: 0.03, top: 0.17, bottom: 0.12),
                slot: CallFrameSlotStyle(shape: .diamond, radius: nil, stroke: CallFrameStroke(color: "#16110C", width: 0.018), double: true, glow: "#1D4ED8", shadow: false, card: nil, tilt: .none, tone: .warm, duotone: nil),
                background: .radial(colors: ["#12306B", "#0A1330", "#05070F"]),
                pattern: CallFramePattern(kind: .grid, color: "#000000", opacity: 0.35),
                border: CallFrameBorder(kind: .double, color: "#E0A93B", width: 0.008, inset: 0.03),
                ornaments: [
                    CallFrameOrnament(kind: .rays, color: "#E0A93B26", density: .high, layer: .back),
                    CallFrameOrnament(kind: .sparkles, color: "#E0A93B", density: .low, layer: .front)
                ],
                brand: CallFrameBrand(mark: .logo, place: .bottom, color: "#E0A93B", size: .m, font: nil),
                names: CallFrameNames(show: .name, style: .plate, font: .poster, color: "#F5E6C4", fill: "#0E0B1AD9"),
                title: CallFrameTitle(source: .group, font: .calligraphy, color: "#F5E6C4", place: .top, size: .l, effect: CallFrameTextEffect.glow, letterCase: nil),
                subtitle: CallFrameTitle(source: .date, font: .poster, color: "#E0A93B", place: .top, size: .s, effect: CallFrameTextEffect.none, letterCase: CallFrameLetterCase.upper)
            ),
            surfaces: [.capture, .live]
        ),
        CallFrameDesign(
            id: "hors-norme.vitrail.groupe",
            motif: "hors-norme.vitrail",
            mood: .horsNorme,
            name: "Vitrail",
            bucket: .groupe,
            look: CallFrameLook(
                layout: CallFrameLayout(arrangement: .honeycomb, margin: 0.06, gap: 0.02, top: 0.16, bottom: 0.1),
                slot: CallFrameSlotStyle(shape: .hex, radius: nil, stroke: CallFrameStroke(color: "#16110C", width: 0.018), double: true, glow: "#0F8A5F", shadow: false, card: nil, tilt: .none, tone: .warm, duotone: nil),
                background: .radial(colors: ["#0D4A3A", "#082620", "#030C0A"]),
                pattern: CallFramePattern(kind: .grid, color: "#000000", opacity: 0.35),
                border: CallFrameBorder(kind: .double, color: "#E0A93B", width: 0.008, inset: 0.03),
                ornaments: [
                    CallFrameOrnament(kind: .rays, color: "#E0A93B26", density: .mid, layer: .back),
                    CallFrameOrnament(kind: .lightleak, color: "#1D4ED833", density: .low, layer: .back)
                ],
                brand: CallFrameBrand(mark: .logo, place: .bottom, color: "#E0A93B", size: .m, font: nil),
                names: CallFrameNames(show: .name, style: .badge, font: .poster, color: "#F5E6C4", fill: "#0E0B1AD9"),
                title: CallFrameTitle(source: .group, font: .calligraphy, color: "#F5E6C4", place: .top, size: .l, effect: CallFrameTextEffect.glow, letterCase: nil),
                subtitle: CallFrameTitle(source: .date, font: .poster, color: "#E0A93B", place: .top, size: .s, effect: CallFrameTextEffect.none, letterCase: CallFrameLetterCase.upper)
            ),
            surfaces: [.capture, .live]
        ),
        CallFrameDesign(
            id: "hors-norme.vitrail.tablee",
            motif: "hors-norme.vitrail",
            mood: .horsNorme,
            name: "Vitrail",
            bucket: .tablee,
            look: CallFrameLook(
                layout: CallFrameLayout(arrangement: .honeycomb, margin: 0.05, gap: 0.015, top: 0.15, bottom: 0.09),
                slot: CallFrameSlotStyle(shape: .hex, radius: nil, stroke: CallFrameStroke(color: "#16110C", width: 0.018), double: true, glow: "#E0A93B", shadow: false, card: nil, tilt: .none, tone: .warm, duotone: nil),
                background: .radial(colors: ["#5A1020", "#2A0710", "#0C0206"]),
                pattern: CallFramePattern(kind: .grid, color: "#000000", opacity: 0.35),
                border: CallFrameBorder(kind: .double, color: "#E0A93B", width: 0.008, inset: 0.03),
                ornaments: [
                    CallFrameOrnament(kind: .rays, color: "#E0A93B26", density: .mid, layer: .back),
                    CallFrameOrnament(kind: .lightleak, color: "#1D4ED833", density: .low, layer: .back)
                ],
                brand: CallFrameBrand(mark: .logo, place: .bottom, color: "#E0A93B", size: .m, font: nil),
                names: CallFrameNames(show: .none, style: .badge, font: .poster, color: "#F5E6C4", fill: nil),
                title: CallFrameTitle(source: .group, font: .calligraphy, color: "#F5E6C4", place: .top, size: .l, effect: CallFrameTextEffect.glow, letterCase: nil),
                subtitle: CallFrameTitle(source: .date, font: .poster, color: "#E0A93B", place: .top, size: .s, effect: CallFrameTextEffect.none, letterCase: CallFrameLetterCase.upper)
            ),
            surfaces: [.capture, .live]
        ),
        CallFrameDesign(
            id: "hors-norme.tete-d-affiche.comite",
            motif: "hors-norme.tete-d-affiche",
            mood: .horsNorme,
            name: "Tête d’affiche",
            bucket: .comite,
            look: CallFrameLook(
                layout: CallFrameLayout(arrangement: .hero, margin: 0.07, gap: 0.03, top: 0.17, bottom: 0.11),
                slot: CallFrameSlotStyle(shape: .round, radius: 0.12, stroke: CallFrameStroke(color: "#FFD166", width: 0.01), double: false, glow: "#FFD166AA", shadow: false, card: nil, tilt: .none, tone: .color, duotone: nil),
                background: .radial(colors: ["#C2185B", "#5B0E5E", "#1A0326"]),
                pattern: CallFramePattern(kind: .sunburst, color: "#FFD166", opacity: 0.12),
                border: CallFrameBorder(kind: .bulbs, color: "#FFD166", width: 0.006, inset: 0.03),
                ornaments: [
                    CallFrameOrnament(kind: .crown, color: "#FFD166", density: .low, layer: .front),
                    CallFrameOrnament(kind: .sparkles, color: "#FFE8A3", density: .mid, layer: .front, motion: .loop),
                    CallFrameOrnament(kind: .bokeh, color: "#FF7AC6", density: .mid, layer: .back, motion: .loop)
                ],
                brand: CallFrameBrand(mark: .both, place: .bottom, color: "#FFD166", size: .m, font: StoryTextStyle.poster),
                names: CallFrameNames(show: .name, style: .badge, font: .poster, color: "#1A0326", fill: "#FFD166"),
                title: CallFrameTitle(source: .group, font: .poster, color: "#FFD166", place: .top, size: .l, effect: CallFrameTextEffect.glow, letterCase: CallFrameLetterCase.upper),
                subtitle: nil
            ),
            surfaces: [.capture]
        ),
        CallFrameDesign(
            id: "hors-norme.tete-d-affiche.groupe",
            motif: "hors-norme.tete-d-affiche",
            mood: .horsNorme,
            name: "Tête d’affiche",
            bucket: .groupe,
            look: CallFrameLook(
                layout: CallFrameLayout(arrangement: .hero, margin: 0.07, gap: 0.025, top: 0.16, bottom: 0.11),
                slot: CallFrameSlotStyle(shape: .round, radius: 0.12, stroke: CallFrameStroke(color: "#FFD166", width: 0.008), double: false, glow: "#FFD166AA", shadow: false, card: nil, tilt: .none, tone: .color, duotone: nil),
                background: .radial(colors: ["#C2185B", "#5B0E5E", "#1A0326"]),
                pattern: CallFramePattern(kind: .sunburst, color: "#FFD166", opacity: 0.12),
                border: CallFrameBorder(kind: .bulbs, color: "#FFD166", width: 0.006, inset: 0.03),
                ornaments: [
                    CallFrameOrnament(kind: .crown, color: "#FFD166", density: .low, layer: .front),
                    CallFrameOrnament(kind: .sparkles, color: "#FFE8A3", density: .mid, layer: .front, motion: .loop),
                    CallFrameOrnament(kind: .bokeh, color: "#FF7AC6", density: .mid, layer: .back, motion: .loop)
                ],
                brand: CallFrameBrand(mark: .both, place: .bottom, color: "#FFD166", size: .m, font: StoryTextStyle.poster),
                names: CallFrameNames(show: .name, style: .badge, font: .poster, color: "#1A0326", fill: "#FFD166"),
                title: CallFrameTitle(source: .group, font: .poster, color: "#FFD166", place: .top, size: .l, effect: CallFrameTextEffect.glow, letterCase: CallFrameLetterCase.upper),
                subtitle: nil
            ),
            surfaces: [.capture]
        ),
        CallFrameDesign(
            id: "hors-norme.tete-d-affiche.tablee",
            motif: "hors-norme.tete-d-affiche",
            mood: .horsNorme,
            name: "Tête d’affiche",
            bucket: .tablee,
            look: CallFrameLook(
                layout: CallFrameLayout(arrangement: .tiers, margin: 0.06, gap: 0.02, top: 0.15, bottom: 0.12),
                slot: CallFrameSlotStyle(shape: .circle, radius: nil, stroke: CallFrameStroke(color: "#FFD166", width: 0.006), double: false, glow: "#FFD16688", shadow: false, card: nil, tilt: .none, tone: .color, duotone: nil),
                background: .radial(colors: ["#C2185B", "#5B0E5E", "#1A0326"]),
                pattern: CallFramePattern(kind: .sunburst, color: "#FFD166", opacity: 0.12),
                border: CallFrameBorder(kind: .bulbs, color: "#FFD166", width: 0.006, inset: 0.03),
                ornaments: [
                    CallFrameOrnament(kind: .crown, color: "#FFD166", density: .low, layer: .front),
                    CallFrameOrnament(kind: .sparkles, color: "#FFE8A3", density: .mid, layer: .front, motion: .loop),
                    CallFrameOrnament(kind: .bokeh, color: "#FF7AC6", density: .mid, layer: .back, motion: .loop)
                ],
                brand: CallFrameBrand(mark: .both, place: .bottom, color: "#FFD166", size: .m, font: StoryTextStyle.poster),
                names: CallFrameNames(show: .name, style: .list, font: .poster, color: "#FFD166", fill: nil),
                title: CallFrameTitle(source: .group, font: .poster, color: "#FFD166", place: .top, size: .l, effect: CallFrameTextEffect.glow, letterCase: CallFrameLetterCase.upper),
                subtitle: nil
            ),
            surfaces: [.capture]
        )
    ]
}
