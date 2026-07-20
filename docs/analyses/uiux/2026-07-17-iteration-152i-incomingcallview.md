# Itération 152i — Analyse UI/UX iOS : `IncomingCallView`

**Date** : 2026-07-17
**Piste** : iOS (suffixe `i`).
**Surface** : `apps/ios/Meeshy/Features/Main/Views/IncomingCallView.swift`
**Base** : `main` HEAD (`dda190e`)
**Branche** : `claude/laughing-thompson-ir2m79`
**Gate** : CI `iOS Tests`

## Contexte

`IncomingCallView` est l'écran d'appel entrant (plein écran, rendu par `CallView` quand un appel arrive) :
anneau pulsant décoratif + avatar (initiale), nom de l'appelant, libellé de type d'appel (audio/vidéo),
badge de type, et les deux actions primaires Accepter / Refuser en Liquid Glass proéminent. Surface
**fraîche** : aucun doc d'analyse antérieur, **0 PR ouverte** ne la touche (l'essaim 140i→151i cible
d'autres vues : `ThemedBackButton`, `MyStoriesView`, `EditProfileView`…). Numéro **152i** (strictement >
151i `EditProfileView` #1988, le plus haut en vol).

## Constat (avant 152i)

**3 `.font(.system(size:))`** — **tous des cas de gel** (glyphes bornés par un conteneur de dimension
fixe) :
- initiale d'avatar `Text(initial)` (44 bold rounded) — bornée par le **cercle d'avatar fixe 110×110** ;
  décorative (déjà aplatie par le `.accessibilityHidden(true)` du ring parent) ;
- glyphe `phone.down.fill` (28 medium) — borné par le **cercle de bouton fixe 70×70** (Refuser) ;
- glyphe `video.fill`/`phone.fill` (28 medium) — borné par le **cercle de bouton fixe 70×70** (Accepter).

**Tous les vrais libellés texte utilisent déjà des polices sémantiques scalables** (Dynamic Type natif),
donc **aucune migration `relative` requise** :
- nom de l'appelant → `.font(.system(.title, design: .rounded).weight(.semibold))` (text style `.title`) ;
- libellé type d'appel → `.font(.callout.weight(.medium))` ;
- libellés des boutons Accepter/Refuser → `.font(.caption2.weight(.medium))`.

**Code mort détecté** : `private var theme: ThemeManager { ThemeManager.shared }` — déclaré mais **jamais
utilisé** dans le corps (la vue pose délibérément du `.white` fixe sur le fond sombre fixe de `CallView`,
cf. commentaire ligne 35 : `theme.textPrimary` virerait au foncé en Light). Le symbole n'apparaissait plus
que dans un commentaire explicatif.

**Accessibilité déjà conforme** (audits P1-16 / P2-iOS-9 présents) → non touchée :
- anneau + avatar décoratifs → `.accessibilityHidden(true)` ;
- annonce `.screenChanged` sur `onAppear` (« <type d'appel>, <nom> ») ;
- boutons Accepter/Refuser → `.accessibilityLabel` + `.accessibilityHint` ;
- `reduceMotion` respecté (animations infinies coupées).

**Palette déjà tokenisée** (`MeeshyColors.success`/`error`/`indigo400`/`indigo500`) + `.white` fixe
**intentionnel** (fond sombre fixe de `CallView`) → 0 swap.

## Corrections appliquées (1 fichier, 0 logique)

- **Suppression du code mort** : retrait de la propriété calculée inutilisée `theme` (le corps n'y référait
  plus ; le commentaire explicatif ligne 35 reste valable — il documente *pourquoi* on garde du `.white`
  fixe plutôt que `theme.textPrimary`).
- **3/3 glyphes FIGÉS** + commentaires doctrine **82i** :
  - initiale d'avatar → 82i (bornée par le cercle fixe 110×110) + note « décorative, déjà aplatie par le
    ring parent `.accessibilityHidden` » ;
  - `phone.down.fill` (Refuser) → 82i (borné par le cercle de bouton fixe 70×70 ; le `Button` porte déjà
    son `.accessibilityLabel`/`.accessibilityHint`) ;
  - `video.fill`/`phone.fill` (Accepter) → 82i (idem, cercle de bouton fixe 70×70).

Un glyphe borné par un conteneur de dimension fixe garde `.font(.system(size:))` — le scaler déborderait du
cercle qui, lui, ne grandit pas. **Aucune migration `relative`** : itération d'**annotation de gel + nettoyage**
(parité 137i `ConversationLockSheet` ; pas d'`import MeeshyUI` neuf requis, déjà présent).

## Périmètre / non-régression

- **1 seul fichier**, 0 logique, 0 mutation d'état, 0 test neuf, 0 clé i18n neuve, 0 swap palette.
- Suppression `theme` = sûre : le symbole n'était référencé que dans un commentaire (0 usage compilé) →
  aucune régression de compilation possible.
- Gate = CI `iOS Tests` (compile Xcode 26.1.1 / run simu 18.2).

## NE PAS re-flagger (soldé 152i)

`IncomingCallView` : Dynamic Type **audité et soldé**. Les 3 `.font(.system(size:))` sont **figés à dessein**
(glyphes bornés par conteneurs fixes 110×110 / 70×70) et commentés doctrine 82i — **ne pas les migrer en
`relative`**. Les libellés texte sont déjà en polices sémantiques scalables. Palette tokenisée + `.white`
fixe intentionnel. Ne pas ré-introduire une propriété `theme` (code mort supprimé).
