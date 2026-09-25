## Leçon 234 — compter les deux extrémités d'un événement ne suffit pas : demander où il est REGARDÉ (2026-08-18, routine messagerie, cycle 66)

La Leçon 233 laissait une méthode : « pour chaque nom de room ou d'événement,
compter ses deux extrémités ; une extrémité à zéro est du code mort ou un
contrat non honoré ». Passée sur les douze `eventType` de la file de livraison
hors ligne, elle rend **zéro défaut** — les deux bouts existent partout. Passée
sur `user:status`, elle rend zéro défaut aussi : un émetteur, un écouteur iOS qui
alimente `PresenceManager`.

Et pourtant l'événement n'arrivait pas.

**Parce que compter les extrémités du CODE ne dit rien de leur rendez-vous.** Une
room est un rendez-vous entre un émetteur et un ÉCRAN. `user:status` était
adressé aux rooms `conversation:<id>` ; or la pastille de présence se regarde
très majoritairement HORS du fil — liste de conversations, écrans de contacts,
en-têtes. L'émetteur et l'écouteur existaient tous les deux, dans deux endroits
qui ne se croisaient pas.

> La question qui trouve ce que le comptage rate : **où ce signal est-il REGARDÉ,
> et est-ce là qu'il est adressé ?** Un événement dont l'écran consommateur n'est
> pas celui qui a fait joindre la room est perdu, quel que soit le nombre de ses
> extrémités.

### Le mécanisme : refermer une vue démonte une adresse

Ce qui transformait l'écart en perte est un geste que rien ne présente comme
destructeur. `AuthHandler` joint `conversation:<id>` à la connexion **pour
atteindre le participant** ; le client la quitte en refermant le fil
(`ConversationSocketHandler.deinit` → `conversation:leave` → `socket.leave`) pour
dire « je ne regarde plus ce fil ». Une room portait donc DEUX sens — « sockets
des participants » et « sockets qui regardent » — et le second démontait le
premier.

C'est la Leçon 233 (« demander ce qu'un état DÉSACTIVE en aval ») appliquée non
pas à un drapeau mais à une APPARTENANCE. À généraliser : avant d'autoriser un
client à quitter une room, énumérer tout ce qui adresse cette room — pas ce que
le client croit y recevoir.

### Le vrai test de gravité : qu'est-ce qui RECONVERGE ?

Un signal manqué n'est un défaut que si rien ne le rattrape. Les trois candidats
ont dû être instruits un par un, et c'est ce qui a fait passer le dossier de
« cosmétique » à « livrable » :

1. `user:status` ne marque que des TRANSITIONS — un pair déjà en ligne n'émettra
   plus rien ;
2. `presence:snapshot`, le seul autre porteur, n'est envoyé qu'à
   l'authentification ;
3. iOS ne SONDE jamais la présence — son minuteur de 30 s ne fait que recalculer
   la décroissance 1/3/5 min depuis `lastActiveAt`.

D'où un symptôme plus dur que « une pastille figée » : **le pair ne se rallume
jamais**, sa décroissance locale l'ayant éteint pendant que la transition qui
l'aurait rallumé n'avait plus d'adresse. Vérifier la reconvergence AVANT de
classer un signal manqué, dans les deux sens : elle décide de la gravité, et une
décroissance côté client transforme un signal manqué en état FAUX, pas en état
vieux.

### Le correctif qui ne retire rien : « purement additif » est une propriété qui se pose exprès

Élargir une audience est le genre de correctif qui casse par ce qu'il ENLÈVE.
Garder les rooms de conversation en TÊTE de chaîne et n'ajouter que les rooms
personnelles rend le changement additif par construction : même population
atteinte, seule l'adresse change, aucun destinataire d'aujourd'hui retiré.

Le témoin de cette propriété n'est pas un nouveau test — c'est que les **quatre
témoins d'audience existants sont restés verts sans être touchés**. Un correctif
d'élargissement qui fait tomber les témoins d'audience existants est un
correctif qui retire des destinataires : le vert des anciens témoins est
l'information, pas la formalité.

### L'erreur de méthode du cycle : grepper une chaîne dans un dépôt qui interdit les chaînes

Le premier balayage a conclu « défaut propre à iOS, le web n'émet pas
`conversation:leave` ». Faux. La recherche portait sur la CHAÎNE littérale, que
le web n'écrit nulle part — il passe par `CLIENT_EVENTS.CONVERSATION_LEAVE`,
comme la convention du dépôt l'exige (`socketio-events.ts` source de vérité). La
conclusion inverse a tenu presque jusqu'au commit, et elle aurait fait livrer un
correctif juste avec une portée fausse dans sa documentation.

> **Chercher un nom d'événement par sa chaîne dans un dépôt qui interdit les
> chaînes brutes revient à chercher exactement ce que la convention a
> supprimé** — la recherche ne rend alors que les VIOLATIONS de la convention, et
> son silence se lit à l'envers : « personne ne le fait » au lieu de « tout le
> monde le fait correctement ». Grepper le SYMBOLE (`CONVERSATION_LEAVE`), jamais
> sa valeur ; et quand une recherche rend zéro, se demander d'abord si la
> convention du dépôt ne vient pas d'être interrogée par sa forme interdite.

Corollaire sur la gravité, trouvé en réparant l'erreur : les deux clients
quittaient bien la room, mais seul le web possède un filet REST
(`use-user-status-realtime.ts` resynchronise `GET /users/presence` au focus
d'onglet). **Le défaut était commun, la reconvergence non.** Séparer les deux
questions — « qui est touché ? » et « chez qui ça se répare tout seul ? » — au
lieu de les fondre dans un seul verdict par plateforme.

### Le corollaire du chemin à 1 objet, appliqué AVANT que l'écart existe

La Leçon 233 finissait sur : « quand deux chemins traitent N objets et 1 objet,
le chemin à 1 objet n'est pas le cas facile ». Ici les deux portes de présence
(inscrite / anonyme) étaient exactement cette paire, et l'invité de lien partagé
n'a QU'UNE conversation — « la room refermée » y vaut la totalité de sa présence.
Les deux ont donc été corrigées ensemble, et la garde de PARITÉ (celle qui ne
nomme aucune valeur et compare les deux portes entre elles) a été écrite avant
que l'écart n'ait eu le temps d'exister. Une leçon sert à ça : la deuxième fois,
elle est un réflexe de conception et non un diagnostic.

---
