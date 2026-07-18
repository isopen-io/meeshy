# Plan Itération 165i — `ActiveSessionsView` (VoiceOver security screen)

**Date** : 2026-07-18 · **Piste** : iOS (`i`) · **Branche** : `claude/laughing-thompson-23qanh`
**Base** : `main` HEAD `155251a` · **Gate** : CI `iOS Tests`

## Objectif

Combler les trous VoiceOver de l'écran de sécurité `ActiveSessionsView` (liste des sessions actives),
sans toucher au layout ni à la logique de révocation. Dynamic Type déjà conforme (les `Text` sont
`MeeshyFont.relative`).

## Étapes

1. [x] Resync sur `main` HEAD (`git checkout -B claude/laughing-thompson-23qanh origin/main`).
2. [x] Vérifier contention : `list_pull_requests` — aucune PR ne touche `ActiveSessionsView` ; numéro
   165i > plus haut en vol (164i).
3. [x] Glyphe d'appareil : figer + commenter (doctrine 86i) + `.accessibilityHidden(true)`.
4. [x] `.accessibilityElement(children: .combine)` sur le `VStack` d'infos de session.
5. [x] Libellé de révocation spécifique à l'appareil (`sessions.revoke.a11y`).
6. [x] Libellé de l'état de chargement (`sessions.loading.a11y`).
7. [x] Docs analyse + plan.
8. [ ] Commit + push branche.

## Contraintes

- 1 fichier, 0 logique, 0 test neuf, 2 clés i18n neuves suffixées `.a11y` (code-only via `defaultValue`).
- Pas de Xcode local (env Linux) → validation par revue statique ; gate CI `iOS Tests`.

## Suivi de synchronisation

| Champ | Valeur |
|---|---|
| Dernier commit main synchronisé | `155251a` |
| Branche source | `origin/main` |
| Branche de travail | `claude/laughing-thompson-23qanh` |
| Itération | 165i |
| PR mergée | — (à ouvrir si demandé) |
| Statut synchro | resync propre depuis `main` |
