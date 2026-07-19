# Plan — Itération 144i : `AddParticipantSheet` (VoiceOver-structure)

**Date** : 2026-07-19 · **Piste** : iOS (`i`) · **Base** : `main` HEAD (`efedb69e4`) ·
**Branche** : `claude/laughing-thompson-ich12b` · **Gate** : CI `iOS Tests`

## Objectif

Le pool de migration Dynamic Type (`.font(.system(size:))` → `MeeshyFont.relative`) est **tari** :
tous les sites restants sont des glyphes chrome/décoratifs gelés et annotés (doctrine 82i/84i/86i/87i).
On passe donc « state-of-the-art » : pass VoiceOver-structure sur `AddParticipantSheet` (feuille
« Ajouter un membre »), en étendant la doctrine 143i (avatar présentationnel = double lecture du nom).
0 logique, 0 fichier de test neuf.

## Étapes

1. **Avatar de `userRow`** : `MeeshyAvatar` (présentationnel, sans mood tap / menu) →
   `.accessibilityHidden(true)` + commentaire doctrine 143i. Supprime la double lecture du nom
   (avatar `"<nom>"` puis bloc combiné `"<nom>, @<pseudo>"`). ✅
2. **Squelette de chargement** : le `VStack` des 3 `searchSkeletonRow` shimmer →
   `.accessibilityElement(children: .ignore)` + `.accessibilityLabel("Recherche en cours")` — une
   seule annonce d'état de chargement au lieu de 3 arrêts vides. ✅

## Non-régression

- 1 fichier, 0 logique, 0 test neuf.
- 1 clé i18n inline neuve `participants.add.searching` (defaultValue only, cohérent avec les autres
  `participants.add.*` du fichier, non catalogués → aucune édition `.xcstrings`).
- Rendu visuel (UX voyante) strictement identique — modifiers additifs uniquement.
- Avatar de `userRow` sans action VoiceOver (pas de mood tap ni context menu) → le masquer ne retire
  aucune action ; les boutons `Ajouter` / badge `Membre` restent intacts.
- `AddParticipantSheet` n'est référencé par aucun test ; `searchResults` est `@State private` (non
  peuplable en test) → un smoke test `_ = view.body` ne couvrirait que l'état vide, pas `userRow`.

## Vérification

- `grep '.accessibilityHidden(true)'` sur `userRow` → présent sur `MeeshyAvatar`.
- `grep '.accessibilityElement(children: .ignore)'` → 1 occurrence (squelette).
- `grep 'participants.add.searching'` → 1 occurrence.
- Impossible de builder le simulateur iOS sur cet hôte Linux ; gate = CI `iOS Tests`
  (XcodeGen regenerate + build + suites).

## Statut

**TERMINÉE** — poussée sur `claude/laughing-thompson-ich12b`, PR à venir.
