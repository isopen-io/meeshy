# Plan — Itération 168i : `ActiveSessionsView` VoiceOver

**Date** : 2026-07-19 · **Piste** : iOS (`i`) · **Base** : `main` HEAD (`efedb69`)
**Branche** : `claude/laughing-thompson-170gcd` · **Gate** : CI `iOS Tests`

## Objectif

Structurer la sortie VoiceOver de l'écran sensible « Sessions actives » : lire chaque session comme UN
énoncé cohérent au lieu de ~5 arrêts fragmentés, sans toucher la logique ni le visuel.

## Contexte essaim

Essaim iOS dense : 167i en vol (PR #2033/#2034), 165i (#2028), 156i `BubbleExpandableText` (#2001).
Numéro **168i** = strictement supérieur au plus haut en vol. `ActiveSessionsView` non touché par aucune PR
ouverte → 0 contention (vérifié `list_pull_requests`).

## Étapes

1. **Constat** : typographie déjà 100 % `MeeshyFont.relative` (1 seul `.system(size:16)` = glyphe borné
   32×32, gel 86i) ; rangée fragmentée en ~5 arrêts VoiceOver ; titre non `.isHeader`.
2. **GREEN** :
   - Envelopper icône + `VStack` textuel dans un `HStack` `.accessibilityElement(children: .combine)`.
   - `.accessibilityHidden(true)` sur le glyphe d'appareil (décoratif) + annotation gel 86i.
   - Bouton Révoquer laissé **sibling** (hors groupe) → reste actionnable/labellisé.
   - Titre d'écran `.accessibilityAddTraits(.isHeader)`.
3. **Test** : `ActiveSessionsViewAccessibilityTests` (source-level, 4 assertions), pattern
   `CallViewAccessibilityTests`.
4. **Vérif** : 0 changement visuel (spacing reproduit) ; `ActiveSessionsViewModelTests` inchangé ;
   grep `.system(size:` → 1 (glyphe figé annoté).
5. **Docs** : analyse + ce plan + pointeur `branch-tracking.md`.
6. **Commit + push** sur `claude/laughing-thompson-170gcd`. PR → gate CI `iOS Tests`.

## Hors périmètre

- `ActiveSessionsViewModel` (chargement/révocation) — non touché.
- Le glyphe d'appareil reste `.system(size:16)` figé (cadre fixe 32×32).

## Non-régression

1 vue + 1 test, 0 logique, 0 mutation d'état, 0 clé i18n neuve, 0 changement visuel.
