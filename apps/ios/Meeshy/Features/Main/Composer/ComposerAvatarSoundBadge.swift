import SwiftUI
import MeeshySDK
import MeeshyUI

/// **La pastille du son de fond, à côté de l'avatar** (#4657).
///
/// Directive porteur du 2026-09-01 : « lorsqu'un son de fond est ajouté dans
/// cette vue de post il faut mettre la note musicale et le son ou vague
/// sinusoïde et la durée juste à côté de l'avatar et faire descendre la zone de
/// texte ».
///
/// ## Pourquoi à côté de l'avatar, et pas ailleurs
///
/// L'avatar dit QUI publie. Le son de fond dit AVEC QUOI. Ce sont les deux
/// attributs de la publication qui existent avant le premier caractère tapé —
/// les poser sur la même ligne les donne à lire d'un coup d'œil, et fait
/// descendre le texte de ce qu'ils occupent plutôt que de le recouvrir.
///
/// Le socle porte déjà la MÊME information dans sa pastille « Ajouter un son ».
/// Ce n'est pas un doublon de contrôle mais un rappel de CONTEXTE : celle du
/// socle est un bouton qui ouvre la feuille, celle-ci est un état qu'on lit
/// pendant qu'on écrit, à l'endroit où le regard est déjà.
struct ComposerAvatarSoundBadge: View {

    let sound: StoryAudioPlayerObject
    var tint: Color = MeeshyColors.indigo400

    /// Nombre de barres de l'onde. Assez pour qu'elle se lise comme un son,
    /// assez peu pour tenir à côté d'un avatar sans repousser le texte.
    private static let barCount = 14

    var body: some View {
        HStack(spacing: 7) {
            Image(systemName: "music.note")
                .font(.system(size: 12, weight: .semibold))
                .foregroundStyle(tint)

            wave
                .frame(width: 44, height: 16)

            if let secondes = sound.duration, secondes > 0 {
                Text(LocalizedNumber.duration(seconds: Int(secondes.rounded())))
                    .font(.caption2.weight(.semibold).monospacedDigit())
                    .foregroundStyle(tint)
            }
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 6)
        .background(Capsule().fill(tint.opacity(0.16)))
        .overlay(Capsule().stroke(tint.opacity(0.30), lineWidth: 1))
        // Une seule annonce pour les trois éléments : « Son de fond, Nom, 12
        // secondes ». Trois éléments séparés feraient trois arrêts de VoiceOver
        // pour une seule information.
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(Self.spokenLabel(sound))
    }

    /// L'onde — le RELEVÉ quand on l'a, une sinusoïde sinon.
    ///
    /// Le repli n'est pas décoratif : `waveformSamples` n'est rempli qu'à la
    /// composition fraîche, et un brouillon restauré ou un son emprunté arrive
    /// avec un tableau vide. Une bande plate s'y lirait comme un silence, ce
    /// que le son n'est pas — la sinusoïde dit « du son, dont on ne connaît pas
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

    /// **La durée se DIT.** « 0:12 » s'annonce « zéro deux-points douze » : la
    /// pastille montre une horloge et en annonce une phrase.
    static func spokenLabel(_ sound: StoryAudioPlayerObject, locale: Locale = .current) -> String {
        var morceaux = [String(localized: "composer.sound.background.a11y",
                               defaultValue: "Son de fond", bundle: .main)]
        if let nom = sound.name, !nom.isEmpty { morceaux.append(nom) }
        if let secondes = sound.duration, secondes > 0 {
            morceaux.append(LocalizedNumber.spokenDuration(seconds: Int(secondes.rounded()), locale: locale))
        }
        return morceaux.joined(separator: ", ")
    }
}
