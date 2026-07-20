# Plan — Itération 145i : VoiceOver des jauges du `ConversationDashboardView`

**Date** : 2026-07-16 · **Piste** : iOS (`i`) · **Base** : `main` HEAD (`0cf3b1c`)
**Branche** : `claude/laughing-thompson-9mksck` · **Gate** : CI `iOS Tests`

## Objectif
Donner une sémantique VoiceOver aux jauges de données du tableau de bord de conversation, qui
exposaient des nombres nus sans contexte (fichier sans aucun modificateur d'accessibilité).

## Étapes
1. [x] Audit : `ConversationDashboardView.swift` — 0 `accessibility*`, Dynamic Type déjà soldé
   (exceptions documentées). Axe restant = VoiceOver.
2. [x] `StatRing` : `.accessibilityElement(children: .ignore)` + `.accessibilityLabel(label)` +
   `.accessibilityValue("\(value)")` (valeur brute, libellé non capitalisé) → couvre les 7 bagues.
3. [x] Jauge de santé `ArcGauge` : regrouper `ArcGauge` + libellé « Santé » en un élément
   (`children: .ignore` + `accessibilityLabel(dashboard.health)` + `accessibilityValue("\(health)")`).
4. [x] Test source-level `ConversationDashboardViewAccessibilityTests` (pattern
   `WebRTCVideoViewAccessibilityTests`).
5. [x] Analyse + plan + tracking à jour.
6. [ ] Commit + push `claude/laughing-thompson-9mksck`.
7. [ ] PR + gate CI `iOS Tests`.

## Contraintes respectées
- 0 clé i18n neuve (libellés `dashboard.stat.*` / `dashboard.health` réutilisés).
- 0 logique, 0 changement visuel, 0 régression Dynamic Type (exceptions figées intactes).
- 0 contention avec les PR 140i–144i en vol.

## Vérification
- Environnement web : pas de simulateur iOS → build/tests exécutés par la CI `iOS Tests`.
- Garde local : substrings assertés confirmés présents dans la source (script python), fenêtres de
  recherche des tests dimensionnées sur les distances réelles (StatRing 2411 < 2600 ; ArcGauge 1212 < 1400).
