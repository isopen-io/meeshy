# Itération 149i — Analyse UI/UX iOS : `ChangePasswordView`

**Date** : 2026-07-16
**Piste** : iOS (suffixe `i`).
**Surface** : `apps/ios/Meeshy/Features/Main/Views/ChangePasswordView.swift`
**Base** : `main` HEAD (`ab6df74`)
**Branche** : `claude/laughing-thompson-uj2nmm`
**Gate** : CI `iOS Tests`

## Contexte

`ChangePasswordView` est l'écran **sensible** de changement de mot de passe (Réglages → Compte) :
en-tête avec retour + titre, deux sections de champs sécurisés (mot de passe actuel / nouveau +
confirmation), une **checklist de validation temps réel** (≥ 8 caractères, correspondance), un
bouton d'envoi, et un **overlay de succès transitoire** (auto-dismiss 1,5 s).

Surface **fraîche** : `.font(.system(size:))` non migré, **0** commentaire doctrine, **0**
`MeeshyFont.relative`. **Aucune PR ouverte ne touche ce fichier** (essaim iOS en vol 140i→148i :
`ThemedBackButton`, `MyStoriesView`, `FriendRequestListView`, `StoryExpiredContent`,
`MessageViewsDetailView`, `ConversationDashboard`, `VoiceProfileManageView`, `StatsTimelineChart`,
`StoryViewerContainer`) → **0 contention**. Numéro **149i** (strictement > 148i, plus haut en vol
#1982).

## Constat (avant 149i)

Le corps est **déjà entièrement sur polices sémantiques** (`.subheadline`, `.headline`, `.caption`,
`.caption2`, `.footnote`, `.callout`, `.system(.caption2, design:)`) → **Dynamic Type déjà couvert**
pour tout le contenu lisible. i18n complet (toutes les chaînes passent par `String(localized:)`).

**1 seul `.font(.system(size:))`** — le héros décoratif de l'overlay de succès. Mais **3 lacunes
VoiceOver / a11y réelles** subsistent :

1. **Checklist de validation — état porté par la couleur SEULE (violation WCAG 1.4.1).**
   `validationRow` affiche `checkmark.circle.fill` (vert) vs `circle` (gris) pour signaler chaque
   règle remplie/non-remplie. VoiceOver relisait l'icône décorative **sans annoncer l'état** :
   un utilisateur non-voyant (ou daltonien) ne pouvait pas distinguer « règle validée » de « règle
   en attente » — l'unique signal était la couleur/forme du glyphe. **C'est le retour de
   validation principal de l'écran** → gap réel.

2. **Overlay de succès — héros décoratif exposé + confirmation non groupée.**
   `checkmark.shield.fill` (48pt) n'était pas masqué → VoiceOver le lisait comme un élément
   distinct (« bouclier coché ») en doublon du sens porté par « Mot de passe modifié ». L'overlay
   n'était pas non plus groupé → 2 éléments là où la confirmation transitoire (1,5 s) doit se lire
   d'un bloc.

3. **Titres de section + titre d'écran non navigables au rotor.**
   `sectionHeader` (« MOT DE PASSE ACTUEL », « NOUVEAU MOT DE PASSE ») et le titre d'en-tête
   n'avaient **aucun** trait `.isHeader` — contrairement au `sectionHeader` **strictement
   identique** de `DeleteAccountView` (écran frère, lignes 337-350) qui, lui, porte
   `.accessibilityElement(children: .combine)` + `.isHeader`. Écart de parité → le rotor VoiceOver
   « En-têtes » ne trouvait aucune ancre sur cet écran.

## Correctifs 149i

| Site | Avant | Après |
|------|-------|-------|
| `validationRow` icône `checkmark.circle.fill`/`circle` | décorative, relue, **état = couleur seule** | **`.accessibilityHidden(true)`** ; rangée **`.accessibilityElement(children: .combine)` + `.accessibilityAddTraits(met ? .isSelected : [])`** → l'état rempli est annoncé « sélectionné » (localisé par iOS) sans dépendre de la couleur |
| `successOverlay` héros `checkmark.shield.fill` 48pt | exposé, non commenté | **figé + commenté (doctrine 84i/87i)** ; **`.accessibilityHidden(true)`** |
| `successOverlay` VStack | 2 éléments distincts | **`.accessibilityElement(children: .combine)`** → confirmation lue d'un bloc |
| `sectionHeader` (×2) | sans trait | **`.accessibilityElement(children: .combine)` + `.isHeader`** (parité `DeleteAccountView`) |
| titre d'en-tête | sans trait | **`.accessibilityAddTraits(.isHeader)`** (parité `DeleteAccountView`) |
| bouton retour | labellisé implicitement par le texte | **`.accessibilityLabel(common.back)`** explicite (parité `DeleteAccountView`, robustesse) |

- **0 clé i18n neuve** : l'état de validation passe par le trait système `.isSelected` (localisé
  par iOS, pas de chaîne app) ; `common.back` est déjà utilisée dans le fichier.
- **0 police visible modifiée** : l'unique `.font(.system(size: 48))` reste figé (héros décoratif
  ≥40pt, doctrine 84i/87i — un scaler XXXL déborderait de l'overlay). Reste déjà sémantique.
- **0 logique** modifiée, **0 test neuf**, **1 fichier**. Additif pur (7 modificateurs a11y +
  4 commentaires). Parité doctrinale 55i/74i/86i/93i/104i/148i.

## Vérification

- **Sémantique préservée** : aucune police visible changée, aucun layout modifié → 0 régression
  visuelle, snapshots inchangés.
- **VoiceOver** : chaque règle de la checklist annonce désormais son état (« … , sélectionné »
  quand remplie) sans reposer sur la couleur ; le héros de succès ne pollue plus le focus et la
  confirmation se lit d'un bloc ; le rotor « En-têtes » trouve les 2 sections + le titre.
- **Gate** : CI `iOS Tests` (compile Xcode 26.1.1 / run simu iOS 18.2). Changement purement
  additif (modificateurs a11y + commentaires) → aucun risque de compile.

## Complétion

✅ **Résolu 149i** — `ChangePasswordView` : la checklist de validation ne repose plus sur la
couleur seule (état annoncé via `.isSelected`), héros de succès masqué + confirmation groupée,
titres de section/écran ancrés au rotor, bouton retour labellisé. Parité a11y avec le screen frère
`DeleteAccountView`.

**NE PLUS re-flagger** `ChangePasswordView` : Dynamic Type déjà sémantique partout, l'unique
`.system(size: 48)` figé à dessein (héros succès décoratif), a11y checklist/rotor comblée.

**Restant / différé 150i+** (fresh surfaces à vérifier vs collision essaim) :
`OnboardingStepViews.reqRow` (**même gap couleur-seule** que 149i — checklist mdp inscription,
`checkmark.circle.fill`/`circle` sans état a11y — candidat naturel de suite),
`StoryViewerView+Content` (31, ⚠️ i18n #1174), `ConversationAnimatedBackground` (12, décoratif),
`ConversationBackgroundComponents` (2, décoratif fixe), `BubbleStandardLayout` (2, ⚠️ Zero-re-render
leaf).
