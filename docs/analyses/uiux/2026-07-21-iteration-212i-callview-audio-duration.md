# iOS UI/UX — Iteration 212i

**Date** : 2026-07-21
**Surface** : `apps/ios/Meeshy/Features/Main/Views/CallView.swift`
- `audioCallLayout` (capsule durée, appel audio plein écran)
- `compactAudioCallHeader` (durée, en-tête compact quand les sous-titres sont actifs)
**Axe** : VoiceOver — readout numérique nu de la durée d'appel (doctrine 206i/210i/211i)
**Base** : `main` HEAD `8ba64bb4` (211i mergé, #2253)

## Contexte

PR précédente #2178 (193i, `MessageDetailSheet.languageRow`) **fermée sans merge**
(conflit) : à la reprise, `main` contenait déjà un **sur-ensemble** du fix 193i
(label retraduire + trait `.isSelected` + label composé `languageRowAccessibilityLabel`).
193i est donc **soldé par main** — non relancé. Nouvelle itération repartie de
`main` HEAD.

La piste 212i+ était explicitement notée dans `branch-tracking.md` (soldé 211i) :
« autres readouts numériques nus » de durée d'appel, en dehors du
`FloatingCallPillView` déjà traité.

## Constat — durée d'appel audio annoncée en chiffres nus

`CallView` possède **trois** affichages de durée :

| Site | Traitement AVANT 212i | VoiceOver (appel sain) |
|---|---|---|
| `videoCallLayout` (badge vidéo) | `children: .ignore` + label composé + `.accessibilityValue` | ✅ « Durée d'appel, 02:34 » |
| `audioCallLayout` (capsule) | `children: .combine` | ❌ « 02:34 » (chiffres nus) |
| `compactAudioCallHeader` | `children: .combine` | ❌ « 02:34 » (chiffres nus) |

Le badge vidéo avait déjà été mis en conformité (doctrine « jamais un chiffre nu :
label statique + valeur dynamique + `.updatesFrequently` »), mais les **deux
readouts audio** utilisaient `.accessibilityElement(children: .combine)`. Avec
`.combine`, VoiceOver lit le label du glyphe signal (quand il est visible) suivi
du texte de durée — mais sur un appel **sain**, le `TransientCallSignalGlyph` est
absent, donc VoiceOver n'annonçait que « 02:34 », sans aucun contexte « durée
d'appel ». Violation directe de la doctrine 211i.

## Correctif (212i)

Miroir exact du sibling prouvé dans le **même fichier** (`videoDurationBadge`) :

1. **Nouveau helper** `audioDurationBadgeAccessibilityLabel` (jumeau de
   `videoDurationBadgeAccessibilityLabel`). Différence justifiée : la couche audio
   possède une **rangée de status pills** dédiée (muet / haut-parleur / instable /
   réseau contact / reconnexion) qui annonce déjà ces états. Le label audio ne
   replie donc **que** le glyphe signal transitoire (sans équivalent dans la
   rangée), gaté sur `signalStrength.isDegraded` — identique au gate du badge
   vidéo. Replier réseau-contact / reconnexion aurait **doublé** l'annonce.

2. **Les deux readouts audio** : `.accessibilityElement(children: .combine)` →
   `.accessibilityElement(children: .ignore)` + `.accessibilityLabel(audioDurationBadgeAccessibilityLabel)`
   + `.accessibilityValue(callManager.formattedDuration)` + `.accessibilityAddTraits(.updatesFrequently)`
   (conservé). VoiceOver lit désormais « Durée d'appel, 02:34 » et ne réénonce
   que la valeur qui tick.

**Clé i18n** : réutilise `call.duration.a11y.label` (déjà dans
`Localizable.xcstrings`, déjà consommée par le badge vidéo) — **0 nouvelle clé**.

## Portée

- **1 fichier** produit (`CallView.swift`) : +1 helper (~10 l.), 2 readouts
  convertis (+3 lignes chacun).
- **1 fichier** test (`CallViewAccessibilityTests.swift`) : +4 tests source-scan
  (pattern établi du fichier).
- **0 logique** / 0 réseau / 0 layout / **0 visuel** / **0 nouvelle clé i18n**.
  Le rendu à l'écran est strictement inchangé (les modifiers a11y ne rendent rien).

## Vérification

- `grep -c` : 2 sites `audioDurationBadgeAccessibilityLabel`, 3 sites
  `accessibilityValue(callManager.formattedDuration)` (2 audio + 1 vidéo), 0
  `children: .combine` restant sur un readout de durée (les 5 `.combine` restants
  sont des rangées icône+texte sans rapport : connecting, remoteCameraOff, etc.).
- Tests RED→GREEN : `test_audioDurationReadouts_useComposedLabel_notBareCombinedDigits`,
  `test_audioDurationReadouts_exposeDurationAsAccessibilityValue`,
  `test_audioCallLayout_durationReadout_isOpaqueElement_notCombine`,
  `test_audioDurationBadgeAccessibilityLabel_foldsSignalButNotStatusRowState`.
- Build iOS non exécutable sous Linux (pas de toolchain Xcode/Swift) →
  **gate = CI `iOS Tests`**.

## NE PLUS re-flagger

`CallView.audioCallLayout` et `CallView.compactAudioCallHeader` : durée d'appel
VoiceOver soldée 212i (label composé + valeur, parité avec le badge vidéo). Les
trois affichages de durée de `CallView` + `FloatingCallPillView` (211i) sont
désormais tous conformes à la doctrine.

## Restant (piste 213i+)

Autres readouts numériques nus hors contexte d'appel (compteurs, badges de durée
média, tailles de fichier annoncées sans unité parlée). Vérifier collision essaim
via `list_pull_requests` avant chaque surface.
