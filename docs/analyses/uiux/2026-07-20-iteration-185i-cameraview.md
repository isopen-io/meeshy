# iOS UI/UX — Iteration 185i

**Date** : 2026-07-20
**Surface** : `apps/ios/Meeshy/Features/Main/Components/CameraView.swift`
**Axes** : i18n (chaînes en dur) + a11y (VoiceOver labels des actions primaires + selected-state)
**Base** : `main` HEAD `0b2df50`

## Contexte

`CameraView` est la caméra plein écran (photo/vidéo) utilisée par le composer
(`UniversalComposerBar+Attachments`). Le fichier est par ailleurs mûr : chrome
`camera.close` / `camera.switch` / `camera.flash.*` localisé + `.accessibilityLabel`,
fontes `MeeshyFont.relative` scalables. Trois lacunes subsistaient, toutes
**auto-contenues** (1 fichier de code + catalogue i18n, 0 logique).

## Constats

### A. Sélecteur de mode « Photo » / « Video » — chaînes en dur (i18n)

`modeSwitcher` appelait `modeTab("Photo", …)` et `modeTab("Video", …)` avec des
**littéraux anglais non localisés** — seul écart i18n du fichier (tout le reste
passe par `String(localized:)`). Un utilisateur francophone voyait « Video » (au
lieu de « Vidéo ») dans une UI par ailleurs traduite.

### B. Sélecteur de mode — état sélectionné porté par la seule couleur (a11y)

La sélection Photo/Vidéo n'était signalée que par la couleur/graisse du texte
(blanc plein vs `white.opacity(0.5)`). **Ne jamais s'appuyer uniquement sur la
couleur pour véhiculer une information** (règle a11y). VoiceOver n'annonçait pas
quel onglet était actif → pas de trait `.isSelected`.

### C. Boutons de capture primaires **sans label VoiceOver** (a11y)

Les actions les plus importantes de l'écran étaient muettes pour VoiceOver :
- `photoButton` (déclencheur) — cercle blanc, aucun `.accessibilityLabel` →
  annoncé « Bouton » sans plus.
- `videoRecordButton` (démarrer/arrêter l'enregistrement) — idem, et son état
  bascule (rond → carré) sans annonce.
- `recordingIndicator` (point rouge + minuteur) — le `Text` de durée était lu
  « 0:34 » hors contexte, sans indiquer qu'un enregistrement est en cours.

## Correctifs (185i)

1. **i18n mode tabs** — `modeTab(String(localized: "camera.mode.photo", …))` /
   `"camera.mode.video"` (defaultValue `Photo` / `Vidéo`). `Text(title)` reste
   verbatim (valeur déjà résolue).
2. **Selected-state** — `.accessibilityAddTraits(selected ? [.isSelected] : [])`
   sur `modeTab` → VoiceOver annonce « sélectionné » sur l'onglet actif.
3. **Label déclencheur photo** — `.accessibilityLabel("camera.capture.photo")`
   (« Prendre une photo »).
4. **Label enregistrement vidéo dynamique** — `.accessibilityLabel(…)` sur
   `videoRecordButton` : `camera.record.stop` (« Arrêter l'enregistrement »)
   quand `isRecordingVideo`, sinon `camera.record.start` (« Démarrer
   l'enregistrement »).
5. **Indicateur d'enregistrement** — `recordingIndicator` : `.accessibilityElement(children: .ignore)`
   + label `camera.recording` (« Enregistrement en cours ») + `accessibilityValue`
   = durée → VoiceOver lit « Enregistrement en cours, 0:34 ».

## Clés i18n neuves (6, catalogue `Localizable.xcstrings`, 5 langues de/en/es/fr/pt-BR)

`camera.mode.photo`, `camera.mode.video`, `camera.capture.photo`,
`camera.record.start`, `camera.record.stop`, `camera.recording` — insérées en
position alphabétique dans le catalogue (état `translated` sur les 5 langues).

## Portée

- **1 fichier Swift** (12 lignes) + **catalogue i18n** (+210 lignes, 6 clés × 35).
- **0 logique** caméra / 0 réseau / 0 test neuf / 0 changement visuel (traits a11y
  + labels invisibles ; les chaînes traduites sont la seule différence visible, à
  parité produit).
- Chrome existant (`camera.close`/`switch`/`flash.*`), boutons flash/switch,
  timer, gestes → inchangés.

## Vérification

- Équilibre accolades/parenthèses vérifié (126/126, 260/260).
- Catalogue `Localizable.xcstrings` validé JSON après insertion ; ordre des clés
  `camera.*` conforme (capture < close < flash < mode < record < recording < switch).
- `Text(title)` avec `String` = rendu verbatim (valeur pré-localisée) — pas de
  double lookup.
- Build iOS non exécutable en environnement Linux (pas de toolchain Xcode/Swift)
  → **gate = CI `iOS Tests`**.

## NE PLUS re-flagger

`CameraView` : mode tabs localisés + `.isSelected` posé, boutons capture/record
labellisés, indicateur d'enregistrement annoncé. Les `.system(size:)` restants
(xmark 18, flash 16, rotate 22, formes du déclencheur) sont du chrome décoratif /
formes géométriques figées à dessein.

## Restant (piste 186i+)

- États de permission caméra refusée (`AVCaptureDevice.authorizationStatus`
  ligne ~267) : pas d'UI HIG dédiée si l'accès est refusé — piste `ContentUnavailableView`.
- Autres surfaces plein écran média : `AudioFullscreenView` (revue a11y des
  contrôles de transport) — vérifier collision essaim via `list_pull_requests`.
