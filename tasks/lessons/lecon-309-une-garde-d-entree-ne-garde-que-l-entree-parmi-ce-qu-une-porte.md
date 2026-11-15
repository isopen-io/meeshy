## Leçon 309 — une garde d'ENTRÉE ne garde que l'entrée : parmi ce qu'une porte vérifie, certaines propriétés décrivent une DURÉE (2026-08-28, cycle 131 bis)

**Contexte** : la porte d'entrée anonyme (`POST /anonymous/join/:linkId`) vérifie
NEUF propriétés du lien de partage avant de créer la ligne `Participant` — actif,
expiration, usages, concurrence, pays, langue, plage IP, compte requis, identité
requise. Neuf `if` consécutifs, rien qui les distingue les uns des autres.

Deux d'entre elles ne sont pas des propriétés d'ADMISSION mais de **DURÉE** :
`ConversationShareLink.isActive` et `expiresAt` décrivent l'état du lien à tout
instant, pas seulement au premier pas. **Rien ne les relisait après ce premier
pas** — ni le middleware REST, ni l'authentification socket, qui ne lisent tous
deux que `Participant.isActive`.

Conséquence : désactiver ou supprimer un lien de partage ne retirait RIEN à ses
invités déjà entrés. Ils gardaient leur socket dans `ROOMS.conversation(...)` —
chaque message, chaque réaction, chaque frappe en temps réel — leur droit
d'écriture, leur place dans l'appel en cours et leur partage de position vive,
indéfiniment.

> Les propriétés de DURÉE n'ont de sens que si quelque chose les relit, et ce
> quelque chose ne s'écrit jamais au moment où l'on écrit la porte : à ce
> moment-là, on est en train de répondre à « qui a le droit d'entrer ? ». Devant
> toute liste de vérifications d'admission, demander laquelle décrit l'INSTANT
> et laquelle décrit un ÉTAT — puis, pour chaque état, **qui le relit**.

### La description OpenAPI est une AFFIRMATION

C'est elle qui a trouvé le site, et c'est la partie transposable. Les deux
routes qui retirent un lien déclarent la règle dans leur propre contrat public :

- `PATCH /links/:linkId/toggle` — « the link becomes inaccessible to new **and
  existing** anonymous users »
- `DELETE /links/:linkId` — « will **immediately invalidate all anonymous
  participants** using this link »

Derrière la première moitié de chaque phrase, du code. Derrière la seconde,
rien. Le dépôt sait déjà qu'un commentaire qui énonce une contrainte est une
affirmation (cycle 94), qu'un compte est une affirmation (cycle 93) et qu'un tri
en est une (cycle 86 bis). **Une description OpenAPI l'est aussi, et elle est
plus chère** : elle est publiée, donc lue par des intégrateurs, donc c'est la
seule forme de commentaire du dépôt qui puisse tromper quelqu'un d'extérieur.

### Une règle écrite sur UNE route arbitre selon la porte empruntée

La règle n'était pas à inventer : `POST /anonymous/session/refresh` la porte
depuis toujours, avec la sémantique fail-closed voulue (`!shareLink ⇒ 410`,
`!isActive ⇒ 410`, `expiresAt < now ⇒ 410`). Une seule route sur trois portes.

> **Le sort d'un invité dépendait donc de si son client appelle, ou non, le
> rafraîchissement de session.** Ce n'est pas « la règle n'existe pas », c'est
> pire : la même question recevait deux réponses selon le chemin, et la réponse
> stricte était celle qu'on rencontre le moins souvent. C'est la leçon 307 vue
> d'un autre côté — une règle vaut là où quelqu'un l'a récitée — appliquée non
> plus à un énoncé de `CLAUDE.md` mais à une route qui l'implémente correctement
> et solitairement.

### Deux décisions produit voisines, et l'une a décidé la CONCEPTION

Le correctif naturel — relire le lien à chaque requête anonyme, fail-closed dans
les deux portes d'authentification — aurait couvert l'expiration en prime. Il a
été écarté, et pas pour son coût :

1. `routes/anonymous.ts` FIGE les sept droits à l'entrée et l'assume par écrit
   (« on entre sous les conditions du MOMENT »). `isActive`/`expiresAt` ne sont
   pas des droits — mais la frontière méritait d'être instruite avant d'être
   franchie.
2. `ban.ts` désactive le lien du banni et dit pourquoi il s'arrête là : « Ce qui
   est fermé, c'est la PORTE, pas la salle ». Une garde fail-closed dans les
   portes d'authentification aurait, comme effet de bord, évincé **tous** les
   invités d'un lien fermé par un bannissement — cassant une décision produit
   écrite, dans un lot qui parle d'autre chose.

D'où une révocation qui est une **écriture au moment du geste**
(`Participant.isActive = false`), que les portes existantes honorent déjà, plutôt
qu'une garde de lecture. **Une décision produit écrite dans un commentaire est
une contrainte de conception**, pas un contexte : lire les voisins d'une garde
avant de choisir sa forme change la forme.

### La cinquième famille de fin d'appartenance retire une PORTE

`endConversationMembership` énumère quatre chemins qui mettent fin à une
appartenance — quitter, être banni, être retiré, effacer pour soi. **Les quatre
retirent une PERSONNE.** La cinquième retire une porte, et avec elle tous ceux
qui sont entrés par là ; elle ne pouvait pas apparaître dans une énumération qui
cherchait des verbes appliqués à quelqu'un.

C'est la leçon 261 dans sa forme habituelle (« une énumération porte deux
affirmations, et la seconde n'est presque jamais vérifiée ») avec le discriminant
qui la rend trouvable : **demander si la règle s'applique à un autre TYPE DE
SUJET**, pas seulement à un autre site. Ici le sujet passe du singulier au
pluriel, et l'unité de révocation est la jumelle PLURIELLE du point de
convergence — elle l'appelle plutôt que de recopier ses trois gestes.

Détail : `tasks/realtime-sync-audit-2026-08-28-cycle131-bis.md`, issues #4194
(livrée) et #4195 (l'expiration, qui n'est le geste de personne).
