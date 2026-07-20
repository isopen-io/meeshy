# Itération 162i — Analyse UI/UX iOS : `StoryViewerView+Content`

**Date** : 2026-07-18
**Piste** : iOS (suffixe `i`).
**Surface** : `apps/ios/Meeshy/Features/Main/Views/StoryViewerView+Content.swift`
**Base** : `main` HEAD (`b706076`)
**Branche** : `claude/laughing-thompson-geeyz4`
**Gate** : CI `iOS Tests`

## Contexte

`StoryViewerView+Content` héberge le contenu overlay du viewer de stories : la feuille « Vues »
(liste des viewers avec réactions/réponses), l'overlay de commentaires façon Instagram
(`StoryCommentsOverlayView` + `StoryCommentRowView`), l'état vide, et le rail d'actions flottant
(`StoryActionButton`). **Surface la plus large restée non migrée** : **31 `.font(.system(size:))`,
0 `MeeshyFont.relative`, 0 commentaire doctrine** avant cette itération.

Cette surface était **différée depuis 100i+** (« gros lot critique en dernier, ⚠️ collision i18n
#1174 »). La collision #1174 concernait des **éditions de `.xcstrings`** ; **cette itération est un
sweep de police pur — 0 clé i18n ajoutée/modifiée** → le risque de collision ne s'applique pas.
Vérifié : **aucune PR ouverte ne touche ce fichier** (le peloton `laughing-thompson` va jusqu'à 161i
`MyStoriesView` #2013, cibles distinctes). Numéro **162i** > plus haut en vol.

## Constat (avant 162i)

31 `.font(.system(size:))` répartis en deux natures :
- **25 vrais libellés/glyphes de contenu** rendus dans des HStack/VStack fluides (liste de viewers,
  commentaires, réponses, bandeau story expirée, header de commentaire, corps du commentaire,
  rangée d'actions like/répondre) → devraient scaler sous Dynamic Type.
- **6 glyphes/labels dans des cadres de dimension fixe ou décoratifs surdimensionnés** → à figer
  (doctrine 82i pour les cadres fixes, 84i/86i pour les héros décoratifs ≥40pt).

## Corrections appliquées (1 fichier, 0 logique)

### 25/31 `.font(.system(size:))` → `MeeshyFont.relative(...)` (weight préservé)

- **Feuille « Vues »** (`viewerRow`) : bouton Fermer (16 bold), nom d'affichage (16 semibold), glyphe
  reshare (12 bold), heure (12), glyphe/texte de réponse (10/14), glyphe/emoji de réaction (10/14).
- **Overlay commentaires** : bouton « Voir N autres réponses » (chevron 9 bold + label 11 semibold),
  bandeau « Story expirée » (texte 11 semibold + glyphe `clock.badge.xmark` 11 semibold), les deux
  libellés de l'état vide (13 semibold / 11).
- **`StoryCommentRowView`** : nom d'auteur (12.5 semibold), séparateurs `·` (10 ×2), horodatage
  relatif (10), glyphe `translate` (9 medium), drapeau de langue (`isActive ? 12 : 10`), **corps du
  commentaire (13.5)**, glyphe/compteur de like (13 semibold / 11 semibold), glyphe/label Répondre
  (11 semibold / 10.5 semibold).

### 6/31 gardés FIXES & commentés (doctrine)

- **`play.circle.fill` 56pt** (l.148, indicateur de lecture centré sur la vidéo) — décoratif
  surdimensionné (doctrine 84i/86i). Déjà `accessibilityHidden`.
- **Héros `bubble.left.and.bubble.right` 28pt** de l'état vide (l.1449) — figé + **`accessibilityHidden(true)` ajouté** (lacune décorative comblée : les deux libellés portent le sens).
- **Monogramme d'avatar 13 bold** dans un cercle fixe 32×32 (l.1916, doctrine 82i) — nom d'auteur
  lisible par ailleurs dans `headerRow`.
- **2 glyphes du rail `StoryActionButton` 20 semibold** dans un cadre fixe 46×46 (l.2143/2149,
  doctrine 82i) — rail vertical compact style TikTok/IG.
- **Label du rail 10 semibold** dans une colonne de largeur fixe 56pt avec `minimumScaleFactor(0.7)`
  + `lineLimit(1)` (l.2169, doctrine 82i).

## Accessibilité

- **1 lacune décorative comblée** : `.accessibilityHidden(true)` sur le héros de l'état vide.
- `play.circle.fill` déjà masqué (inchangé). Les boutons du rail restent labellisés via `Text(label)`.
- Aucune restructuration VoiceOver risquée (pas de `.combine` spéculatif sans build) — scope limité
  au Dynamic Type + masquage décoratif.

## Périmètre / non-régression

- **1 seul fichier**, 0 logique, 0 mutation d'état, 0 clé i18n neuve, 0 test neuf. `import MeeshyUI`
  déjà présent (`MeeshyFont` résolu).
- Tests référençant ce fichier (`StoryViewerCommentReactionTests`, `StoryViewerScenePhasePauseGuardTests`)
  n'assertent que sur `StoryCommentRowView.legibleAuthorColor` (helper couleur) et le cycle
  scenePhase — **aucune assertion de police** → aucune régression.
- Palette inchangée (`legibleAuthorColor`, `MeeshyColors.error`, `.white.opacity(...)` volontaires sur
  fond de story) — 0 swap.

## Statut

**TERMINÉE** — `StoryViewerView+Content` Dynamic Type soldé (25/31 libellés → `relative`, 6 figés
commentés, 1 héros décoratif masqué). **Ne plus re-flagger cette surface.**

---

## Analyses corrigées & complètes (ne pas reproduire)

- `StoryViewerView+Content` — 25/31 `.font(.system(size:))` → `MeeshyFont.relative` (weight préservé) ;
  6 figés commentés = `play.circle.fill` 56 (déco ≥40) + héros état-vide 28 (+ `accessibilityHidden`)
  + monogramme 13 cercle 32×32 + 2 glyphes rail 20 cadre 46×46 + label rail 10 colonne fixe 56 ;
  a11y = 1 héros décoratif masqué ; palette 0 swap ; 1 fichier, 0 logique/0 i18n/0 test neuf.
  **SOLDÉ 162i.**
