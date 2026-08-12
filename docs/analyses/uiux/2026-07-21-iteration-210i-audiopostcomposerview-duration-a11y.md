# Iteration-210i — AudioPostComposerView: VoiceOver label + value on the recording duration timer

## Contexte

`AudioPostComposerView`
(`apps/ios/Meeshy/Features/Main/Views/AudioPostComposerView.swift`) est le
composeur de post audio (enregistrement → transcription → aperçu → publication).
Sa `recordingCard` affiche un **chrono monospacé proéminent** (`durationLabel`,
l. 179-198) : pendant l'enregistrement et en aperçu, un `Text(formattedDuration)`
en `.largeTitle` rend le temps sous la forme `"0:34"` (`%d:%02d`, l. 537-542).

Le reste de la carte est déjà accessible : le visuel central (waveform / sceau /
micro / spinner) est `.accessibilityHidden(true)` (l. 128, décor pur), le bouton
d'enregistrement porte un libellé qui bascule selon l'état (l. 510-516), les
pastilles de langue ont libellé complet + trait `.isSelected` (l. 258-259).

## Problème (a11y — HIG « nommer ce qu'un contrôle mesure »)

Le `Text(formattedDuration)` des états **recording** et **preview** n'avait
**aucun modificateur d'accessibilité** : VoiceOver lisait la chaîne brute
`"0:34"` — un nombre sans contexte. L'utilisateur non-voyant n'a aucun moyen de
savoir que ce nombre est la **durée d'enregistrement** (ou la longueur du clip
enregistré en aperçu). C'est exactement le défaut « compteur nu » soldé en 206i
sur `MessageReactionsDetailView` (label + value) : un chiffre visuellement
explicite par sa position/taille, mais muet pour VoiceOver.

## Correctif

Ajout d'un couple libellé + valeur sur le `Text` du chrono, avec un libellé
sensible à l'état (le décor visuel qui distingue enregistrement vs aperçu est
masqué à VoiceOver, donc le libellé doit porter cette distinction) :

```swift
Text(formattedDuration)
    .font(.system(.largeTitle, design: .monospaced).weight(.light))
    .foregroundColor(theme.textPrimary)
    .accessibilityLabel(audioRecorder.isRecording
        ? String(localized: "Durée d'enregistrement", defaultValue: "Durée d'enregistrement")
        : String(localized: "Durée enregistrée",      defaultValue: "Durée enregistrée"))
    .accessibilityValue(formattedDuration)
```

VoiceOver annonce désormais **« Durée d'enregistrement, 0:34 »** pendant la
capture et **« Durée enregistrée, 0:34 »** en aperçu, au lieu d'un « 0:34 » nu.
Le libellé sur un `Text` (nœud feuille) remplace le contenu lu ; la valeur
expose le temps courant.

## Portée & sûreté

- **1 fichier**, +9 lignes (dont 4 de commentaire), 0 logique / 0 réseau /
  0 layout / 0 changement visuel / 0 test neuf.
- **2 clés i18n inline** (`Durée d'enregistrement`, `Durée enregistrée`),
  0 édition `.xcstrings` — extraction au build depuis `defaultValue`, aligné sur
  toutes les clés inline existantes du fichier (`Publier`, `Refaire`,
  `Appuyez pour enregistrer`…).
- États `transcribing` (chrono caption secondaire, déjà accompagné du texte
  « Transcription en cours… ») et `idle` (« Appuyez pour enregistrer »)
  **inchangés** — pas de gain à réécrire, hors périmètre du défaut ciblé.
- Fichier **absent de toute PR ouverte** (vérifié `list_pull_requests`, 24 PR
  ouvertes ; 0 occurrence de `AudioPostComposerView`) → 0 collision essaim
  `laughing-thompson`. Pas de recouvrement avec l'audit design-tokens #2246
  (aucune couleur/token touché ici).

## Vérification

- Gate = CI `iOS Tests` (compile Xcode 26.1.1 / Swift 6.2, run simu iOS 18.2).
- `.accessibilityLabel` / `.accessibilityValue` sur un `Text` feuille : le
  libellé se substitue au contenu, la valeur s'y ajoute — comportement standard
  SwiftUI, aucun impact visuel.
- Aucun toolchain Swift dans l'environnement d'exécution (Linux) → vérification
  par inspection + gate CI.

## Statut

✅ Résolu. Ne plus re-flagger `AudioPostComposerView.durationLabel` (chrono
recording/preview) pour le libellé/valeur VoiceOver (soldé 210i).

## Pistes 211i+

- Chrono `transcribing` (caption secondaire) : grouper avec « Transcription en
  cours… » via `.accessibilityElement(children: .combine)` si un futur audit le
  juge utile (bénéfice marginal, laissé de côté ici).
- Autres readouts numériques nus (compteurs, minuteurs, jauges) dans le reste de
  l'app — auditer libellé/valeur VoiceOver, vérifier collision essaim.
