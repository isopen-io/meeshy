# Iteration 185i — CreateShareLinkView : pluralisation native i18n (`inflect: true`)

**Date** : 2026-07-20
**Écran** : `apps/ios/Meeshy/Features/Main/Views/CreateShareLinkView.swift` (sheet de création
d'un lien de partage — section « Limites » → toggle « Limiter les utilisations »).
**Suffixe** : `i` (piste iOS).
**Numéro** : 185i, choisi strictement > plus haut en vol (184i `StatusComposerView` #2135).

## Contexte

`CreateShareLinkView` était un des écrans **explicitement différés** par le pointeur autoritaire
178i (candidats 179i+ : `CreateShareLinkView`, `AudioFullscreenView`, `FeedCommentsSheet`,
`ReelAudioBackdrop`). Aucune analyse UI/UX n'existait pour cet écran (grep `createsharelink` /
`share.link.create` sur `docs/analyses/uiux/` = 0). Aucune PR de l'essaim en vol (#2100→#2135) ne
touche ce fichier → 0 contention.

L'écran est par ailleurs **déjà très propre** : 100 % des chaînes passent par `String(localized:)`
avec `defaultValue`, les couleurs sont des tokens `MeeshyColors.*`, le picker de conversation
utilise `AdaptiveContentUnavailableView` (composant natif SSOT), le picker d'expiration est un
`Picker(.menu)` natif, et le `Stepper` natif gère l'incrément. **Un seul déficit réel** subsistait.

## Constat (1 déficit réel)

### Pluralisation française codée en dur dans une chaîne interpolée (viol. i18n)

Ligne 255, le libellé dynamique du nombre max d'utilisations :

```swift
Text(String(localized: "share.link.create.max_uses",
     defaultValue: "\(maxUsesValue) utilisation\(maxUsesValue > 1 ? "s" : "") maximum",
     bundle: .main))
```

Le suffixe pluriel `\(maxUsesValue > 1 ? "s" : "")` **grave la règle morphologique française**
(ajout d'un « s » au-delà de 1) **directement dans la valeur interpolée**. Conséquences :

1. **Intraduisible** : la clé `share.link.create.max_uses` porte une valeur dont la structure
   plurielle est spécifiquement française. Un traducteur d'une langue à règles plurielles
   différentes (russe : 3 formes ; arabe : 6 formes ; polonais : 3 formes) ne peut pas exprimer la
   bonne agrégation nombre↔nom — la clé n'a même pas de forme pluralisable exploitable.
2. **Faux même en français** pour le cas `0` : la règle française met le nom au singulier pour 0
   (« 0 utilisation »), or le ternaire `> 1` produit bien « utilisation » pour 0 — correct par
   chance ici, mais l'idiome reste fragile et non généralisable.
3. **Incohérence interne** : le codebase a déjà adopté l'idiome natif Apple d'accord grammatical
   automatique en **iteration 176i** (`LoadMoreRepliesCell.labelText` :
   `"View ^[\(remaining) more reply](inflect: true)"`). Cette ligne était le **dernier** site du
   fichier à utiliser l'anti-pattern `? "s" : ""` (grep post-fix = 0).

## Fix (176i idiom, 0 changement visuel FR)

Adoption de l'**accord grammatical automatique de Foundation** (`inflect: true`), moteur
locale-aware qui pluralise le nom en fonction du nombre selon les règles de CHAQUE langue :

```swift
Text(String(localized: "share.link.create.max_uses",
     defaultValue: "^[\(maxUsesValue) utilisation](inflect: true) maximum",
     bundle: .main))
```

- Le mot `utilisation` est placé dans le balisage `^[…](inflect: true)` → Foundation l'accorde en
  nombre (« 1 utilisation maximum », « 5 utilisations maximum ») sans ternaire codé en dur.
- « maximum » reste **hors** du balisage (invariant dans cet usage adjectival) → strictement le
  même rendu français qu'avant (le ternaire ne touchait que « utilisation »).
- La clé devient enfin **pluralisable par les traducteurs** dans leur propre morphologie.

**Portée** : 1 fichier, 1 ligne, 0 logique, 0 clé i18n neuve (clé code-only, absente des 3
`.xcstrings` → 0 édit catalogue), 0 test neuf. Aucun test ne référence la vue ni la clé
(grep `MeeshyTests/` = 0). Gate = CI `iOS Tests` (build iOS non runnable en local Linux ;
`inflect:` est du texte parsé au runtime → 0 risque de compile).

## Différé (déficit mineur, non retenu 185i)

- **Label du `Stepper`** (l. 279-284) : `Text("\(maxUsesValue)")` (gros nombre rounded bold) +
  `Text("utilisations")` (footnote) affichés côte à côte → « 1 utilisations » pour la valeur 1.
  **Non corrigé à dessein** : c'est un traitement typographique **deux étages** délibéré (valeur
  proéminente + unité discrète, convention de stepper type « items »). Y appliquer `inflect`
  fusionnerait les deux `Text` et détruirait la hiérarchie visuelle. À traiter séparément si une
  refonte du bloc est décidée, pas dans ce fix chirurgical.

## Statut

- [x] Constat pluralisation codée en dur (l. 255) → **RÉSOLU** via `inflect: true` (176i idiom).
- [ ] Différé : label deux-étages du Stepper (typographie délibérée, hors scope).

**⚠️ NE PLUS re-flagger** `CreateShareLinkView` pour la pluralisation : le dernier `? "s" : ""` du
fichier est soldé 185i. L'écran est par ailleurs déjà i18n-complet, tokens-couleur-complet et
natif (picker menu, ContentUnavailable, Stepper).
