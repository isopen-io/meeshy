---
"@meeshy/web": patch
---

Une page delta qui laisse du reste ne fait plus avancer le curseur iOS, et le web arrête d'escalader pour rien

`ConversationSyncEngine.deltaSyncCore` (SDK iOS) demandait `limit=500` à
`GET /conversations?updatedSince=`, que la route plafonne à 100 — puis avançait
`lastSyncTimestamp` au max des `updatedAt` REÇUS, sans jamais regarder si la page avait été
coupée. Le tri par `updatedAt` croissant (cycle 77) fait pointer le curseur sur les lignes
coupées dans le cas général, mais pas quand plus de 100 conversations partagent la MÊME
milliseconde : la borne serveur est stricte (`gt`), donc le débordement était enjambé
DÉFINITIVEMENT — jusqu'à la réconciliation complète, bornée à 1× par 24 h. Entre les deux, la
liste iOS affichait des compteurs de non-lus et des aperçus périmés sans aucun signal.

iOS lit désormais le `pagination.hasMore` de la réponse. Quand le serveur annonce du reste :
le curseur NE BOUGE PAS, puis `fullSync()` est enchaîné. L'ordre est le correctif — c'est
parce que le curseur est resté en arrière qu'une escalade échouée (offline, panne gateway)
laisse la fenêtre entière rejouable au prochain delta au lieu d'un trou permanent. La fusion
de la page reçue, elle, est conservée dans tous les cas.

Côté web, la même escalade se déclenchait sur `conversations.length >= DELTA_PAGE_LIMIT`.
`hasMore` est autoritaire sur une page delta — elle part toujours d'`offset=0`, ce qui fait
compter au serveur toutes les lignes de la même clause `updatedAt > since` — donc une fenêtre
de très exactement 100 conversations est COMPLÈTE. Le web relisait toutes ses pages chargées
pour rien dans ce cas ; il lit maintenant le même signal qu'iOS.
