# Cycle 92 — Le schéma partagé décrivait la bonne enveloppe et le mauvais expéditeur

**Date** : 2026-08-22
**Branche** : `claude/keen-hamilton-inwn81`
**Périmètre** : passerelle — `routes/conversations/messages-advanced.ts`

**Clients touchés** : aucun changement de code client. Aucun nom d'événement
ajouté ni retiré, aucune charge utile temps réel modifiée, aucune ligne de
Socket.IO touchée. Deux réponses REST d'édition cessent de sortir vides — voir §5.

---

## 1. D'où vient ce cycle

L'inventaire du cycle 91 (§8) nommait deux sites de `messages-advanced.ts` :
les réponses des **deux** routes d'édition (`PUT /conversations/:id/messages/:messageId`
et son sibling `PATCH`), toutes deux `message: { type: 'object', description:
'Updated message object' }`.

La `description` mérite d'être notée : elle donne l'impression d'un champ
documenté. Elle ne déclare rien — `properties` est ce qui déclare, et sans lui
fast-json-stringify rend `{}`.

La reconnaissance était faite au cycle précédent et se confirme : enveloppe
`{ success, data }` correctement décrite (la déclaration s'applique), producteur
= un `prisma.message.update({ include })`, et **aucune dimension de présence dans
les deux `select`** — la règle du cycle 84 ne s'applique donc pas… mais elle
revient par une autre porte (§4).

## 2. La bonne enveloppe existait déjà — et son expéditeur était le mauvais

`@meeshy/shared/types/api-schemas` exporte `messageResponseSchema` :

```ts
{ success, data: { message: messageSchema } }
```

C'est **exactement** l'enveloppe de ces deux routes. Quatrième fois de la session
que la forme juste existe déjà ailleurs dans le dépôt (cycles 84, 89, 91, 92).
Mieux : `messageSchema` était **déjà importé dans ce fichier** et n'y servait à
rien — quelqu'un avait vu le correctif et ne l'avait pas posé.

Mais la leçon du cycle 91 s'applique mot pour mot, et il fallait mesurer avant de
substituer. `messageSchema.sender` est `userMinimalSchema`. Ces deux routes
chargent un **`Participant`**, pas un `User` :

```
in  : { id, userId, displayName, avatar, type, role, language, user: {…} }
out : { id, userId, displayName, avatar, type }
```

`role`, `language` et le `user` imbriqué — trois champs que les deux `include`
chargent délibérément — auraient été supprimés en silence.

Ce n'est **pas** une erreur de `userMinimalSchema` : il couvre très bien le cas
participant, il déclare même `userId` (« Real User ID (when sender is a
Participant) ») et `type`. Il est simplement **minimal**, ce qui est son
contrat. Le mauvais geste aurait été de l'élargir : `role`, `language` et un
objet `user` imbriqué se seraient répandus sur les dizaines de réponses qui
l'emploient, dont beaucoup décrivent un vrai `User` pour qui `type` est déjà noté
« absent ».

> **Le grain juste est celui qui CHARGE.** Ces deux routes chargent plus que le
> schéma minimal ne déclare ; c'est donc à elles de déclarer plus, localement,
> et non au schéma partagé de grossir pour deux appelants.

## 3. Ce que le lot pose

Une déclaration locale de l'expéditeur, et l'enveloppe partagée avec ce seul
`sender` remplacé :

```ts
message: { ...messageSchema, properties: { ...messageSchema.properties, sender: editedMessageSenderSchema } }
```

Tout le reste de `messageSchema` est repris tel quel — y compris son
`metadata: { additionalProperties: true }`, dont le commentaire d'origine décrit
précisément le même piège (« sans lui, fast-json-stringify strippe SILENCIEUSEMENT
le contenu de metadata »). Ce cycle en bénéficie sans avoir à le redécouvrir :
c'est ce que vaut un schéma partagé quand on le prend pour ce qu'il est.

## 4. `isOnline` est délibérément OMIS, et c'est la décision du lot

`userMinimalSchema` déclare `isOnline`. Aucune des deux routes ne le charge —
vérifié dans les deux `select`. Tant que la charge utile sortait `{}`, la
question ne se posait pas.

**En rendant la déclaration vivante, elle se pose.** Reprendre `isOnline` tel
quel n'aurait rien fait fuir aujourd'hui (le sérialiseur ne fabrique pas un champ
que l'objet ne porte pas) — mais aurait armé exactement le piège que le cycle 84
a nommé : le jour où quelqu'un ajoute `isOnline` au `select`, pour une raison
parfaitement légitime, il atteint le fil **sans gate et sans qu'un témoin tombe**.

L'omettre est **fail-closed** : si le champ apparaît un jour dans l'objet, le
sérialiseur le retire. C'est mieux que de gater un champ que personne ne charge —
un gate sur une donnée absente est du code mort qui se périme.

> **La règle du cycle 84 ne dit pas seulement « poser le gate dans le même
> lot ».** Elle dit : quand on rend une donnée visible, on décide dans le même
> lot si elle a le droit de l'être. Ici la décision est « pas de présence sur
> cette porte » — et la façon de l'écrire est une omission, gardée par un témoin.

## 5. Ce qui change dans les réponses

Les deux routes d'édition servaient `data.message = {}`. Elles servent désormais
le message édité : identité, contenu, `originalLanguage`, `isEdited`/`editedAt`,
`validatedMentions` (recomposé APRÈS l'écriture par les deux transports),
`metadata` entier, `replyTo`, et l'expéditeur participant complet.

Aucune réponse ne perd de champ — il n'y en avait aucun à perdre.

## 6. Témoins

`edited-message-serialization.test.ts` (neuf, 10 témoins) monte une vraie
instance Fastify sur le schéma exporté et assert sur les VALEURS.

**Ce qui tombe, et ce qui est seulement mesuré** — la distinction vaut d'être
écrite :

- La réparation `{}` → charge utile ne se prouve pas en revertant : le module de
  routes exige prisma, le service de traduction, l'auth et Socket.IO, et un
  témoin qui monterait tout cela n'observerait plus le schéma mais le harnais.
  Elle est mesurée au compilateur (§2).
- Ce que les témoins GARDENT, ce sont les deux **décisions** du lot. Et ceux-là
  tombent pour de bon : en substituant `messageResponseSchema` tel quel,
  **5 des 10 tombent** — les trois champs d'expéditeur, l'expéditeur anonyme, et
  le témoin d'`isOnline`.

Ce dernier point est le plus utile du lot : il **prouve** que la substitution
séduisante aurait publié `isOnline`, au lieu de le supposer.

### Pourquoi 152 témoins existants ne voyaient rien

`conversation-messages-advanced.test.ts` couvre ces routes avec 152 témoins. Il
**mocke `sendSuccess`** :

```ts
const mockSendSuccess = jest.fn((reply, data) => { reply._body = { success: true, data }; return reply; });
```

Rien n'y traverse jamais un schéma. C'est la même famille que les cas des
cycles 86 et 87 — un harnais qui observe ce que le handler CONSTRUIT, jamais ce
que la route SERT — et la troisième forme qu'elle prend : après le double Prisma
qui rend `[]` et le double de schémas partagés, le double de l'ÉMETTEUR de
réponse.

## 7. Coût

Nul. Deux déclarations remplacées par une constante locale composée du schéma
partagé. Aucune requête, aucun chemin de code, aucun handler touché.

## 8. Ce que ce cycle laisse ouvert

**Inventaire : 6 sites restants** :

| champ | site |
|---|---|
| `sender` | `messages.ts` — dette de FORME seulement (cycle 88) |
| `creator` | `links/admin.ts` |
| `details` | `calls.ts` (400) |
| `link` | `conversations/sharing.ts` |
| `permissions` | `users/profile.ts` |
| `user` | — |

Et, propre à ce cycle :

- **`conversation-messages-advanced.test.ts` mocke `sendSuccess`** (§6). Le
  défaire est un lot en soi — 152 témoins en dépendent — mais tant qu'il tient,
  aucune de ces routes n'a de garde sur ce qu'elle SERT.
- **Le grain de `userMinimalSchema`** : ce cycle a choisi la déclaration locale.
  Si une troisième route charge le même participant élargi, la question se
  reposera — et la réponse sera alors un schéma partagé `participantSenderSchema`,
  pas un élargissement de `userMinimalSchema`.
- Dettes reconduites : le balayage ignore l'enveloppe (cycle 88), ne détecte pas
  une déclaration incomplète (cycle 91), et ne lit pas `packages/shared`
  (cycle 89) ; `npx eslint` échoue dans ce conteneur (cycle 79).

## 9. La leçon

> **Un schéma partagé peut décrire la bonne ENVELOPPE et le mauvais
> PRODUCTEUR.** `messageResponseSchema` décrivait exactement `{ success, data:
> { message } }` — et son `sender` était écrit pour un `User` là où ces routes
> chargent un `Participant` élargi. La bonne enveloppe est le piège : elle rend
> la substitution évidente, et c'est précisément quand elle est évidente qu'il
> faut mesurer.

Et le corollaire, sur le grain :

> **Le grain juste est celui qui CHARGE.** Quand deux routes chargent plus qu'un
> schéma partagé minimal ne déclare, c'est à elles de déclarer plus — pas au
> schéma partagé de grossir pour deux appelants et de se répandre sur les
> dizaines d'autres.

Et, sur la présence :

> **Rendre une déclaration vivante repose la question de la visibilité, même
> quand rien ne fuit.** `isOnline` était déclaré par le schéma partagé et chargé
> par personne. Le reprendre n'aurait rien fait fuir — et aurait armé le piège
> pour le prochain `select`. L'omettre est fail-closed, et un témoin le garde.
