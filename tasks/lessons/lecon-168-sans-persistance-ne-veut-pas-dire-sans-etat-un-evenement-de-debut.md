## Leçon 168 — « Sans persistance » ne veut pas dire « sans état » : un événement de DÉBUT sans fin est un bail perpétuel

`LocationHandler` s'ouvrait sur « Real-time only — no Prisma persistence », et en
tirait deux conclusions dont une seule était juste. Pas de table : correct, il n'y
en a pas au schéma. Pas d'état **en mémoire** non plus : c'est ce saut-là qui
coûtait cher. Le handler validait, diffusait, oubliait.

Or un partage de position est un **bail** : il a une date de fin annoncée
(`expiresAt`, jusqu'à 8 heures) et un titulaire dont la présence conditionne la
validité. Un serveur qui n'en garde rien ne peut faire aucune des trois choses
qu'un bail exige — le résilier quand le titulaire disparaît, le laisser expirer à
son terme, ou dire à un tiers qu'il existe. Il ne restait qu'un chemin : que le
titulaire vienne lui-même le résilier. Un chemin que l'arrêt forcé, le crash et la
perte de réseau ne prennent jamais — c'est-à-dire les trois façons ordinaires dont
une session mobile se termine.

**La règle** : tout événement `X-started` qui porte une durée ou un propriétaire
crée un état, que le serveur le range quelque part ou non. S'il ne le range pas,
l'état existe quand même — chez les clients, sans personne pour l'invalider. Le
choix n'est pas « avec ou sans état » mais « état côté serveur, ou état orphelin
côté clients ».

**Le signal de recherche** : chercher les paires `X-started` / `X-stopped` où le
`stopped` n'a qu'UN seul émetteur, et où cet émetteur est le geste explicite d'un
utilisateur. Puis demander les trois questions du bail : qui le résilie si le
titulaire meurt ? qui le fait expirer ? qui l'annonce à un arrivant ? Un `stopped`
à émetteur unique répond « personne » aux trois.

**Corollaire — le voisin qui a déjà raison est le meilleur gabarit.** Le même
codebase retracte la frappe sur `disconnecting` depuis longtemps
(`StatusHandler.handleSocketDisconnecting` → `typing:stop`). La position en direct
était le seul état éphémère par socket à ne pas l'avoir, et le correctif est le
même geste au même point d'accroche. Avant d'inventer une politique, chercher
l'état frère qui a déjà survécu à la question : sa forme est déjà validée en
production, et la copier rend le tout lisible d'un coup.

**Corollaire — l'absence d'état et la fin d'un état se ressemblent dans le
résultat et s'opposent dans ce qu'elles demandent.** Après un redémarrage de la
passerelle, le registre est vide alors que des partages tournent. Traiter « pas
d'entrée » comme « session terminée » — la lecture naïve — ferait mourir tous les
partages en cours à chaque déploiement. Une session **inconnue** doit passer ; seule
une session **connue et échue** doit être coupée. La même distinction que
`truncated` fait dans `/sync` entre « je n'ai pas pu lire » et « il n'y a rien à
lire », et elle se pose partout où un registre volatil sert d'autorité.

**Corollaire — un `leave` applicatif n'est pas un départ.** La symétrie tentait
d'étendre la retraction à `conversation:leave`, comme pour la frappe. Elle aurait
été fausse : côté client, `leave` signifie « j'ai quitté cet écran », pas « j'ai
quitté le groupe ». Retracter là aurait tué le partage en arrière-plan, qui est
précisément l'usage principal de la fonction. **Deux états éphémères qui partagent
un cycle de vie n'en partagent pas forcément tous les points d'accroche** : la
frappe n'a de sens que sur l'écran, la position en a hors de lui.
