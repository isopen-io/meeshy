# iOS UI/UX — Iteration 193i

**Date** : 2026-07-20
**Surface** : `apps/ios/Meeshy/Features/Main/Components/MessageDetailSheet.swift` (`languageRow`)
**Axe** : VoiceOver — parité a11y avec le jumeau déjà migré (`MessageLanguageDetailView.languageRow`)
**Base** : `main` HEAD `995ed53`

## Contexte

L'essaim iOS est dense (PR ouvertes jusqu'à 192i). Numéro **193i** choisi
strictement `> 192i`. `MessageDetailSheet.swift` **n'apparaît dans aucune PR
ouverte** (vérifié via `list_pull_requests`, 20 PR) — surface libre.

## Constat — `languageRow` : jumeau non migré

`MessageDetailSheet.languageRow` (l.581-707) et
`MessageDetail/MessageLanguageDetailView.languageRow` (l.196-320) sont deux
implémentations **quasi identiques** de la ligne de sélection de langue du
Prisme Linguistique (drapeau + nom + preview de traduction + bouton
retraduire + coche/chevron). Le jumeau `MessageLanguageDetailView` a reçu son
traitement a11y complet (185i), mais `MessageDetailSheet.languageRow` était
resté en arrière avec **deux écarts** de la même classe :

### A. Bouton « retraduire » sans libellé (l.659-665)
Le bouton icône `arrow.clockwise` (retraduire une langue déjà traduite)
n'avait **aucun** `.accessibilityLabel` → VoiceOver annonçait « bouton » sans
nom. Le jumeau pose déjà ce label (`MessageLanguageDetailView:278`).

### B. Ligne sélectionnée sans trait `.isSelected` (l.587-704)
La langue active était signalée uniquement par le visuel (couleur du texte,
coche `checkmark.circle.fill` vs `chevron.right`, fond teinté) — sans
`.accessibilityAddTraits(.isSelected)`. Le jumeau pose déjà ce trait
(`MessageLanguageDetailView:318`). Violation HIG « ne jamais transmettre un
état par la seule couleur/glyphe ».

## Correctifs (193i)

1. **Bouton retraduire** — ajout de
   `.accessibilityLabel(String(localized: "message-detail.a11y.retranslate", …))`.
   La **clé i18n existe déjà** (`message-detail.a11y.retranslate` = « Retraduire »,
   introduite en 185i pour le jumeau) → **0 clé neuve**, réutilisation stricte.

2. **Ligne** — ajout de `.accessibilityAddTraits(isSelected ? [.isSelected] : [])`
   sur le `Button` externe (après `.disabled(isTranslating)`). VoiceOver lit
   désormais « <langue>, sélectionné » sur la langue active.

Mirror octet-pour-octet des lignes 278 et 318 du jumeau prouvé.

## Portée

- **1 fichier**, +2 lignes.
- **0 logique** / 0 réseau / **0 clé i18n neuve** (réutilise
  `message-detail.a11y.retranslate`) / 0 test neuf / **0 changement visuel**.
- `isSelected` déjà en portée dans `languageRow` (`let isSelected = …`, l.585).

## Vérification

- `isSelected` en portée au site d'insertion du trait (défini l.585).
- Placement du `.accessibilityLabel` sur le `Button` retraduire (View) — parité
  exacte avec le jumeau `MessageLanguageDetailView:271-278`.
- Placement du trait après `.disabled` sur le `Button` externe — parité exacte
  avec `MessageLanguageDetailView:318`.
- Build iOS non exécutable sous Linux (pas de toolchain Xcode/Swift) →
  **gate = CI `iOS Tests`**.

## NE PLUS re-flagger

`MessageDetailSheet.languageRow` : label retraduire + état sélectionné VoiceOver
soldés 193i. Les deux jumeaux (`MessageDetailSheet` + `MessageLanguageDetailView`)
sont désormais à parité a11y.

## Restant (piste 194i+)

`MessageDetailSheet.languageRow` et `MessageLanguageDetailView.languageRow`
restent **deux implémentations dupliquées** de la même ligne — candidate à une
extraction de composant partagé (`LanguageTranslationRow`) dans une itération
design-system future. Auditer la collision essaim via `list_pull_requests`
avant : les deux fichiers évoluent en parallèle et une fusion prématurée
casserait les PR en vol.
