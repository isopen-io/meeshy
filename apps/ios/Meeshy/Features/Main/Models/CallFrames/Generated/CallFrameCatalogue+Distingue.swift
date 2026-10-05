// GÉNÉRÉ — ne pas éditer; source: packages/shared/design/call-capture-frames
// Régénérer : `cd packages/shared && bun run generate:call-frames`.
// Fraîcheur gardée par packages/shared/__tests__/call-capture-frames-swift.test.ts.

import MeeshySDK

nonisolated extension CallFrameCatalogue {
    static let distingueFrames: [CallFrameDesign] = [
        CallFrameDesign(
            id: "distingue.monogramme.duo",
            motif: "distingue.monogramme",
            mood: .distingue,
            name: "Monogramme",
            bucket: .duo,
            look: CallFrameLook(
                layout: CallFrameLayout(arrangement: .column, margin: 0.1, gap: 0.04, top: 0.22, bottom: 0.16),
                slot: CallFrameSlotStyle(shape: .oval, radius: nil, stroke: CallFrameStroke(color: "#1B2A41", width: 0.004), double: true, glow: nil, shadow: false, card: nil, tilt: .none, tone: .sepia, duotone: nil),
                background: .solid(color: "#F5F0E6"),
                pattern: CallFramePattern(kind: .damask, color: "#1B2A41", opacity: 0.05),
                border: CallFrameBorder(kind: .double, color: "#1B2A41", width: 0.005, inset: 0.03),
                ornaments: [],
                brand: CallFrameBrand(mark: .wordmark, place: .bottom, color: "#1B2A41", size: .s, font: StoryTextStyle.elegant),
                names: CallFrameNames(show: .name, style: .caption, font: .italic, color: "#1B2A41", fill: nil),
                title: CallFrameTitle(source: .names, font: .elegant, color: "#1B2A41", place: .top, size: .l, effect: nil, letterCase: CallFrameLetterCase.upper),
                subtitle: CallFrameTitle(source: .date, font: .italic, color: "#7A6A4F", place: .top, size: .s, effect: nil, letterCase: nil)
            )
        ),
        CallFrameDesign(
            id: "distingue.monogramme.comite",
            motif: "distingue.monogramme",
            mood: .distingue,
            name: "Monogramme",
            bucket: .comite,
            look: CallFrameLook(
                layout: CallFrameLayout(arrangement: .arch, margin: 0.08, gap: 0.03, top: 0.2, bottom: 0.14),
                slot: CallFrameSlotStyle(shape: .oval, radius: nil, stroke: CallFrameStroke(color: "#1B2A41", width: 0.004), double: true, glow: nil, shadow: false, card: nil, tilt: .none, tone: .sepia, duotone: nil),
                background: .solid(color: "#F5F0E6"),
                pattern: CallFramePattern(kind: .damask, color: "#1B2A41", opacity: 0.05),
                border: CallFrameBorder(kind: .double, color: "#1B2A41", width: 0.005, inset: 0.03),
                ornaments: [],
                brand: CallFrameBrand(mark: .wordmark, place: .bottom, color: "#1B2A41", size: .s, font: StoryTextStyle.elegant),
                names: CallFrameNames(show: .name, style: .caption, font: .italic, color: "#1B2A41", fill: nil),
                title: CallFrameTitle(source: .group, font: .elegant, color: "#1B2A41", place: .top, size: .l, effect: nil, letterCase: CallFrameLetterCase.upper),
                subtitle: CallFrameTitle(source: .date, font: .italic, color: "#7A6A4F", place: .top, size: .s, effect: nil, letterCase: nil)
            )
        ),
        CallFrameDesign(
            id: "distingue.monogramme.groupe",
            motif: "distingue.monogramme",
            mood: .distingue,
            name: "Monogramme",
            bucket: .groupe,
            look: CallFrameLook(
                layout: CallFrameLayout(arrangement: .tiers, margin: 0.07, gap: 0.02, top: 0.18, bottom: 0.16),
                slot: CallFrameSlotStyle(shape: .oval, radius: nil, stroke: CallFrameStroke(color: "#1B2A41", width: 0.003), double: false, glow: nil, shadow: false, card: nil, tilt: .none, tone: .sepia, duotone: nil),
                background: .solid(color: "#F5F0E6"),
                pattern: CallFramePattern(kind: .damask, color: "#1B2A41", opacity: 0.05),
                border: CallFrameBorder(kind: .double, color: "#1B2A41", width: 0.005, inset: 0.03),
                ornaments: [],
                brand: CallFrameBrand(mark: .wordmark, place: .bottom, color: "#1B2A41", size: .s, font: StoryTextStyle.elegant),
                names: CallFrameNames(show: .name, style: .list, font: .italic, color: "#1B2A41", fill: nil),
                title: CallFrameTitle(source: .group, font: .elegant, color: "#1B2A41", place: .top, size: .l, effect: nil, letterCase: CallFrameLetterCase.upper),
                subtitle: CallFrameTitle(source: .date, font: .italic, color: "#7A6A4F", place: .top, size: .s, effect: nil, letterCase: nil)
            )
        ),
        CallFrameDesign(
            id: "distingue.bibliotheque.duo",
            motif: "distingue.bibliotheque",
            mood: .distingue,
            name: "Bibliothèque",
            bucket: .duo,
            look: CallFrameLook(
                layout: CallFrameLayout(arrangement: .split, margin: 0.08, gap: 0.04, top: 0.14, bottom: 0.1),
                slot: CallFrameSlotStyle(shape: .rect, radius: nil, stroke: nil, double: false, glow: nil, shadow: true, card: CallFrameCard(color: "#F5F0E6", pad: 0.04, foot: 0.04), tilt: .none, tone: .sepia, duotone: nil),
                background: .linear(colors: ["#1F3B2D", "#14271E"], angle: 0.0),
                pattern: nil,
                border: CallFrameBorder(kind: .hairline, color: "#E8DFC8", width: 0.003, inset: 0.035),
                ornaments: [
                    CallFrameOrnament(kind: .grain, color: "#00000033", density: .low, layer: .back),
                    CallFrameOrnament(kind: .vignette, color: "#000000", density: .mid, layer: .back)
                ],
                brand: CallFrameBrand(mark: .logo, place: .bottomRight, color: "#E8DFC8", size: .m, font: nil),
                names: CallFrameNames(show: .handle, style: .plate, font: .classic, color: "#F5F0E6", fill: "#1F3B2DE6"),
                title: CallFrameTitle(source: .names, font: .classic, color: "#F5F0E6", place: .top, size: .l, effect: nil, letterCase: nil),
                subtitle: CallFrameTitle(source: .brand, font: .italic, color: "#C9BFA5", place: .top, size: .s, effect: nil, letterCase: nil)
            )
        ),
        CallFrameDesign(
            id: "distingue.bibliotheque.comite",
            motif: "distingue.bibliotheque",
            mood: .distingue,
            name: "Bibliothèque",
            bucket: .comite,
            look: CallFrameLook(
                layout: CallFrameLayout(arrangement: .grid, margin: 0.07, gap: 0.035, top: 0.16, bottom: 0.1),
                slot: CallFrameSlotStyle(shape: .rect, radius: nil, stroke: nil, double: false, glow: nil, shadow: true, card: CallFrameCard(color: "#F5F0E6", pad: 0.04, foot: 0.04), tilt: .none, tone: .sepia, duotone: nil),
                background: .linear(colors: ["#1F3B2D", "#14271E"], angle: 0.0),
                pattern: nil,
                border: CallFrameBorder(kind: .hairline, color: "#E8DFC8", width: 0.003, inset: 0.035),
                ornaments: [
                    CallFrameOrnament(kind: .grain, color: "#00000033", density: .low, layer: .back),
                    CallFrameOrnament(kind: .vignette, color: "#000000", density: .mid, layer: .back)
                ],
                brand: CallFrameBrand(mark: .logo, place: .bottomRight, color: "#E8DFC8", size: .m, font: nil),
                names: CallFrameNames(show: .handle, style: .plate, font: .classic, color: "#F5F0E6", fill: "#1F3B2DE6"),
                title: CallFrameTitle(source: .group, font: .classic, color: "#F5F0E6", place: .top, size: .m, effect: nil, letterCase: CallFrameLetterCase.upper),
                subtitle: CallFrameTitle(source: .brand, font: .italic, color: "#C9BFA5", place: .top, size: .s, effect: nil, letterCase: nil)
            )
        ),
        CallFrameDesign(
            id: "distingue.bibliotheque.groupe",
            motif: "distingue.bibliotheque",
            mood: .distingue,
            name: "Bibliothèque",
            bucket: .groupe,
            look: CallFrameLook(
                layout: CallFrameLayout(arrangement: .mosaic, margin: 0.06, gap: 0.025, top: 0.14, bottom: 0.1),
                slot: CallFrameSlotStyle(shape: .rect, radius: nil, stroke: nil, double: false, glow: nil, shadow: true, card: CallFrameCard(color: "#F5F0E6", pad: 0.04, foot: 0.04), tilt: .none, tone: .sepia, duotone: nil),
                background: .linear(colors: ["#1F3B2D", "#14271E"], angle: 0.0),
                pattern: nil,
                border: CallFrameBorder(kind: .hairline, color: "#E8DFC8", width: 0.003, inset: 0.035),
                ornaments: [
                    CallFrameOrnament(kind: .grain, color: "#00000033", density: .low, layer: .back),
                    CallFrameOrnament(kind: .vignette, color: "#000000", density: .mid, layer: .back)
                ],
                brand: CallFrameBrand(mark: .logo, place: .bottomRight, color: "#E8DFC8", size: .m, font: nil),
                names: CallFrameNames(show: .handle, style: .badge, font: .classic, color: "#F5F0E6", fill: "#1F3B2DE6"),
                title: CallFrameTitle(source: .group, font: .classic, color: "#F5F0E6", place: .top, size: .m, effect: nil, letterCase: CallFrameLetterCase.upper),
                subtitle: CallFrameTitle(source: .brand, font: .italic, color: "#C9BFA5", place: .top, size: .s, effect: nil, letterCase: nil)
            )
        ),
        CallFrameDesign(
            id: "distingue.cercle.duo",
            motif: "distingue.cercle",
            mood: .distingue,
            name: "Cercle",
            bucket: .duo,
            look: CallFrameLook(
                layout: CallFrameLayout(arrangement: .diagonal, margin: 0.07, gap: 0.03, top: 0.14, bottom: 0.1),
                slot: CallFrameSlotStyle(shape: .oval, radius: nil, stroke: CallFrameStroke(color: "#B08D57", width: 0.006), double: true, glow: nil, shadow: true, card: nil, tilt: .none, tone: .mono, duotone: nil),
                background: .radial(colors: ["#5A2227", "#4A1C1F", "#2A0F12"]),
                pattern: nil,
                border: CallFrameBorder(kind: .hairline, color: "#B08D57", width: 0.003, inset: 0.03),
                ornaments: [
                    CallFrameOrnament(kind: .vignette, color: "#0A0405", density: .mid, layer: .back)
                ],
                brand: CallFrameBrand(mark: .both, place: .topLeft, color: "#F5F0E6", size: .s, font: StoryTextStyle.elegant),
                names: CallFrameNames(show: .both, style: .plate, font: .classic, color: "#1B1210", fill: "#C9B48AEE"),
                title: CallFrameTitle(source: .names, font: .elegant, color: "#F5F0E6", place: .top, size: .m, effect: nil, letterCase: CallFrameLetterCase.upper),
                subtitle: CallFrameTitle(source: .date, font: .italic, color: "#C9B48A", place: .top, size: .s, effect: nil, letterCase: nil)
            )
        ),
        CallFrameDesign(
            id: "distingue.cercle.comite",
            motif: "distingue.cercle",
            mood: .distingue,
            name: "Cercle",
            bucket: .comite,
            look: CallFrameLook(
                layout: CallFrameLayout(arrangement: .orbit, margin: 0.07, gap: 0.03, top: 0.16, bottom: 0.1),
                slot: CallFrameSlotStyle(shape: .oval, radius: nil, stroke: CallFrameStroke(color: "#B08D57", width: 0.006), double: true, glow: nil, shadow: true, card: nil, tilt: .none, tone: .mono, duotone: nil),
                background: .radial(colors: ["#5A2227", "#4A1C1F", "#2A0F12"]),
                pattern: nil,
                border: CallFrameBorder(kind: .hairline, color: "#B08D57", width: 0.003, inset: 0.03),
                ornaments: [
                    CallFrameOrnament(kind: .vignette, color: "#0A0405", density: .mid, layer: .back)
                ],
                brand: CallFrameBrand(mark: .both, place: .topLeft, color: "#F5F0E6", size: .s, font: StoryTextStyle.elegant),
                names: CallFrameNames(show: .both, style: .plate, font: .classic, color: "#1B1210", fill: "#C9B48AEE"),
                title: CallFrameTitle(source: .group, font: .elegant, color: "#F5F0E6", place: .top, size: .m, effect: nil, letterCase: CallFrameLetterCase.upper),
                subtitle: nil
            )
        ),
        CallFrameDesign(
            id: "distingue.cercle.groupe",
            motif: "distingue.cercle",
            mood: .distingue,
            name: "Cercle",
            bucket: .groupe,
            look: CallFrameLook(
                layout: CallFrameLayout(arrangement: .grid, margin: 0.06, gap: 0.03, top: 0.14, bottom: 0.1),
                slot: CallFrameSlotStyle(shape: .oval, radius: nil, stroke: CallFrameStroke(color: "#B08D57", width: 0.006), double: true, glow: nil, shadow: true, card: nil, tilt: .none, tone: .mono, duotone: nil),
                background: .radial(colors: ["#5A2227", "#4A1C1F", "#2A0F12"]),
                pattern: nil,
                border: CallFrameBorder(kind: .hairline, color: "#B08D57", width: 0.003, inset: 0.03),
                ornaments: [
                    CallFrameOrnament(kind: .vignette, color: "#0A0405", density: .mid, layer: .back)
                ],
                brand: CallFrameBrand(mark: .both, place: .topLeft, color: "#F5F0E6", size: .s, font: StoryTextStyle.elegant),
                names: CallFrameNames(show: .both, style: .plate, font: .classic, color: "#1B1210", fill: "#C9B48AEE"),
                title: CallFrameTitle(source: .group, font: .elegant, color: "#F5F0E6", place: .top, size: .m, effect: nil, letterCase: CallFrameLetterCase.upper),
                subtitle: nil
            )
        ),
        CallFrameDesign(
            id: "distingue.cercle.tablee",
            motif: "distingue.cercle",
            mood: .distingue,
            name: "Cercle",
            bucket: .tablee,
            look: CallFrameLook(
                layout: CallFrameLayout(arrangement: .grid, margin: 0.05, gap: 0.02, top: 0.12, bottom: 0.08),
                slot: CallFrameSlotStyle(shape: .oval, radius: nil, stroke: CallFrameStroke(color: "#B08D57", width: 0.004), double: false, glow: nil, shadow: false, card: nil, tilt: .none, tone: .mono, duotone: nil),
                background: .radial(colors: ["#5A2227", "#4A1C1F", "#2A0F12"]),
                pattern: nil,
                border: CallFrameBorder(kind: .hairline, color: "#B08D57", width: 0.003, inset: 0.03),
                ornaments: [
                    CallFrameOrnament(kind: .vignette, color: "#0A0405", density: .mid, layer: .back)
                ],
                brand: CallFrameBrand(mark: .both, place: .topLeft, color: "#F5F0E6", size: .s, font: StoryTextStyle.elegant),
                names: CallFrameNames(show: .name, style: .plate, font: .classic, color: "#1B1210", fill: "#C9B48AEE"),
                title: CallFrameTitle(source: .group, font: .elegant, color: "#F5F0E6", place: .top, size: .m, effect: nil, letterCase: CallFrameLetterCase.upper),
                subtitle: nil
            )
        ),
        CallFrameDesign(
            id: "distingue.correspondance.duo",
            motif: "distingue.correspondance",
            mood: .distingue,
            name: "Correspondance",
            bucket: .duo,
            look: CallFrameLook(
                layout: CallFrameLayout(arrangement: .cascade, margin: 0.08, gap: 0.03, top: 0.16, bottom: 0.12),
                slot: CallFrameSlotStyle(shape: .stamp, radius: nil, stroke: nil, double: false, glow: nil, shadow: true, card: CallFrameCard(color: "#F5F0E6", pad: 0.05, foot: 0.05), tilt: .gentle, tone: .sepia, duotone: nil),
                background: .linear(colors: ["#1B2A41", "#111C2C"], angle: 0.0),
                pattern: CallFramePattern(kind: .grain, color: "#F5F0E6", opacity: 0.06),
                border: nil,
                ornaments: [],
                brand: CallFrameBrand(mark: .wordmark, place: .watermark, color: "#F5F0E624", size: .m, font: StoryTextStyle.elegant),
                names: CallFrameNames(show: .handle, style: .caption, font: .italic, color: "#1B2A41", fill: nil),
                title: CallFrameTitle(source: .date, font: .italic, color: "#F5F0E6", place: .top, size: .m, effect: nil, letterCase: nil),
                subtitle: CallFrameTitle(source: .names, font: .classic, color: "#C9BFA5", place: .top, size: .s, effect: nil, letterCase: CallFrameLetterCase.upper)
            )
        )
    ]
}
