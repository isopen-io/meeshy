# Cycle 93 — Réparer une enveloppe rend lisibles les défauts de ce qu'elle contenait

**Date** : 2026-08-22
**Branche** : `claude/keen-hamilton-inwn81`
**Périmètre** : passerelle — `routes/conversations/messages-advanced.ts`

**Clients touchés** : aucun changement de code client. Aucun nom d'événement
ajouté ni retiré, aucune charge utile temps réel modifiée, aucune ligne de
Socket.IO touchée. Deux réponses REST d'édition gagnent trois champs
d'expéditeur — voir §5.

---

## 0. Ce cycle commence par une erreur à moi, et il faut la dire d'abord

Ce lot s'appelait « cycle 92 » et portait un diagnostic **faux**.

J'ai vu les deux `message: { type: 'object' }` de l'inventaire, conclu que la
charge utile était `{ success, data: { message } }`, et écrit un schéma qui
déclarait `data.properties.message`. Mes dix témoins passaient au vert.

Ils passaient parce que **je les avais écrits contre une charge utile que
j'avais inventée** : le témoin construisait `{ success: true, data: { message } }`
à la main et le servait à travers mon schéma. Il n'a jamais rien su du
gestionnaire.

Le gestionnaire fait `sendSuccess(reply, messageResponse)` où `messageResponse`
est le message **lui-même**, étalé. La réponse est `{ success, data: <message> }`.
Mon schéma décrivait donc une clé `data.message` qu'aucun gestionnaire ne
produit — c'est-à-dire **exactement le défaut que je prétendais réparer**, réécrit
à l'identique.

Un cycle concurrent (**88 bis**) avait diagnostiqué juste, et pendant que
j'écrivais le mien : l'enveloppe fantôme venait d'un `messageResponseSchema`
**mort**, jamais importé, dont les deux routes avaient copié la forme. Il a
corrigé le schéma partagé en `data: messageSchema` et l'a rendu VIVANT dans les
deux routes.

Son correctif est intégralement retenu. Le mien est retiré. Ce qui suit est ce
qu'il RESTE une fois le sien en place — et qui n'existait pas avant lui.

### Et un TROISIÈME cycle est passé sur le même fichier

À l'intégration suivante, le **cycle 91 bis** avait composé sa propre enveloppe
sur ces deux routes — même nom de constante que la mienne — en séparant le
transport `PUT` (qui calcule des statistiques, d'où `meta`) du `PATCH` (qui n'en
calcule pas).

**Et il avait mieux résolu que moi le problème de chargement du §6.2.** Sa
constante est composée depuis `messageSchema`, jamais en descendant dans
`messageResponseSchema.properties.data` : un `...spread` d'`undefined` est légal
et inerte, quand une chaîne d'accès lève à l'IMPORT. Là où j'avais réparé le
HARNAIS (`requireActual` sur une suite), il a rendu le CODE DE PRODUCTION
insensible au harnais — ce qui protège aussi toutes les suites que personne n'a
encore corrigées.

Sa structure est reprise ; ma surcharge de `sender` s'y greffe, sur les deux
enveloppes. Trois cycles concurrents ont traversé ce fichier en une session, et
chacun a corrigé une couche que le précédent avait rendue visible.

> **Quand deux corrections visent le même défaut, prendre la plus DÉFENSIVE.**
> Réparer un harnais protège une suite ; rendre la production insensible au
> harnais les protège toutes.

> **Un témoin qui teste une charge utile INVENTÉE n'atteste rien.** Le dépôt
> nomme cette faute depuis le cycle 62, pour des helpers qui recopiaient un
> corps de production. Elle a ici une seconde forme, plus discrète : recopier la
> **charge utile** au lieu du code. Le témoin traversait un vrai sérialiseur,
> montait une vraie instance Fastify, assertait sur des valeurs — et validait
> une fiction. **La question à poser avant d'écrire l'objet de test n'est pas
> « à quoi ressemble cette réponse ? » mais « que passe le gestionnaire à
> `sendSuccess` ? ».**

## 1. Ce que la réparation de l'enveloppe a rendu visible

Tant que `data` sortait `{}`, rien de ce qu'il contenait n'avait de conséquence
observable. Le cycle 88 bis l'a débouché — et les déclarations qu'il portait
sont devenues vivantes, avec leurs propres défauts.

Mesuré au compilateur sur `messageResponseSchema` corrigé, avec la charge utile
réelle :

```
sender in  : { id, userId, displayName, avatar, type, role, language, user: {…} }
sender out : { id, userId, displayName, avatar, type }
```

`messageSchema.sender` est `userMinimalSchema`. Il couvre bien le cas
participant — il déclare `userId` (« Real User ID (when sender is a
Participant) ») et `type`. Mais il est **minimal**, ce qui est son contrat, et
ces deux routes chargent trois champs de plus : `role`, `language`, et le `user`
imbriqué. Les trois sont supprimés.

> **Réparer une enveloppe rend lisibles les défauts de ce qu'elle contenait.**
> Deux défauts empilés sur le même champ, et le second n'était pas observable
> tant que le premier tenait. La deuxième passe n'est pas de la finition : c'est
> la moitié du travail, et elle ne peut avoir lieu qu'après.

## 2. Le grain : local, pas partagé

Élargir `userMinimalSchema` pousserait `role`, `language` et un objet `user`
imbriqué sur les dizaines de réponses qui l'emploient — dont beaucoup décrivent
un vrai `User`, pour qui `type` est déjà noté « absent » dans le schéma partagé.

> **Le grain juste est celui qui CHARGE.** Ces deux routes chargent plus que le
> schéma minimal ne déclare ; c'est à elles de déclarer plus, localement.

Et la surcharge est **composée**, pas recopiée :

```ts
{ ...messageResponseSchema, properties: { ...properties, data: { ...data, properties: { …, sender } } } }
```

Recopier l'enveloppe ici rouvrirait précisément la porte que le cycle 88 bis
vient de fermer : c'est une forme copiée d'un schéma qui recommencerait à
diverger. Seul le `sender` est surchargé.

## 3. `isOnline` : le piège que la réparation a ARMÉ

`userMinimalSchema` déclare `isOnline`. Aucun des deux `select` ne le charge.

Tant que `data` sortait `{}`, cela n'avait aucune conséquence. **Depuis le
cycle 88 bis, si.** Vérifié au compilateur : un `isOnline: true` posé sur l'objet
**est servi**.

Rien ne fuit aujourd'hui — le champ n'est pas chargé. Mais le piège du cycle 84
est armé pour de bon : le prochain `select` qui l'ajoute, pour une raison
parfaitement légitime, le met sur le fil **sans gate et sans qu'un témoin
tombe**.

La déclaration locale **omet** `isOnline`. C'est fail-closed — si le champ
apparaît un jour dans l'objet, le sérialiseur le retire — et cela vaut mieux
qu'un gate sur une donnée que personne ne charge, lequel est du code mort qui se
périme. Un témoin garde l'omission.

> **La règle du cycle 84 ne dit pas seulement « poser le gate dans le même
> lot ».** Elle dit que rendre une donnée visible oblige à DÉCIDER, dans le même
> lot, si elle a le droit de l'être. Et « rendre visible » inclut **réparer
> l'enveloppe au-dessus** : le lot qui débouche un parent hérite des décisions de
> visibilité de tous ses enfants.

## 4. Coût

Nul. Une constante composée à partir du schéma partagé, appliquée aux deux
`200`. Aucune requête, aucun chemin de code, aucun handler touché.

## 5. Ce qui change dans les réponses

`PUT /conversations/:id/messages/:messageId` et son sibling `PATCH` : `sender`
porte désormais `role`, `language` et son `user` imbriqué. Le reste est inchangé
— le cycle 88 bis l'avait déjà rétabli.

Aucune réponse ne perd de champ.

## 6. Témoins

`edited-message-serialization.test.ts` (13 témoins) monte une vraie instance
Fastify sur les DEUX schémas exportés — `PUT` (avec `meta`) et `PATCH` (sans),
séparés par le cycle 91 bis. **Sa charge utile est calquée sur
`messageResponse` tel que les deux gestionnaires le composent** — le message
étalé, pas enveloppé (§0). Un témoin y assert explicitement l'absence de toute
clé `message`, pour que l'enveloppe fantôme ne puisse pas revenir en silence.

**ROUGE prouvé : 7 des 13 tombent** quand on retire la surcharge de `sender` —
les trois champs et l'expéditeur anonyme côté `PUT`, les deux témoins côté
`PATCH`, et le témoin d'`isOnline`. Ce dernier
**prouve** que le schéma partagé publierait la présence, au lieu de le supposer.

Ce qui n'est pas prouvé par un revert et n'a pas à l'être : le module de routes
exige prisma, le service de traduction, l'auth et Socket.IO ; un témoin qui les
monterait tous n'observerait plus le schéma mais le harnais. La mesure est au
compilateur (§1).

### Pourquoi 154 témoins existants ne voyaient rien

`conversation-messages-advanced.test.ts` couvre ces routes avec 154 témoins —
**compté à l'exécution, pas en comptant les blocs `it(`** : le fichier en porte
152, dont un `it.each` de trois cas. La règle du §7 s'applique à ce chiffre-là
comme aux autres. Il **mocke `sendSuccess`** :

```ts
const mockSendSuccess = jest.fn((reply, data) => { reply._body = { success: true, data }; return reply; });
```

Rien n'y traverse jamais un schéma. Troisième forme de la même famille — après
le double Prisma qui rend `[]` (cycle 87) et le double de schémas partagés
(cycles 86, 91), voici le double de l'ÉMETTEUR de réponse.

Et c'est ce même double qui rend la faute du §0 si facile : quand le harnais
d'un fichier n'a jamais servi la vraie enveloppe, rien n'oblige le témoin
suivant à la découvrir.

### Le même fichier portait AUSSI un double partiel de `api-schemas`

La suite complète a rendu `1 failed, 816 passed` — **zéro test en échec** : la
suite ne se CHARGEAIT plus.

```
TypeError: Cannot read properties of undefined (reading 'properties')
  ...messageResponseSchema.properties,
```

`conversation-messages-advanced.test.ts` remplaçait `@meeshy/shared/types/api-schemas`
par un double listant DEUX schémas à la main. La composition de ce cycle,
évaluée au chargement du module, y trouvait `undefined`.

**Deuxième fois en deux cycles** — le cycle 91 avait exactement le même incident
sur `voice-translation.test.ts`, et la règle était déjà écrite. Elle n'a pas
suffi, parce qu'un double partiel ne se signale qu'au moment où le module
grandit : rien ne le rend visible avant.

Même remède : `jest.requireActual`. Les vrais schémas ne coûtent rien ici — ce
fichier mocke `sendSuccess`, donc rien n'y traverse le sérialiseur de toute
façon. 154/154 verts.

> **Un double partiel est une dette à retardement, et son échéance est le
> prochain qui touche le module.** Deux fois en deux cycles, sur deux fichiers
> différents, pour la même raison. Ce n'est plus un incident : c'est un patron
> de harnais qu'il faut cesser d'écrire.

## 7. Ce que ce cycle laisse ouvert

**Inventaire : 4 sites restants**, comptés dans `FROZEN_INVENTORY` :

| champ | site |
|---|---|
| `details` | `calls.ts` (400) |
| `creator` | `links/admin.ts` |
| `sender` | `messages.ts` — dette de FORME seulement (cycle 88) |
| `permissions` | `users/profile.ts` |

Et, propre à ce cycle :

- **`conversation-messages-advanced.test.ts` mocke `sendSuccess`** (§6). Le
  défaire est un lot en soi — 154 témoins en dépendent — mais tant qu'il tient,
  aucune de ces routes n'a de garde sur ce qu'elle SERT.
- **Le grain de `userMinimalSchema`** : ce cycle a choisi la déclaration locale.
  À une troisième route qui charge le même participant élargi, la réponse
  deviendra un `participantSenderSchema` partagé — pas un élargissement du
  minimal.

### Correction de tenue de registre

Les cycles 89 à 92 ont publié **15, 11, 8 puis 6** sites restants.
`FROZEN_INVENTORY` en portait **14, 10, 7 puis 5**, et leurs tableaux nommaient
un champ `user` qui n'y a jamais figuré — il vient d'un tableau en prose du
cycle 88, recopié de journal en journal sans être confronté au fichier, pendant
que le compte se propageait par soustraction depuis un premier chiffre déjà faux.

Le cliquet était vert à chaque cycle : le FICHIER a toujours été juste, c'est la
prose qui a dérivé — y compris dans des corps de PR fusionnés, qui restent au
dossier tels qu'ils ont été publiés.

C'est la faute du cycle 86 bis dans une autre matière : *« un tri est une
AFFIRMATION, et se vérifie comme telle »*. **Un compte aussi.**

## 8. La leçon

> **Un témoin peut traverser un vrai sérialiseur et valider une fiction.**
> Vraie instance Fastify, vraies assertions sur des valeurs, schéma réel — et
> une charge utile inventée en entrée. La question à poser avant d'écrire
> l'objet de test n'est pas « à quoi ressemble cette réponse ? » mais **« que
> passe le gestionnaire à `sendSuccess` ? »**. Sans cette question, un témoin
> vert atteste l'accord entre deux choses que j'ai écrites toutes les deux.

Et le corollaire, sur l'ordre des réparations :

> **Réparer une enveloppe rend lisibles les défauts de ce qu'elle contenait —
> et arme les déclarations qu'elle neutralisait.** `sender` sortait tronqué et
> `isOnline` était devenu servable, deux conséquences directes d'un correctif
> parfaitement juste. Le lot qui débouche un parent hérite des décisions de
> visibilité de tous ses enfants ; s'arrêter au parent laisse le travail à
> moitié fait et le piège armé.
