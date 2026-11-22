## Cycle 210 — le détail d'une conversation servait l'INSTANTANÉ des droits d'un invité, pas l'ensemble RÉSOLU (#20277)

**Date** : 2026-11-22. **Base** : `dev` à `5f406e5ff` (qui contient le cycle 209).
**Issue** : #20277. **Branche** : `claude/exciting-planck-uxipm9`.

### D'où vient ce lot

Du cycle 209, qui a mis le tiroir du composeur web à lire les droits de la ligne
du lecteur (#20264) — et qui, en suivant la donnée qu'il venait de brancher, a
trouvé que **personne n'avait demandé qui COMPOSE la valeur d'amorce**. L'issue
le dit en une phrase : « un lot qui met un client à lire une donnée hérite de la
question de sa justesse ».

Les quatre questions à instruire étaient écrites dans #20277, et son commentaire
en avait déjà tranché la première. Ce lot répond aux trois autres.

### Le défaut

`services/participantRights.ts` porte la loi des droits : pour une entrée SANS
COMPTE, `anonymousSession.rights` passe **devant** l'instantané figé au join
(`Participant.permissions`), et `middleware/auth.ts:571` la fait respecter à
chaque envoi. `resolveEntryRights` avait, dans tout le dépôt, cinq appelants —
aucun n'était `GET /conversations/:id`.

```ts
// conversationDetailInclude (core-selects.ts)
permissions: true,          // l'INSTANTANÉ, et rien d'autre
```

C'est la lecture d'**amorce** : celle que les trois clients montent à chaque
ouverture de fil.

### Ce n'est pas un piège armé — et la divergence est VOULUE

La question 1 de l'issue (« `PATCH …/rights` écrit-il les DEUX colonnes ? ») est
tranchée : **non, jamais**, et c'est une décision écrite sur place
(`participant-rights-core.ts`) — « la surcharge est un DELTA ; un droit ramené à
sa valeur du join voit son entrée EFFACÉE plutôt que réécrite à l'identique :
une surcharge qui recopie le join cesse de le suivre, et l'hôte perd tout moyen
de revenir en arrière ».

Les deux colonnes divergent donc **dès le premier usage du levier**. Il n'y a
aucune écriture à aligner : la seule réparation possible est que la lecture
RÉSOLVE. Tout hôte qui a déjà retiré ou accordé un droit à un visiteur sans
compte avait, jusqu'à ce lot, un détail qui servait une valeur fausse.

### La divergence ment dans les DEUX sens, et le second sens est né du cycle 209

| le geste de l'hôte | ce que le détail servait | ce que le client en faisait |
|---|---|---|
| RETIRE un droit que le join donnait | l'ancien `true` | une tuile offerte pour un geste refusé en 403 |
| ACCORDE un droit que le join refusait | l'ancien `false` | une tuile CACHÉE pour un geste que le serveur accepte |

La seconde ligne est une conséquence de #20264 lui-même : avant lui le tiroir ne
lisait aucun droit, donc restait ouvert, et le cas « accordé » fonctionnait par
accident. **Le cycle 209 a corrigé le sens qui mentait en offrant ; il a ouvert
celui qui mente en cachant.** Les deux ont leur témoin.

Et l'applieur temps réel de #20228 ne rattrapait que le lecteur CONNECTÉ au
moment du geste : un fil rouvert plus tard repartait du détail, donc de
l'instantané. Le symptôme visible était une bascule — le tiroir s'ouvre, puis se
ferme à la première socket.

### Le correctif, et ce que la projection coûte

Trois pièces, aucune au site d'appel :

1. **`conversationDetailInclude` projette `anonymousSession: { select: { rights: true } }`** —
   la surcharge SEULE. Le commentaire d'iter 35 (F8) reste juste : c'est le
   document embarqué ENTIER qui avait été retiré, `sessionTokenHash` et le
   profil de l'invité compris. Huit booléens d'un document **déjà lu** : une
   projection, pas une requête, pas une jointure. La question 3 de l'issue
   (« charger `anonymousSession` sur 100 participants a un coût ») se répond donc
   sans arbitrage de périmètre — et la question 4 (la ligne du seul appelant, ou
   toutes ?) devient sans objet : **toutes**, pour le même prix.
2. **`servedParticipantSendRights`** : les SEPT droits d'émission résolus,
   dérivés de `PARTICIPANT_SEND_RIGHT_NAMES` — un huitième droit d'émission
   ajouté à l'énumération est servi sans que personne y pense.
3. **`participantRowWithServedRights`** : la ligne servie, **sans** la source de
   la surcharge.

### `canViewHistory` sort À LA SOURCE, et c'est le point que ce lot a failli manquer

`anonymousSession.rights` porte `canViewHistory` — le fait de MODÉRATION que le
porteur a réservé aux hôtes (#4056), retiré de `participant:rights-updated`
diffusé à la room (#4009) et de la fiche d'un participant lue par un membre
ordinaire (`disclosableEntryRights`).

Il ne sortait pas du détail **non plus** — mais par omission de
`conversationParticipantSchema`, c'est-à-dire par fast-json-stringify. C'est
exactement ce que le dépôt appelle un piège armé : la première personne qui
déclare la clé publie ce que personne n'avait décidé de publier. Charger la
surcharge mettait en plus l'objet entier à portée de tout `...row` qui suit.

Les deux chemins sont donc fermés **dans le code** : l'ensemble servi est
l'énumération des droits d'ÉMISSION, et la ligne servie ne porte plus la source.

### Le témoin que j'ai écrit et qui ne pouvait pas tomber

Le premier jet gardait ces deux retraits **par la route**, avec `app.inject` et
le vrai contrat de fil — la forme que le dépôt exige d'un témoin de valeur. Passé
à la mutation « la fabrique laisse passer la source de la surcharge », il est
resté **VERT** : le schéma ne déclarant ni `anonymousSession` ni `canViewHistory`,
le sérialiseur les retire quoi que la fabrique remette.

> **Un témoin de non-fuite posé derrière un sérialiseur qui supprime déjà la clé
> atteste la DISCRÉTION DU SÉRIALISEUR, jamais la décision du code.** La règle du
> dépôt — « un témoin de confidentialité assert sur la VALEUR SERVIE » — garde
> une FUITE ; elle ne garde pas un RETRAIT. Pour un retrait, le seul niveau où le
> témoin peut tomber est celui de l'objet, avant sérialisation.

La décision vit donc chez la loi, avec un témoin qui tombe
(`__tests__/unit/services/participantRights.test.ts` § #20277), et le témoin de
route a été REQUALIFIÉ en non-régression de fil, en écrivant dans son
doc-comment ce qu'il ne prouve pas. Le garder a une valeur : le jour où
quelqu'un déclare l'une des deux clés, c'est lui qui l'obligera à voir ce qu'il
ouvre (règle du cycle 84).

### Et un `any` au site d'appel efface une loi de type

`participantRowWithServedRights` rend `Omit<T, 'anonymousSession'>`. Le site
d'appel du détail itère sur `any[]`, et `Omit<any, …>` ne veut rien dire : le
compilateur a perdu jusqu'à l'`id` de la ligne, et `membersServedToViewer<T
extends { readonly id: string }>` l'a refusé (`TS2345`). La réparation n'est pas
un cast — c'est un TYPE NOMMÉ, dérivé du `select` qui le produit
(`ConversationDetailParticipantRow = Prisma.ParticipantGetPayload<…>`, la même
forme que `ConversationListRow`).

> **Un `any` ne relâche pas seulement le site qui le porte : il annule les lois
> de type de tout ce qu'il traverse.** Ici la loi annulée était celle qui dit
> qu'une ligne servie porte un `id` — et c'est le compilateur, pas un témoin, qui
> l'a dit.

### Ce que ce lot NE fait PAS — mesuré, et c'est une issue

`serializeConversationParticipant` (`packages/shared/utils/participant-helpers.ts`)
— la fabrique que le dépôt impose à **toute** surface servant un participant —
sert `canSendMessages` / `canSendFiles` / `canSendImages` depuis
`participant.permissions`, l'instantané NU, sur cinq sites de production dont la
collection de SYNCHRONISATION et la diffusion `participant:role-updated`. C'est
la **sixième** famille de lecteurs de la loi des droits, et elle n'était comptée
par aucune des cinq énumérations précédentes, parce que son vocabulaire est
différent : trois booléens APLATIS, pas un objet `permissions`.

> **Une énumération de lecteurs d'une loi se fait sur ce que la loi DÉCIDE, pas
> sur le nom du champ qui la porte.** #20277 comptait « qui sert
> `permissions` ? » et a trouvé cinq lecteurs ; la question juste était « qui
> dit à un client ce qu'il a le droit d'envoyer ? », et elle en rend six.

Suivi : **#20292** (ouverte par ce lot, avec la mesure site par site).

**Et le relevé des lecteurs CLIENTS, fait pour #20292, en a rendu un second,
pire que lui.** `participant:rights-updated` a **un seul** abonné sur iOS —
`ParticipantProfileSheet`, la fiche qu'un HÔTE ouvre sur quelqu'un d'autre.
L'autorité du LECTEUR lui-même (`ConversationViewerAuthority.canSendMessages`,
qui décide de Répondre et d'Épingler par `MessageActionPolicy`) descend de
`AnonymousSessionContext.permissions`, c'est-à-dire de l'instantané de la
JONCTION, écrit UNE fois dans le trousseau (`MeeshyApp.swift:261`) et jamais
réécrit. Et iOS ne décode AUCUN `permissions` sur le participant du détail
(`ConversationModels.swift`) — il ne lit donc même pas le champ que ce lot vient
de rendre juste.

Un droit retiré par l'hôte laisse donc, sur iOS, « Répondre » offert **pour
toute la vie de la session, par-delà la fermeture de l'app**. C'est #20228 (le
web) non fait sur iOS. Suivi : **#20294**.

> **Un relevé de consommateurs répond à une autre question que celle qui l'a
> motivé.** Celui-ci servait à savoir si #20292 était urgent — il a répondu non
> (aucun lecteur des trois booléens aplatis, donc un piège armé) **et** a nommé,
> dans le même balayage, un défaut VIVANT sur une surface que la question ne
> visait pas. La règle du cycle 105 — « relever les consommateurs avant de
> changer la forme » — vaut aussi quand on ne change rien : le relevé est un
> instrument de mesure, pas une formalité de lot.

### La preuve

| mutation | témoins qui tombent |
|---|---|
| le handler reprend l'instantané nu (`...m`) | **3 rouges** (valeur, par la route) |
| le `select` retire la surcharge | **2 rouges** (projection) — et AUCUN témoin de valeur, un double Prisma rendant ce qu'on lui dit |
| la loi retombe sur une seule colonne | **3 rouges** |
| la fabrique laisse passer la source de la surcharge | **1 rouge** (à la source ; 0 par la route — voir ci-dessus) |
| la loi sert l'ensemble ENTIER (`canViewHistory` compris) | **3 rouges** |

| gate | résultat |
|---|---|
| `npx tsc --noEmit` (gateway) | **0 erreur** |
| `npx jest conversation participant` | **323 suites / 4552 témoins verts** |
| suite complète du gateway | voir § gates du commentaire de clôture |
