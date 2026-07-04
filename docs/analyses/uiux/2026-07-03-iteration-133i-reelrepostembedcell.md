# Itération 133i — Analyse UI/UX iOS : `ReelRepostEmbedCell`

**Date** : 2026-07-03
**Piste** : iOS (suffixe `i`).
**Surface** : `apps/ios/Meeshy/Features/Main/Views/ReelRepostEmbedCell.swift`
**Base** : `main` HEAD (`b6ba87ee`)
**Branche** : `claude/upbeat-euler-s5qysh`
**Gate** : CI `iOS Tests`

## Contexte

`ReelRepostEmbedCell` rend un POST de feed qui repartage un RÉEL comme une carte « post cité » compacte
(bande média courte de **hauteur fixe** `stripHeight = 116` + auteur original + caption + likes).
Surface **fraîche** : 3 `.font(.system(size:))`, 0 commentaire doctrine, 0 `relative`. **6 PR ouvertes
au démarrage — toutes calls/gateway/typing** (#1421 gateway stories, #1420/#1419/#1414/#1413/#1412 calls/
typing/bubble) → **aucune ne touche ce fichier** → **0 contention**. Numéro **133i** (132i =
`StatusBubbleController` mergé #1410).

## Constat (avant 133i)

**3 `.font(.system(size:))`** — tous des **glyphes décoratifs de la bande média**, bornés par le cadre de
hauteur fixe `stripHeight` (116pt), **sans texte adjacent** :
- `music.note` (30 semibold) : backdrop centré pour un réel audio-only / media-less ;
- `play.fill` (18 bold) : affordance de lecture centrale pour un réel vidéo ;
- `play.rectangle.on.rectangle.fill` (13 bold) : badge « logo Réel » coin haut-droit.

## Corrections appliquées (1 fichier, 0 logique)

- **3/3 glyphes FIGÉS** + commentaires doctrine **86i** : chaque glyphe est **borné par la bande média de
  hauteur fixe** (`.frame(height: stripHeight)`), sans texte adjacent avec lequel scaler — un glyphe
  décoratif dans une vignette de dimension fixe garde `.font(.system(size:))` (le scaler déséquilibrerait
  le glyphe dans une bande qui, elle, ne grandit pas). **Distinction avec 130i (`ReelFeedCard`)** : là le
  badge était sur un média plein-cadre `.padding`-driven (→ migré `relative`) ; ici la bande a une hauteur
  **fixe** (→ figé 86i).

Accessibilité déjà conforme → **intacte** : le badge `reelBadge` porte déjà `.accessibilityHidden(true)` ;
`music.note` + `play.fill` sont dans le `Button` de la carte qui porte `.accessibilityElement(children:
.ignore)` + `.accessibilityLabel(« Réel de … »)` → déjà aplatis (pas de `.accessibilityHidden` redondant à
ajouter). Palette (`Color(hex: authorColor)`, blanc sur média, `.ultraThinMaterial`) déjà conforme → non
touchée.

## Périmètre / non-régression

- **1 seul fichier**, 0 logique, 0 mutation d'état, 0 test neuf, 0 clé i18n neuve. `import MeeshyUI`
  déjà présent (inutilisé ici — édits `.font()` de gel uniquement). `Equatable` préservé.
- Les 2 tests référençant le fichier (`ReelRepostEmbedCellTests`, `ReelFeedAutoplayCoordinatorTests`)
  exercent les **helpers purs** (`reelVideoMedia` / `reelCellId`) et le coordinateur d'autoplay, **pas** les
  polices → aucune régression.

## Statut

**TERMINÉE** — `ReelRepostEmbedCell` : 3 glyphes décoratifs bornés par la bande média fixe **figés**
(commentés 86i), a11y déjà en place. Ne plus re-flagger ces 3 glyphes.

---

## Analyses corrigées & complètes (ne pas reproduire)

- `ReelRepostEmbedCell` — 3 glyphes décoratifs (`music.note`, `play.fill`, badge Réel) bornés par la bande
  média de hauteur fixe (116pt) **figés** commentés « doctrine 86i » ; a11y déjà en place (badge caché,
  carte `children:.ignore` labellisée). **SOLDÉ 133i.**
