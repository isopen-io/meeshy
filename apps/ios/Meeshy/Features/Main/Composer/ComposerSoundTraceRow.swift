import SwiftUI
import MeeshySDK
import MeeshyUI

// MARK: - Ce qu'une trace sonore MONTRE, sans dire où elle se pose (#5011)

/// **La rangée note · onde · crédit · durée, partagée par les deux traces.**
///
/// Elle existe parce que la directive porteur du 2026-09-03 retire la CAPSULE à
/// la trace de scène sans rien retirer à son CONTENU :
///
/// > « La bulle de son de fond n'a pas lieux d'être, juste la note et le spectre
/// > et la durée au dessus […] »
///
/// Deux traces, deux coques, **un seul vocabulaire** : la capsule de la surface
/// document (`ComposerAvatarSoundBadge`, qui vit à côté d'un avatar où l'enclos
/// a un sens) et la ligne nue en tête de scène. Écrire la seconde à part aurait
/// donné deux façons de dire le même son, et la première divergence se serait
/// vue au premier libellé ajouté.
///
/// Ce que la rangée ne sait pas : où elle se pose, sur quel fond, avec quelle
/// marge. C'est ce qui la rend réutilisable — et c'est la coque qui répond de
/// la loi 6 comme du bord gauche.
struct ComposerSoundTraceRow: View {

    let sound: StoryAudioPlayerObject
    var tint: Color = MeeshyColors.indigo400

    /// **L'onde, même pour un son EMPRUNTÉ** — la troisième voie de #5011, et
    /// il faut dire pourquoi elle n'enfreint pas #4669.
    ///
    /// `StoryAudioIdentity.showsWaveform` retire l'onde d'un son emprunté au
    /// profit de son ATTRIBUTION (titre · @auteur), et l'arbitrage du
    /// 2026-09-01 en donne la raison : « son onde n'apprend rien que son titre
    /// ne dise mieux, et elle occupait exactement la place où le crédit doit
    /// tenir ». La contrainte est donc une contrainte de PLACE — dans une
    /// capsule posée à côté d'un avatar.
    ///
    /// En tête de scène, cette place existe : la ligne occupe toute la largeur.
    /// L'onde ET le crédit y tiennent, et aucun des deux ne chasse l'autre. Le
    /// porteur demande « le spectre » ; #4669 protège le crédit d'un auteur
    /// qu'on emprunte — c'est une question de droit, pas de goût, et la
    /// troisième voie ne sacrifie ni l'un ni l'autre.
    ///
    /// `false` conserve la règle d'origine, mot pour mot, là où la place manque.
    var showsWaveformEvenWhenBorrowed: Bool = false

    /// **La largeur que l'attribution ne dépasse pas** — `nil` ⇒ elle prend ce
    /// qu'elle peut.
    ///
    /// `150` dans une capsule posée à côté d'un avatar : sans borne, un titre
    /// long y pousserait la capsule sur le nom de l'auteur. En tête de scène la
    /// ligne a toute la largeur, et la borner y tronquerait pour rien.
    var creditMaxWidth: CGFloat? = 150

    /// Nombre de barres de l'onde — la même valeur que la capsule avait en
    /// propre. Nommée ici parce qu'elle décrit la rangée, pas sa coque.
    private static let barCount = 14

    private var showsWaveform: Bool {
        showsWaveformEvenWhenBorrowed || StoryAudioIdentity.showsWaveform(for: sound)
    }

    var body: some View {
        HStack(spacing: 7) {
            Image(systemName: "music.note")
                .font(MeeshyFont.relative(12, weight: .semibold))
                .foregroundStyle(tint)

            if showsWaveform {
                wave.frame(width: 44, height: 16)
            }

            // **Le crédit ne prend la place que s'il existe** (#4669) : un vocal
            // n'a ni titre ni auteur, la rangée garde alors sa forme
            // note-onde-durée.
            //
            // **Et la durée n'est JAMAIS ce qu'on tronque** (#4676) : servie en
            // une seule chaîne avec le titre, elle rendait « Feel the pulse ·
            // @jcnm · 2… ». Deux `Text`, deux règles — l'attribution CÈDE la
            // largeur, la durée la garde.
            let credit = StoryAudioIdentity.attribution(of: sound)
            if !credit.isEmpty {
                Text(credit)
                    .font(.caption2.weight(.semibold))
                    .foregroundStyle(tint)
                    .lineLimit(1)
                    .truncationMode(.tail)
                    .frame(maxWidth: creditMaxWidth, alignment: .leading)
                    .layoutPriority(0)
            }

            if let duree = ComposerSoundCredit.durationLabel(for: sound) {
                Text(duree)
                    .font(.caption2.weight(.semibold).monospacedDigit())
                    .foregroundStyle(tint)
                    .fixedSize()
                    .layoutPriority(1)
            }
        }
    }

    /// L'onde — le RELEVÉ quand on l'a, une sinusoïde sinon.
    ///
    /// Le repli n'est pas décoratif : `waveformSamples` n'est rempli qu'à la
    /// composition fraîche, et un brouillon restauré ou un son emprunté arrive
    /// avec un tableau vide. Une bande plate s'y lirait comme un SILENCE, ce que
    /// le son n'est pas — la sinusoïde dit « du son, dont on ne connaît pas
    /// encore le tracé ».
    private var wave: some View {
        Canvas { context, size in
            let releve = sound.waveformSamples
            let barWidth = size.width / CGFloat(Self.barCount) * 0.55
            let step = size.width / CGFloat(Self.barCount)
            for i in 0..<Self.barCount {
                let hauteur: CGFloat
                if releve.isEmpty {
                    let phase = Double(i) / Double(Self.barCount) * .pi * 2
                    hauteur = size.height * (0.35 + 0.45 * abs(sin(phase)))
                } else {
                    let index = min(releve.count - 1, i * releve.count / Self.barCount)
                    hauteur = max(3, CGFloat(AudioWaveform.displayHeight(rms: releve[index])) * size.height)
                }
                let x = CGFloat(i) * step + (step - barWidth) / 2
                let rect = CGRect(x: x, y: (size.height - hauteur) / 2,
                                  width: barWidth, height: hauteur)
                context.fill(Path(roundedRect: rect, cornerRadius: barWidth / 2),
                             with: .color(tint))
            }
        }
        .accessibilityHidden(true)
    }
}
