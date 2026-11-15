## Leçon 283 — on reprend le correctif d'une jumelle en cherchant la réponse à SA PROPRE question, et on laisse tout le reste (2026-08-24, cycle 128)

Le corollaire du cycle 85 dit déjà **« quand on reprend le correctif d'une
jumelle, on le prend en entier »**. Ce cycle mesure le MÉCANISME par lequel on ne
le fait pas — et il n'a rien d'une inattention.

`POST /user-preferences/communities/reorder` persistait `orderInCategory` et
n'émettait rien, quand son jumeau `reorderConversationPreferences` diffuse
`USER_PREFERENCES_REORDERED` sur la room personnelle. La ligne étant par
UTILISATEUR et non par appareil, un glisser-déposer fait sur l'iPhone n'atteignait
jamais l'onglet web ouvert — qui tient sa liste en `staleTime: Infinity` avec le
socket pour source primaire.

**Et le handler fautif CITE le jumeau**, sur dix lignes de commentaire :

```ts
// L'`upsert` corrige cela et EXIGE en retour le filtre d'appartenance —
// c'est la raison que porte le jumeau conversation
// (`reorderConversationPreferences`) …
```

La jumelle a donc été ouverte, lue, et à moitié reprise. La question qu'on se
posait ce jour-là était « comment borner cet upsert ? », et la réponse trouvée y
répondait exactement. La diffusion, elle, ne répondait à aucune question qu'on se
posait.

> **La question juste n'est pas *« que fait la jumelle pour mon problème ? »*
> mais *« que fait la jumelle, tout court, APRÈS cette écriture ? »***. Elle se
> répond en lisant sa suite ligne à ligne — jamais en cherchant un mot-clé, qui
> par construction ne rend que ce qu'on savait déjà chercher.

C'est la forme du cycle 125 (« la charge que ce site remet contient-elle autre
chose que ce que je viens de garder ? ») transposée du CORRECTIF au MODÈLE : ce
qui rend invisible n'est pas la distance, c'est le niveau d'abstraction de la
question posée.

### Le corollaire d'inventaire : un lot ferme une CLASSE dans SA langue

Le lot F71 avait précisément fermé cette classe de défaut, et son en-tête de test
le dit : « PUT/DELETE on community preferences didn't emit anything, so a second
tab/device for the same user never learned … ». Il a énuméré les verbes qui
**changent une préférence**. Le réordonnancement n'en est pas un dans cette
langue-là : c'est un geste d'ORDRE. Il écrit pourtant la même ligne, dans le même
fichier, avec le même coût.

> **L'énumération d'un lot est bornée par la PHRASE qui le décrit**, pas par
> l'ensemble qu'il croit couvrir (leçon 261). Devant un inventaire de sites,
> demander : *ce que je viens de nommer est-il la propriété, ou seulement le mot
> par lequel je l'ai trouvée ?*

### Et la leçon était DÉJÀ ÉCRITE, avec le bon fichier et la bonne règle

C'est le point le plus cher de ce cycle, découvert en résolvant le conflit de ce
fichier même. **La leçon 28** (itération 104, 2026-07-05) s'intitule :

> F71 soldé : `community-preferences.ts` était une copie figée de
> `conversation-preferences.ts`, sans la diffusion socket ajoutée après-coup au
> sibling

Elle nomme la bonne PAIRE de fichiers, diagnostique le bon MÉCANISME (« une copie
de code initiale figée avant le fix ne le reçoit jamais automatiquement, et rien
ne le signale »), et prescrit une règle réutilisable. Le réordonnancement est
passé au travers **treize mois plus tard, dans le fichier qu'elle nomme**.

La raison tient dans la règle prescrite, mot pour mot :

> grep immédiatement les routes SŒURS qui partagent la même forme
> (`grep -rn "PUT.*preferences" routes/`…)

`POST /user-preferences/communities/reorder` est un **POST**. La commande
prescrite ne pouvait pas le rendre, et elle a été suivie correctement.

> **Une règle de méthode outillée par un exemple de commande hérite des bornes
> de cette commande.** L'exemple est ce qu'on relit et ce qu'on exécute ; la
> phrase générale au-dessus (« les routes sœurs qui partagent la même forme »)
> est juste et n'est pas ce qui s'exécute. Quand on écrit une règle de balayage,
> le verbe HTTP, le nom de méthode ou le mot-clé qu'on met dans l'exemple
> DEVIENT la définition de la famille pour tous ceux qui la reprendront.

C'est pourquoi ce cycle livre un CLIQUET plutôt qu'une règle de plus. Un balayage
qui part du MODÈLE Prisma (`userConversationPreferences`, `userCommunityPreferences`)
et non du verbe de la route n'a pas de borne à hériter : il trouve l'écrivain
quel que soit le geste qui l'amène. **Devant une famille de défauts déjà nommée
deux fois, la réponse n'est pas de la nommer une troisième — c'est de l'exécuter.**

Les deux fois — `user-deletions.ts` côté conversation, le réordonnancement côté
communauté — le site fautif n'était pas caché. Il était VOISIN, et il
n'appartenait simplement pas à la phrase du lot qui a fermé les autres.

### Relever les consommateurs sert à décider s'il faut changer la forme DU TOUT

La règle du cycle 105 dit : avant de changer la forme d'un événement DIFFUSÉ,
relever ses consommateurs sur les trois clients. Sa suite n'était pas écrite.

Ici la forme naturelle était d'admettre `communityId` dans
`UserPreferencesReorderedEventData` — même geste, même charge, un discriminant de
plus, exactement ce que fait `USER_PREFERENCES_UPDATED` avec ses trois scopes.
Le relevé l'a interdit :

| décodeur | face à un item `{communityId, orderInCategory}` |
|---|---|
| iOS — `Update.conversationId: String`, **non optionnel** | décodage de l'ÉVÉNEMENT ENTIER en échec ; les réordonnancements de conversation du même lot partent avec |
| web — `preferencesMap.has(update.conversationId)` | filtré en silence |

> **Un décodeur STRICT rend l'élargissement plus cher que le nom neuf**, et c'est
> une mesure, pas un goût. Un événement multi-scope l'est parce qu'il a été CONÇU
> ainsi, avec des décodeurs qui discriminent ; il ne le devient pas
> rétroactivement sans casser le cas nominal — et il le casse par le mécanisme le
> plus discret qui soit, un `catch` de décodage côté client (cycle 92 bis).

`user:preferences-community-reordered` est INERTE pour les deux consommateurs
existants par construction.

### Et la charge nomme ce qui a été ÉCRIT, jamais ce qui a été DEMANDÉ

Le filtre d'appartenance borne les DEUX ensemble. Diffuser la demande enverrait
les autres appareils appliquer un ordre que la base ne porte pas — et
confirmerait au passage l'existence d'une communauté que l'appelant n'a pas le
droit de nommer. Rien d'écrit ⇒ rien d'émis.

Cliquet : `services/gateway/src/__tests__/preference-writer-sweep.ts`. Il fige les
SITES D'ÉCRITURE, pas les diffusions — il ne peut pas prouver qu'un site diffuse.
**Sa valeur est de forcer la question au lot suivant** : une entrée en trop
signifie « un écrivain neuf est apparu, et celui-là, il diffuse ? ». Son
collecteur est exercé sur une arborescence FABRIQUÉE, parce qu'un cliquet dont le
collecteur ne trouve jamais rien reste vert quoi qu'on écrive.

Détail : `tasks/realtime-sync-audit-2026-08-24-cycle128.md`.
