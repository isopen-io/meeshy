import Testing
import Foundation
import SwiftUI
@testable import MeeshyUI

/// **La teinte du marquee audio appartient à la SURFACE, pas à l'atome** (#4078).
///
/// L'atome est né posé SUR UN MÉDIA — chip de premier plan du reader, en-tête
/// du viewer story, réel plein écran —, où aucune couleur dérivée du contenu
/// n'est garantie AA et où le blanc est la convention (même raison que
/// `BackgroundSoundBadge.overMediaAccentHex`).
///
/// Il devenait FAUX dès que l'hôte est un fond thémé : sur la carte du fil en
/// mode clair, le crédit du son sortait à **1,03:1** — mesuré au simulateur le
/// 2026-09-01. La garde AA que l'hôte calculait (`isDark ? accent : indigo600`)
/// était bien PASSÉE au badge, et la branche `.credit` la laissait tomber en
/// déléguant ici.
///
/// Les deux témoins ci-dessous gardent les DEUX côtés du paramètre, et le
/// premier est celui qui compte : un « rangement » qui remplacerait le défaut
/// par une couleur de thème éteindrait en silence les trois surfaces sur média,
/// sans qu'aucune ne rougisse — elles rendraient une couleur parfaitement
/// valide, simplement invisible sur une photo claire.
struct AudioChipMarqueeTintTests {

    @Test("Le défaut RESTE le blanc — les surfaces posées sur un média en dépendent")
    func défautBlanc() {
        #expect(AudioChipMarquee(text: "Nuits blanches").tint == Color.white)
        #expect(AudioChipMarquee(text: "x", paused: true, height: 14, fontSize: 11).tint == Color.white)
    }

    @Test("Un hôte qui connaît sa surface impose la sienne")
    func teinteDeLHôte() {
        let indigo = Color(hex: "4F46E5")
        #expect(AudioChipMarquee(text: "Nuits blanches", tint: indigo).tint == indigo)
        #expect(AudioChipMarquee(text: "Nuits blanches", tint: indigo).tint != Color.white)
    }
}
