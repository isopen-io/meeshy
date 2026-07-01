# Itération 91i — Analyse UI/UX iOS · `AffiliateView`

**Date** : 2026-07-01
**Piste** : iOS (suffixe `i`)
**Surface** : `apps/ios/Meeshy/Features/Main/Views/AffiliateView.swift` (écran « Parrainage » — stats + liste des liens d'affiliation, copie/partage/suppression)
**Type** : Dynamic Type (a11y) + VoiceOver (labels manquants sur boutons d'action)
**Base** : `main` HEAD (`ae1d5434`)

## Contexte / continuité

`AffiliateView` figurait dans le **différé prioritaire 91i+** du pointeur iOS autoritaire
(`branch-tracking.md`) comme grande surface à polices figées (17 sites `.font(.system(size:))`,
0 `MeeshyFont.relative`). Surface **non prise** par les PRs iOS en vol au moment du run
(#1224 NewConversationView, #1226 DataExportView, #1228 FeedCommentsSheet, #1225 MagicLinkView) →
choix orthogonal, aucun conflit de fichier attendu.

## Diagnostic

### Typographie figée (Dynamic Type ignoré)
17 sites `.font(.system(size:))` verrouillaient la taille de police → l'écran ne réagissait pas
au réglage « Larger Text » d'iOS (Accessibilité). Tous sont soit du **texte de lecture**, soit des
**glyphes SF Symbol inline appariés** à un `Text` scalable dans la même carte/rangée.

### Lacunes VoiceOver
- Les **3 boutons d'action** de chaque rangée de token (`doc.on.doc` copier / `square.and.arrow.up`
  partager / `trash` supprimer) n'avaient **aucun `.accessibilityLabel`** → VoiceOver lisait
  « bouton » sans dire l'action (grave : 3 boutons ambigus côte à côte).
- Le bouton **`+` (créer un lien)** du header n'avait pas de label.
- Les **cartes de stats** (icône + valeur + libellé) et les **méta de token** (nom + clics + inscrits)
  étaient lues glyphe par glyphe au lieu d'un énoncé groupé.
- Le **titre de section** « MES LIENS » n'était pas exposé comme en-tête (rotor VoiceOver).

## Corrections appliquées

### Dynamic Type — 16/17 sites migrés
`.font(.system(size:, weight:, design:))` → `MeeshyFont.relative(size, weight:, design:)`
(weight **et** design `.rounded` préservés 1:1) sur : header (chevron retour, titre, bouton `+`),
3 cartes de stats (icône/valeur/libellé), en-tête de section (icône + libellé), état vide
(titre + sous-titre), rangée de token (nom, labels clics/inscrits, 3 glyphes d'action).

### 1/17 site gardé FIXE (documenté)
`link` **36pt** de l'état vide (hero décoratif) → laissé `.system(size: 36)` + commentaire
d'exception + `.accessibilityHidden(true)`. Doctrine 74i/86i : les grands glyphes ornementaux dont
le sens est porté par le libellé adjacent restent figés (scaler déséquilibrerait l'état vide) et
sont masqués de VoiceOver.

### VoiceOver — 6 traits ajoutés (0 clé i18n neuve)
- `.accessibilityLabel` sur les 3 boutons d'action de token, réutilisant les clés SSOT existantes
  `common.copyLink` / `common.share` / `common.delete` (aucune clé orpheline créée).
- `.accessibilityLabel` sur le bouton `+`, réutilisant `affiliate.create.title` (« Nouveau lien »,
  titre de la feuille qu'il ouvre).
- `.accessibilityElement(children: .combine)` sur chaque carte de stat + sur le bloc méta de token.
- `.accessibilityAddTraits(.isHeader)` sur le titre de section « MES LIENS ».

## Portée & vérification
- **1 fichier de production**, sweep présentation + traits déclaratifs.
- **0 logique modifiée, 0 clé i18n neuve, 0 test neuf** (parité doctrine 55i/71i/74i/83i/86i/87i/88i).
- Palette : rien à changer — déjà tokenisée (`Color(hex: accentColor)` accent déterministe de marque,
  `MeeshyColors.success`/`.error`, `theme.*`). Documenté hors-scope de ce sweep typographique.
- SwiftUI ne compile pas sous Linux → gate = CI `iOS Tests` (Xcode 26.1 compile + simu 18.2).

## Résultat
✅ Écran `AffiliateView` conforme Dynamic Type + VoiceOver. **NE PLUS re-flagger** sa typographie /
VoiceOver (soldé 91i) ni son hero `link` 36pt (décision design documentée).
