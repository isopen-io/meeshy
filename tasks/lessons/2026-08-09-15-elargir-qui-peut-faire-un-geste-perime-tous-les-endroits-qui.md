## 2026-08-09 (15) — Élargir QUI peut faire un geste périme tous les endroits qui identifiaient l'acteur par l'objet

**Contexte** — Cycle 37. Les cycles 33/34 ont unifié l'admission à l'édition et, ce faisant, **élargi**
la population des éditeurs : `admitMessageEdit` rend `asModerator: true` pour un éditeur non-auteur.
Le changement était volontaire, testé, documenté. Ce qu'il a cassé se trouvait ailleurs : la file de
rejeu hors ligne du handler socket excluait l'acteur en passant `message.senderId` — le
`Participant.id` de l'**auteur**. Tant que seul l'auteur peut éditer, auteur et acteur sont la même
personne et le code est juste. Après l'élargissement, la personne exclue devient **la cible**, et
l'auteur hors ligne n'apprend jamais que son message a été modéré.

**La règle** — un changement de permission n'est pas terminé quand la garde est unifiée. Élargir QUI
peut faire un geste invalide **toute identité dérivée de l'objet plutôt que du contexte
d'authentification**. Après avoir élargi une admission, chercher les endroits qui écrivent
l'équivalent de `message.senderId`, `post.authorId`, `conversation.createdBy` là où un `userId` de
requête est attendu : chacun était correct par coïncidence, et ne l'est plus.

**Pourquoi ça survit à la revue.** Trois choses se sont additionnées.

1. **Le nom du paramètre validait le geste.** La signature était positionnelle et le paramètre
   s'appelait `senderParticipantId` : un nom qui décrit la valeur que l'appelant a sous la main, pas
   le rôle que la fonction en fait (exclure l'acteur). Un appelant qui cherche quoi passer trouve
   `message.senderId`, et le nom du paramètre le confirme au lieu de le questionner. Corollaire de la
   leçon du 2026-08-09 (12) sur positionnel-vs-objet : **nommer un paramètre d'après son RÔLE, jamais
   d'après la valeur qu'on s'attend à y voir passer.**
2. **La docstring affirmait la règle d'AVANT.** L'en-tête du handler disait encore « only the message
   author can edit their own message ». C'est elle qui rendait `message.senderId` cohérent au
   relecteur : si seul l'auteur édite, l'auteur EST l'acteur. Une garde qu'on déplace dans une unité
   partagée laisse derrière elle des docstrings qui décrivent l'ancienne règle — les mettre à jour
   fait partie du déplacement, pas de la finition.
3. **Le jumeau portait déjà le correctif, sans test.** `handleMessageDelete`, quinze lignes plus bas
   dans le même fichier, écrit « Skip the DELETER, not the author » et explique pourquoi. Le
   raisonnement était formulé, exact, et à portée de regard — mais **aucun test ne le tenait**, donc
   rien ne le reliait à son frère. Un correctif sans test ne protège que la ligne qu'il touche ; le
   test, lui, se cherche par grep et fait remonter le jumeau. Corollaire opérationnel : **quand on
   corrige un chemin dont il existe un jumeau évident (edit/delete, create/update, socket/REST),
   écrire le test des DEUX côtés — celui du jumeau déjà correct est la seule chose qui le fera
   apparaître au prochain audit.**

**Corollaire sur les tests — une exclusion à deux mécanismes se teste en désarmant l'autre.** Ici
l'acteur est écarté deux fois : par son identité, et par sa présence (`connectedUsers.has`). Un
éditeur qui parle par socket est connecté, donc la présence l'écartait déjà : le mécanisme cassé
n'avait plus aucun effet observable sur lui. Un test qui laisse l'acteur dans la carte de présence
passe au vert avec ou sans le correctif. Il faut retirer l'acteur de `connectedUsers` — état
irréaliste en production, seul état où la question posée est celle qu'on mesure.
