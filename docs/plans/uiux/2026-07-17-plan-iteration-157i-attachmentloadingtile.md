# Plan — Itération 157i (iOS) : `AttachmentLoadingTile`

**Base** : `main` HEAD (`bc04538`) · **Branche** : `claude/laughing-thompson-qbmffi`
**Thème** : VoiceOver — regroupement de statut de tuile de préparation · **a11y-only**
**Gate** : CI `iOS Tests`

## Constat

Fleet a11y saturé jusqu'à 156i (PR #1966→#2001). Migration Dynamic Type tarie (fichiers restants =
glyphes figés doctrine 82i/86i déjà commentés). Passage à l'audit VoiceOver state-of-the-art.
Cible **non réclamée** par aucune PR ouverte → 0 contention. Numéro **157i** > 156i (plus haut en vol).

`AttachmentLoadingTile` (réutilisable, tray composer) n'a **aucun** regroupement a11y : spinner +
étape + type lus comme 3 fragments. Échec seulement dans un petit `Text` isolé (icône hidden).

## Actions (1 fichier, 0 logique, 0 clé i18n neuve)

| Élément | Action |
|---|---|
| `tileBody` | `.accessibilityElement(children: .ignore)` + `.accessibilityLabel(kindLabel)` + `.accessibilityValue(stageAccessibilityValue)` → « Photo, Compression… » / « Photo, Erreur » |
| `Text(label)` visible | `.accessibilityHidden(true)` (la tuile porte déjà type+état → 0 doublon) |
| `label` | refactor → délègue à `kindLabel` (extrait) |
| `kindLabel` (neuf) | nom localisé du type (réutilisé visible + VoiceOver) |
| `stageAccessibilityValue` (neuf) | valeur d'étape (message d'erreur réel sinon « Erreur » ; vide si `.ready`) |
| Bouton annuler | **inchangé** — frère du `ZStack`, non absorbé par `children: .ignore` |

## Règles respectées

1. Bouton d'annulation reste accessible (élément distinct, `.accessibilityLabel` intact).
2. 0 clé i18n neuve (réutilise `attachment.kind.*` / `attachment.stage.*` / `attachment.loading.error`).
3. Glyphes figés 82i/86i + Dynamic Type du libellé visible intacts.
4. 0 logique, 0 test neuf, API du composant inchangée (callers `prep`/`onCancel` identiques).

## Étapes

1. [x] Resync `main` HEAD (`bc04538`) ; contention vérifiée (aucune PR ouverte ne cible ce fichier).
2. [x] Édits a11y (3 modificateurs) + refactor `kindLabel` + `stageAccessibilityValue`.
3. [x] Vérifier : 0 test référence le fichier ; callers inchangés.
4. [ ] Commit + push ; PR ; CI `iOS Tests` verte (`Build (bun)` non-requis pour iOS).

## Différé 158i+

- Audit VoiceOver d'autres tuiles/statuts si nouvelles surfaces.
- Gros lot risqué toujours différé : `StoryViewerView+Content` (38 `.system`, ⚠️ i18n #1174 +
  piège `@State private` cross-file `StoryViewerView` ↔ `+Content.swift`).
