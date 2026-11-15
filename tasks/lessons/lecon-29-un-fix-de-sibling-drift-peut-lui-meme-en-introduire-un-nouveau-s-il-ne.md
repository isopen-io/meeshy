## Leçon 29 — Un fix de sibling-drift peut lui-même en introduire un nouveau s'il ne couvre que les chemins terminaux qu'il possède (2026-07-05, itération 100, Vague 14 appels)

`a813b31` (gateway/calls, plus tôt le même jour) a ajouté `CallEventsHandler.clearQualityDegradedStreaks`
et l'a câblé sur les 3 chemins terminaux **que `CallEventsHandler` possède lui-même**
(`broadcastCallEnded`, disconnect-leave à 0 participant, disconnect-force-cleanup). Un **4e** chemin
terminal existe pour le même appel — `CallCleanupService.forceEndCall` (le tier GC cron 60s) — mais vit
dans une classe séparée sans référence à l'instance `CallEventsHandler`, donc n'a reçu ni l'ancien
bug (déjà documenté) ni son fix. Piège spécifique à ce cas : le fix a été écrit et testé en ne regardant
QUE les call-sites internes à la classe qu'on modifie déjà — la recherche de siblings s'est arrêtée à la
frontière de fichier au lieu de suivre "tous les chemins qui terminent un `CallSession`" (grep
`callSession.updateMany.*status` ou équivalent, à travers TOUT `services/gateway/src`, pas juste le
fichier en cours d'édition). Une classe séparée qui termine la même entité (ici via son propre GC/cron)
compte comme sibling au même titre qu'une méthode sœur dans le même fichier.

**Règle réutilisable** : quand on répare un sibling-drift ("chemin X était couvert, chemin Y ne l'était
pas"), avant de committer, lister EXHAUSTIVEMENT tous les chemins qui écrivent le même état terminal
sur la même entité — via un grep structurel sur le nom de la table/du champ concerné dans tout le
service, pas seulement dans le fichier qu'on est en train d'éditer — et vérifier explicitement que
chacun reçoit le fix, pas seulement ceux qui vivent dans la même classe. Un fix de sibling-drift qui
ne couvre que 3 des 4 chemins réels n'est qu'un sibling-drift déplacé, pas résolu.
