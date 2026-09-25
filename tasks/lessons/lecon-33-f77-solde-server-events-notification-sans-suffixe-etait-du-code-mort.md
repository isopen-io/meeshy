## Leçon 33 — F77 soldé : `SERVER_EVENTS.NOTIFICATION` (sans suffixe) était du code mort en miroir des deux côtés (gateway émetteurs + web listener), et masquait un vrai bug d'import Prisma qui cassait 26 suites (2026-07-05, itération 106)

**Contexte** : `tasks/socketio-events-cleanup.md` item #4 demandait un audit de
`SERVER_EVENTS.NOTIFICATION` (sans `:action`, à ne pas confondre avec `NOTIFICATION_NEW`) pour
décider deprecate/rename/remove. Grep des émetteurs réels : `MeeshySocketIOHandler.sendNotificationToUser()`
(définie, jamais appelée par aucun caller) et `SocketNotificationService.emitNotification()` (classe
jamais instanciée hors de son propre fichier de test — toute diffusion réelle de notifications passe
par `NotificationService` qui émet directement sur `this.io`). Le seul "consommateur" restant était
un listener web `notification-socketio.singleton.ts` commenté "Legacy support" — mais comme les deux
émetteurs étaient déjà morts, ce n'était pas un vrai chemin de compat, juste un miroir de code mort
côté client (iOS avait déjà indépendamment choisi de ne pas s'y abonner, commentaire à l'appui).
Classe de bug adjacente à celle de la Leçon 28/#57/#62/#67 (chemins jumeaux qui divergent) mais ici
les DEUX jumeaux étaient morts simultanément plutôt qu'un vivant/un mort.

**Fix** : suppression complète (constante + entrée `ServerToClientEvents`, méthode + import
`SERVER_EVENTS` devenu inutile sur `MeeshySocketIOHandler`, classe `SocketNotificationService` entière
+ son export, listener + tests web). Le principe CLAUDE.md « si tu es certain que c'est inutilisé,
supprime complètement, ne renomme pas en `_unused` » s'applique : pas de période de dépréciation
nécessaire puisqu'aucun code vivant n'émettait ni ne dépendait de cet event.

**Trouvaille annexe** : en lançant la suite complète gateway pour vérifier l'absence de régression,
26 suites échouaient à la compilation avec `TS2305: Module '"@prisma/client"' has no exported member
'PrismaClient'` — documenté dans plusieurs itérations précédentes comme "bruit préexistant non lié"
(ex. Leçon 30/F72) mais jamais élucidé. Cause réelle : `schema.prisma` ne déclare qu'UN seul generator
avec `output = "./client"` (donc `@meeshy/shared/prisma/client`) — le package `@prisma/client` par
défaut n'a jamais de client généré à cet emplacement dans ce repo. Trois fichiers
(`SequenceService.ts`, `__tests__/helpers/consent-test-helper.ts`, `migrations/migrate-from-legacy.ts`)
importaient `PrismaClient` depuis `@prisma/client` au lieu de `@meeshy/shared/prisma/client` (convention
suivie partout ailleurs dans `services/gateway/src`). Corrigé : alignement des 3 imports, suite complète
508/508 (contre 482/508 + 26 échecs de compilation avant).

**Règle réutilisable** : un item de backlog "à élucider" ne doit pas rester en l'état à chaque
itération — l'audit demandé (`grep` des émetteurs réels) est souvent rapide et donne une réponse
définitive (ici : mort des deux côtés → suppression, pas juste un renommage cosmétique). Et une erreur
de compilation répétée dans plusieurs comptes-rendus d'itérations sous l'étiquette "bruit préexistant,
non lié" mérite d'être élucidée au moins une fois plutôt que reconduite indéfiniment — le fait que ~26
suites échouent à charger n'est jamais vraiment "sans rapport", même quand isolé du diff de la session
en cours ; ici la cause était un import cassé trivial à corriger, pas un problème d'environnement.
