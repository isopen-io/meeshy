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
/// ## Elle OUVRE, depuis #4668
///
/// > Directive porteur 2026-09-01 : « lorsque le son est utilisé en fond, on a
/// > la pill au niveau de l'avatar, le toucher devrait ouvrir la vue d'édition
/// > du son là ».
///
/// Elle était une lecture pure pendant que le son de CONTENU s'ouvrait déjà
/// d'un doigt (`MeeshyAudioTranscriptPlayer.onEdit`). Deux moitiés de la même
/// idée qui se comportaient différemment dans un seul écran — la loi 6 prise en
/// défaut sans quitter la vue.
///
/// ## Et elle porte le CRÉDIT, depuis #4669
///
/// La pastille du socle disparaissant, elle était le seul endroit du composer
/// qui montrait `soundAuthorUsername`. Le titre et l'auteur ont suivi ici, par
/// la composition qui les rendait déjà (`ComposerSoundCredit`) : un son
/// emprunté doit dire à qui on le doit, où qu'on le lise. Un vocal sans titre
/// n'affiche rien de plus qu'avant — sa durée.
struct ComposerAvatarSoundBadge: View {

    let sound: StoryAudioPlayerObject
    var tint: Color = MeeshyColors.indigo400
    /// **Ce que le doigt ouvre.** `nil` ⇒ la pastille reste une lecture, et ne
    /// s'annonce alors ni comme bouton ni comme activable — la loi 4 : un
    /// contrôle existe s'il a un effet.
    var onTap: (() -> Void)?

    /// Nombre de barres de l'onde. Assez pour qu'elle se lise comme un son,
    /// assez peu pour tenir à côté d'un avatar sans repousser le texte.
    private static let barCount = 14

    @ViewBuilder
    var body: some View {
        if let onTap {
            Button {
                onTap()
                HapticFeedback.light()
            } label: {
                capsule
            }
            .buttonStyle(.plain)
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(Self.spokenLabel(sound))
            .accessibilityAddTraits(.isButton)
            .accessibilityHint(Self.editHint)
        } else {
            capsule
                // Une seule annonce pour les trois éléments : « Son de fond,
                // Nom, 12 secondes ». Trois éléments séparés feraient trois
                // arrêts de VoiceOver pour une seule information.
                .accessibilityElement(children: .ignore)
                .accessibilityLabel(Self.spokenLabel(sound))
        }
    }

    private var capsule: some View {
        HStack(spacing: 7) {
            Image(systemName: "music.note")
                .font(.system(size: 12, weight: .semibold))
                .foregroundStyle(tint)

            wave
                .frame(width: 44, height: 16)

            // **Le crédit ne prend la place que s'il existe** (#4669). Un vocal
            // n'a ni titre ni auteur : la pastille garde alors exactement la
            // forme qu'elle avait, note-onde-durée.
            //
            // **Et la durée n'est JAMAIS ce qu'on tronque** (#4676). Servie en
            // une seule chaîne avec le titre, elle rendait « Feel the pulse ·
            // @jcnm · 2… » — la troncature en queue coupe ce qui vient en
            // dernier, et la durée est le dernier morceau d'une phrase dont
            // elle n'est pas le sujet. Elle est pourtant l'une des trois choses
            // que la directive nomme. Deux `Text`, deux règles : l'attribution
            // CÈDE la largeur, la durée la garde.
            let credit = ComposerSoundCredit.attribution(for: sound)
            if !credit.isEmpty {
                Text(credit)
                    .font(.caption2.weight(.semibold))
                    .foregroundStyle(tint)
                    .lineLimit(1)
                    .truncationMode(.tail)
                    .frame(maxWidth: 150, alignment: .leading)
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
        .padding(.horizontal, 10)
        .padding(.vertical, 6)
        // **44 pt est un PLANCHER dès qu'elle s'ouvre.** La pastille mesurait
        // 28 pt de haut tant qu'elle ne faisait que se lire ; devenue bouton,
        // elle doit la cible que la dimension 5 exige.
        .frame(minHeight: 44)
        .background(Capsule().fill(tint.opacity(0.16)))
        .overlay(Capsule().stroke(tint.opacity(0.30), lineWidth: 1))
    }

    static var editHint: String {
        String(localized: "composer.sound.background.edit.hint",
               defaultValue: "Modifier le son de fond", bundle: .main)
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
        let role = String(localized: "composer.sound.background.a11y",
                          defaultValue: "Son de fond", bundle: .main)
        // **La composition est un site UNIQUE** — celle-là même que la pastille
        // MONTRE. Recomposer ici titre, auteur et durée aurait donné deux
        // phrases pour une capsule, et l'auteur emprunté aurait manqué à celle
        // qui se dit à voix haute : c'est exactement l'écart que
        // `ComposerSoundCredit` existe pour interdire.
        let credit = ComposerSoundCredit.spokenLabel(for: sound, locale: locale)
        return credit.isEmpty ? role : "\(role), \(credit)"
    }
}
