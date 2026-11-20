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

**3. La garde de bannissement se reconnaît par une LISTE BLANCHE de formes.**
`NOT: { bannedAt: null }` et `OR: [{ bannedAt: null }, { role: 'creator' }]`
étaient certifiés CONFORMES par le discriminant d'avant — le mot y est, la
polarité et la portée n'y sont pas. Une orthographe valide non prévue est comptée
NUE : une relecture de trop coûte moins qu'une fausse certification.

**4. Les deux discriminants lisent les paires de PREMIER NIVEAU, pas le texte.**
`AND` et `OR` sont traversés (l'idiome `OR: [{ id: clé }, { userId: clé }]` que
`CLAUDE.md` prescrit désigne UN lecteur), `NOT` ne l'est pas, et la traversée
s'arrête avant les filtres de RELATION — y entrer transformerait une audience en
porte. « Aucune forme négative ne SÉLECTIONNE » vaut désormais de `{ notIn: … }`,
de `NOT: { userId }` et d'un curseur `{ gt: … }`, et plus seulement de
`{ not: null }` : quatre audiences réelles disparaissaient par là, sans trace.

**5. Ce que l'instrument ne sait pas juger, il le PUBLIE — y compris la CLÉ.**
#20091 publiait la **portée** indirecte et laissait la **clé** indirecte se faire
juger : `{ conversationId, ...callerParticipantWhere(caller) }` a l'apparence d'une
audience et c'en est le contraire. Un étalement qui est un **APPEL** (jamais un
identifiant : nommer un membre exige une valeur d'exécution) rend la clause
`clé-indirecte`. Les fabriques purement NÉGATIVES du dépôt (`unsetOrNull`,
`differsOrUnset`) sont exemptées, aucune forme négative ne sélectionnant personne.

**6. Un filtre négatif ne nomme personne.** `{ not: <quoi que ce soit> }`, et plus
seulement `{ not: null }` : le discriminant d'identité prenait
`userId: { not: userId }` — « tous les membres SAUF moi », l'audience la plus
courante d'un tête-à-tête — pour la désignation d'une personne, et écartait ainsi
onze audiences réelles en silence.

**7. L'éventail de notifications push est RESSERRÉ dans son `where`.** C'est de
cette lecture que sortent `memberIds`, le lot `regular`, le gate de la réponse et
le dénominateur du compte rendu. Resserrer n'ouvre rien — et ce qui le PORTE est ce
`where` lui-même, pas la garde d'amont que le premier jet nommait.
`MentionService.validateMentionPermissions` épelle la loi en portées
`interlocutor` et `members` seulement ; en portée `directory` (conversation
`public`, `global`, `broadcast`) elle valide « tout compte existant ». Les trois
lots passent par `memberIds`, que ce `where` produit : `regular` ne lit que lui,
le gate de réponse exige `memberIds.includes(...)`, et le lot de MENTIONS le
reçoit en 3e argument de `createMentionNotificationsBatch`, dont le filtre
interne est sa porte d'admission.

**La jumelle de cette lecture sur le chemin d'ÉDITION était une fuite VIVANTE**,
et son entrée d'inventaire affirmait le contraire en portant « Mesuré, pas
supposé » : `notifyNewlyMentioned` composait le même `memberIds` d'admission sous
`isActive` nu, si bien qu'une édition ajoutant `@banni` lui poussait le texte
ÉDITÉ. La clause est resserrée, l'entrée SUPPRIMÉE — pas réécrite — et l'admission
est jugée LOCALEMENT plutôt que déléguée au filtre de l'appelé.

**8. Quand une lecture porte DEUX questions dont l'une exige le sur-ensemble, la
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

### Ce que l'audit adversarial a cassé

Verdict **BLOQUANT**, six constats intégrés. Outre la fuite d'édition ci-dessus :
le cliquet certifiait deux clauses qui annulent la loi ; son discriminant
d'identité faisait disparaître quatre audiences (dont l'élection du successeur
d'un créateur, où un banni-mais-actif est éligible) ; `participationEstVivante`
devenait un **no-op muet** si `bannedAt` sortait du `select`, puisque
`undefined == null`, et la suite entière restait verte ; `conversation-partners`
était rangé en aperçu AFFICHÉ quand son doc-comment le déclare audience de
DIFFUSION ; et quatre textes de famille annonçaient des totaux que le lot
lui-même avait rendus faux.

Quatre autres sont devenus des issues : #20110 (l'arrivée NOMME le banni à tous
les invités, et son nom peut être le TITRE du groupe), #20111 (la portée du
balayage s'arrête à `services/gateway/src` — l'agent anime des membres dormants
sur `isActive` nu), et deux compléments à #20103.

**Non vérifié, et c'est la question qui décide de tout** : personne n'a compté les
lignes `isActive: true, bannedAt ≠ null` en production. Les fuites de ce cycle
sont *possibles*, pas *dénombrées*. Et le lot touchant la frontière E2EE, un audit
cryptographique tiers reste requis.

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
