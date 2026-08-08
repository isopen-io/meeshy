---
"@meeshy/gateway": patch
---

Le reset des préférences d'une conversation ne casse plus la monotonie de `version`

`DELETE /user-preferences/conversations/:id` diffusait un reset porteur de
`version = ligne.version + 1` **puis supprimait la ligne**. Le compteur vivant
sur la ligne, l'`upsert` suivant repartait à `version: 1` — en dessous du reset
que les autres appareils venaient d'enregistrer. Appliquant la règle documentée
`incoming.version <= local -> drop` (schema Prisma : « Monotonic version for
optimistic-concurrency resolution »), ils jetaient silencieusement ce premier
épinglage/sourdine/archivage post-reset, et tous les suivants avec lui, jusqu'à
un refetch complet sans rapport.

Le reset restaure désormais les colonnes de préférence à leurs valeurs par
défaut **en place**, en incrémentant `version` dans la même écriture atomique :
la séquence traverse le reset. `version` est un état de protocole, pas une
préférence utilisateur — un reset ne doit pas le rembobiner. Contrat REST
inchangé (P2025 → 404 sur une conversation sans ligne). `CONVERSATION_PREFERENCES_DEFAULTS`
gagne au passage `mentionsOnly` et `clearHistoryBefore`, qui manquaient à
l'instantané par défaut alors qu'ils font partie du payload diffusé.
