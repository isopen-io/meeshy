# Runbook — Activation du filtre langue WS (`SOCKET_LANG_FILTER`, 5.3)

## But
Réduire le payload `message:new` aux langues préférées de chaque device + l'original
(économie de bande passante, transparent pour le Prisme Linguistique). **OFF en prod
par défaut.** Rollback = repasser `false` + reload du gateway. Aucun impact données
(filtre runtime only).

## Activer en staging
1. Sur le gateway staging : `SOCKET_LANG_FILTER=true` dans l'env, reload du service.
2. Vérifier les logs debug `[lang-filter] payload reduced`
   (`fullBytes` / `filteredBytes` / `savedPct` / `languages` / `originalLanguage`).

## Mesurer
- Comparer `savedPct` moyen sur des conversations multi-traduites réelles.
- Cible attendue : réduction proportionnelle au nombre de langues écartées par device.

## Valider (critères PASS du plan)
- **Mono-langue** : un device dont les préférences = 1 langue reçoit son sous-ensemble
  + l'original (drapeaux réduits, tous interactifs).
- **Multi-device divergent** : 2 users aux langues différentes → chacun son sous-ensemble.
- **Prisme inchangé** : l'original s'affiche si pas de traduction préférée ; explorer une
  autre langue via tap drapeau déclenche `translation:request` (re-fetch on-demand).
- **B3 — changement de langue mid-session** : après un `PATCH /users/profile` qui change
  `systemLanguage`/`regionalLanguage`/`customDestinationLanguage`, le message suivant est
  filtré sur la **nouvelle** langue, sans reconnexion.

## Rollback
`SOCKET_LANG_FILTER=false` + reload. Instantané, sans migration.

## Hors scope (connu)
- **Offline delivery** : non filtré (payload complet enqueué). Le chemin principal
  `message:send` n'enqueue pas offline ; le drain manager est inactif (code mort
  pré-existant). À traiter séparément.
- **Anonymes** : toujours leur langue unique (`language`), pas de `resolvedLanguages`.
