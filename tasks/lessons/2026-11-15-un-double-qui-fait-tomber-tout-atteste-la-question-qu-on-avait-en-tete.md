## Un double qui fait tomber « tout » atteste la question qu'on avait en tête

*2026-11-15, cycle 165 — #18613.*

**Le fait.** `emitAttachmentUpdated` portait un témoin nommé « still emits to the
conversation room when the participant lookup fails ». Son double faisait LEVER
**toute** requête `prisma.participant.findMany`, et il assertait la bonne chose
(`expect(emitted[0].rooms).toEqual(['conversation:conv-1'])`, sous le
commentaire « degrading to the previous audience beats emitting nothing »).

La dégradation était juste. Mais sous ce double, DEUX questions tombaient
ensemble — et elles s'arbitrent à l'opposé :

| ce qui tombe | verdict juste |
|---|---|
| la LISTE des rooms personnelles | dégrader vers la room : la loi a répondu, toute la room peut lire |
| la LOI du plancher d'historique | n'émettre RIEN : on ne sait NI qui est bloqué, NI qui est autorisé |

Le témoin attestait la première. Il **couvrait** la seconde, sans la nommer, et
la seconde est un fail-OPEN sur un contrôle d'accès.

**Pourquoi ça ne se voit pas.** Un double qui lève sur tout ressemble à de la
rigueur : « et si la base tombait ? ». Il mesure en réalité la réaction à *une*
panne indifférenciée, alors que le site d'appel pose plusieurs questions à la
même dépendance. Le verdict attesté est celui de la question que l'auteur avait
en tête, et les autres héritent de sa réponse en silence.

C'est la forme « double » de la leçon du cycle 107 (« un balayage qui cherche UN
idiome mesure sa popularité, pas une propriété ») : ici le double ne mesure pas
une propriété du site, il mesure la réaction à SA panne, et il y en a plusieurs.

**La règle.** Quand un site d'appel pose plusieurs questions à la même
dépendance, un double qui lève sur tout ne garde qu'une de ses réponses. Avant
d'écrire « la dépendance tombe », énumérer ce que le site lui DEMANDE — et
donner au double de quoi discriminer.

Ici la discrimination était gratuite et déjà dans le code : la requête de la loi
porte les colonnes de plancher dans son `select`, celle de l'audience non.

```ts
findMany: jest.fn(async (args: any) => {
  if (!args?.select?.joinedAt) throw new Error('mongo down');  // l'audience SEULE
  return [];
}),
```

**Le corollaire, pour les deux sens.** Quand on AJOUTE une question à un site,
relire ses témoins de panne : ceux qui lèvent sur tout vont changer de verdict,
et ce changement est le signal — pas une rupture à réparer en ajustant
l'attente. Et quand un témoin de panne change de verdict après un ajout, la
question n'est pas « comment le remettre au vert ? » mais **« laquelle des deux
pannes gardait-il, et qui garde l'autre ? »**.

**Jumeau du même cycle, mesuré par l'audit adversarial.** Un ROUGE en BLOC a le
même angle mort qu'un double qui lève sur tout : il prouve qu'**au moins une**
garde porte, jamais que **chacune** porte. Dix témoins, cinq gardes, cinq
rouges — l'arithmétique ressemblait à une correspondance un-pour-un, et deux
témoins tombaient en réalité pour la garde du voisin, laissant la garde du plan
signé (vue unique, flammes) prouvée par RIEN. La mesure qui distingue est la
mutation **une par une**. C'est elle, et pas le compte, qui dit laquelle des
gardes est décorative.
