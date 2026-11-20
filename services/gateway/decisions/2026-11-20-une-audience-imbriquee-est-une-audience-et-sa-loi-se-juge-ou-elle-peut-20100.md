## Une audience IMBRIQUÉE est une audience, et sa loi se juge là où elle PEUT se juger (2026-11-20, #20100)

### Contexte

Le cliquet des audiences de diffusion (#16690, élargi à `src/` entier par #20091)
garde une loi : une liste qui décide **qui REÇOIT** lit la participation VIVANTE
(`isActive: true` **et** `bannedAt` nul ou absent), jamais `isActive` nu.

Son discriminant lisait une **forme d'appel** —
`prisma.participant.findMany|count|groupBy|aggregate({ where: { conversationId, … } })`.
L'autre forme d'audience du dépôt est une **projection**, dont la portée de
conversation est portée par le `where` du PARENT :

```ts
conversation.findUnique({
  where: { id: conversationId },
  select: { participants: { where: { isActive: true }, select: { … } } },
})
```

Mesuré : **trente-trois sites**, aucun n'épelant la loi, tous hors de tout relevé
du dépôt — dont `messageNotificationFanOut`, l'éventail de notifications push.

### Décision

**1. La forme imbriquée entre dans le relevé, sans exiger de `conversationId`
textuel.** Une portée implicite est une portée. Le discriminant distingue les deux
formes par un seul paramètre (`scopeIsWritten`), et la distinction est documentée
là où elle est prise, pas déduite.

**2. Un sens de judgment exige une preuve de MODÈLE.** La forme appelée nomme sa
table ; la forme imbriquée ne nomme qu'une relation, et deux modèles la partagent
(`Conversation.participants: Participant[]`, `CallSession.participants: CallParticipant[]` —
les deux seules du schéma). Une clause imbriquée qui ne parle **ni d'activité ni
de bannissement** se **publie** comme `modèle-indécidable` au lieu d'être jugée, et
la prémisse de schéma vit dans un témoin qui relit `schema.prisma`.

**3. Ce que l'instrument ne sait pas juger, il le PUBLIE — y compris la CLÉ.**
#20091 publiait la **portée** indirecte et laissait la **clé** indirecte se faire
juger : `{ conversationId, ...callerParticipantWhere(caller) }` a l'apparence d'une
audience et c'en est le contraire. Un étalement qui est un **APPEL** (jamais un
identifiant : nommer un membre exige une valeur d'exécution) rend la clause
`clé-indirecte`. Les fabriques purement NÉGATIVES du dépôt (`unsetOrNull`,
`differsOrUnset`) sont exemptées, aucune forme négative ne sélectionnant personne.

**4. Un filtre négatif ne nomme personne.** `{ not: <quoi que ce soit> }`, et plus
seulement `{ not: null }` : le discriminant d'identité prenait
`userId: { not: userId }` — « tous les membres SAUF moi », l'audience la plus
courante d'un tête-à-tête — pour la désignation d'une personne, et écartait ainsi
onze audiences réelles en silence.

**5. L'éventail de notifications push est RESSERRÉ dans son `where`.** C'est de
cette lecture que sortent `memberIds`, le lot `regular`, le gate de la réponse et
le dénominateur du compte rendu. Resserrer n'ouvre rien, et c'est **mesuré** : la
même lecture tient `silenced`, une liste de refus, dont les trois consommateurs
sont déjà bornés par la loi en amont (`validatedMentionUserIds` par
`MentionService.validateMentionPermissions`, qui épelle `PARTICIPATION_VIVANTE`
depuis #14066).

**6. Quand une lecture porte DEUX questions dont l'une exige le sur-ensemble, la
loi se juge en CODE sur l'audience seule — et la lecture PROJETTE ses deux
colonnes.** `announceStartedGroup` trouve le créateur au `role` de sa ligne de
participation, que rien d'autre ne nomme (`Conversation` n'a pas de colonne
d'auteur) : resserrer son `where` ferait disparaître un créateur banni-mais-actif
et **plus aucun invité légitime ne serait annoncé**. Le site reste donc dans
`DELIBERATELY_WIDE`, avec sa raison, et son comportement est gardé par un témoin —
le seul endroit où une loi appliquée après lecture peut tomber.

### Ce que la décision refuse

- **Apprendre au cliquet à reconnaître une loi appliquée en code.** Ce serait
  rendre des verdicts VERTS sur une inférence, exactement ce qu'il existe pour
  empêcher. Un site dont la loi est en code est nu POUR LE CLIQUET, et sa décision
  est écrite.
- **Juger une clause dont on ne sait pas de quel modèle elle vient.** Un faux
  constat envoie réparer une clause sans rapport avec le bannissement, et coûte la
  crédibilité des constats voisins.
- **Resserrer une lecture qui alimente une égalité EXACTE.** Six sites restent
  larges pour cette raison ou pour celle du refus : les deux transports du gate de
  blocage d'un tête-à-tête, `messageMentions` (constructeur d'exclusions sur un
  ensemble déjà borné), `callGroupConversation` (`sameSet`), `conversation-encryption`
  (trois questions dans une lecture, famille de convergence #20093) et
  `announceStartedGroup`.

### Preuve

- `src/socketio/__tests__/audience-law-nested-scope.test.ts` — le site resserré
  nommé avec son verdict, la distribution gelée, la preuve de modèle lue dans
  `schema.prisma`, et la publication des clauses indécidables.
- `src/__tests__/unit/services/bannedButActiveMemberIsNoAudience.test.ts` — le
  comportement des deux correctifs, dont le témoin qui garde la DÉCISION
  (« un créateur banni annonce quand même ses invités légitimes ») et reste vert
  sous les deux mutations.
- Journal : `tasks/realtime-sync-audit-2026-11-20-cycle195-20100.md`.
- Suites ouvertes : #20103 (projections sans `where`), #20104 (la porte
  d'invitation), #20093 (convergence E2EE).
