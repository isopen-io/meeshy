# Iteration-212i — CallView: VoiceOver label + value on the audio-call duration capsule

## Contexte

`CallView` (`apps/ios/Meeshy/Features/Main/Views/CallView.swift`) est l'écran
d'appel plein écran. Le layout **audio** affiche, sous le nom du correspondant,
une **capsule de durée** (l. 843-856) : un `HStack` = `TransientCallSignalGlyph`
(glyphe signal transitoire, visible seulement à la dégradation réseau) +
`Text(callManager.formattedDuration)` (`%02d:%02d` → « 02:34 »).

Le layout **vidéo** possède déjà un badge de durée pleinement accessible
(l. ~1054) : `.accessibilityLabel(videoDurationBadgeAccessibilityLabel)` +
`.accessibilityValue(formattedDuration)` + `.updatesFrequently`. La capsule
audio, elle, portait `.accessibilityElement(children: .combine)` +
`.updatesFrequently` **sans aucun `.accessibilityLabel`**.

## Problème (a11y — HIG « nommer ce qu'un contrôle mesure »)

Avec `.combine`, VoiceOver lisait la capsule audio comme un **« 02:34 » nu**
(plus l'éventuel libellé du glyphe signal), sans jamais indiquer qu'il s'agit de
la **durée de l'appel**. Même défaut « readout numérique sans contexte » que
206i (compteur de réactions), 210i (chrono d'enregistrement) et 211i (durée
d'appel dans `FloatingCallPillView`). Le badge vidéo frère était déjà correct —
seule la capsule audio restait muette de sens.

## Correctif

Parité avec le badge vidéo : nommer le readout via un libellé + exposer le temps
comme valeur, en **réutilisant la clé i18n existante** `call.duration.a11y.label`
(déjà traduite dans les 5 locales, déjà consommée par
`videoDurationBadgeAccessibilityLabel:962` sans `defaultValue`) :

```swift
.accessibilityElement(children: .ignore)
.accessibilityLabel(String(localized: "call.duration.a11y.label"))
.accessibilityValue(callManager.formattedDuration)
.accessibilityAddTraits(.updatesFrequently)
```

VoiceOver annonce désormais **« Durée de l'appel, 02:34 »** au lieu de « 02:34 ».

**Pourquoi `.ignore` plutôt que `.combine`** : la doc du helper vidéo
(`videoDurationBadgeAccessibilityLabel`, l. 952-960) note explicitement que la
dégradation signal/réseau est portée, **dans le layout audio**, par les rangées
`statusPill` adjacentes (« unlike the audio layout's separate `statusPill` rows »).
Le `TransientCallSignalGlyph` de la capsule est donc **décoratif** ici (son état
est déjà voisé ailleurs) → on l'ignore plutôt que de le dupliquer dans
l'annonce de la durée. `.updatesFrequently` est conservé (VoiceOver ne
re-annonce pas le chrono à chaque seconde).

## Portée & sûreté

- **1 fichier**, +9 lignes (dont 6 de commentaire), 0 logique / 0 réseau /
  0 layout / 0 changement visuel / 0 test neuf.
- **0 clé i18n neuve, 0 édition `.xcstrings`** — réutilise `call.duration.a11y.label`
  (extraite du catalogue, comme le fait déjà le helper vidéo).
- Layout vidéo, badge vidéo, écran de fin d'appel et autres capsules **inchangés**
  (le badge vidéo était déjà correct ; l'écran de fin est hors périmètre).
- Fichier `CallView.swift` mentionné dans une seule PR récente (#2230, CallView
  retry CTA) — **déjà mergée**, absente de la liste des PR ouvertes → 0 collision
  avec l'essaim `laughing-thompson`.

## Vérification

- Gate = CI `iOS Tests` (compile Xcode 26.1.1 / Swift 6.2, run simu iOS 18.2).
- `.accessibilityElement(children: .ignore)` + label/value = un élément a11y
  opaque unique (parité exacte avec le badge vidéo, cf. sa doc l. 956-958).
- Aucun toolchain Swift dans l'environnement d'exécution (Linux) → vérification
  par inspection + gate CI.

## Statut

✅ Résolu. Ne plus re-flagger la capsule de durée du layout audio de `CallView`
pour le libellé/valeur VoiceOver (soldé 212i). Le badge vidéo était déjà couvert.

## Pistes 213i+

- `Text(callManager.formattedDuration)` de l'**écran de fin d'appel** (~l. 1462,
  readout statique) et de la carte d'appel entrant (~l. 909) — auditer
  libellé/valeur VoiceOver.
- Autres readouts numériques nus restants dans l'app (compteurs/jauges).
