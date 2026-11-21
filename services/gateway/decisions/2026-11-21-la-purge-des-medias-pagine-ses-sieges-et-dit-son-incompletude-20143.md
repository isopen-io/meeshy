## La purge des médias PAGINE ses sièges, et DIT son incomplétude

**2026-11-21 — #20143**, suite de #20129 (fermée par #20131, qui a fait la bonne
chose) et de #20113.

### Le contexte

#20131 a fait apparier aux deux requêtes de compte entier — l'export RGPD et la
purge de fin de grâce — les DEUX espaces de clés de `MessageAttachment.uploadedBy`
(l'identité de compte depuis #20113, le `Participant.id` pour les copies
transférées écrites avant). C'était juste, et ça reste.

La lecture des sièges qu'il a introduite portait deux affirmations, mesurées
fausses par l'audit adversarial d'un lot parallèle sur le même sujet :

| l'affirmation | ce que le dépôt dit |
|---|---|
| « La prochaine passe reprendra le reste » | `processAccountDeletionRequests` n'élit que les demandes `CONFIRMED`, et celle-ci ne l'est plus — `MaintenanceService` l'écrit à l'endroit qui décide. Le seul rejeu manuel n'appelle même pas ce balayage. |
| `take: 10_000` « ne tronque rien de réaliste » | un `take` seul **jette** au-delà de son plafond, sans compteur et sans trace — ce que la décision de #20131 reproche elle-même à l'alternative qu'elle écarte |

### La décision

**Une lecture auxiliaire dont dépend une DESTRUCTION pagine, et son incomplétude
voyage avec son résultat.**

1. `accountSeatIdBatches` (`services/participants/accountParticipantIds.ts`) rend
   les sièges par fournées de 200, avec un drapeau `complete`. Ni plafond
   silencieux, ni `findMany` nu.
2. `purgeMediaOfDeletedAccount` rend `complete`, et son journal de fin passe en
   **`error`** quand le balayage était incomplet. Un `info` disant « purgé »
   couvrait une perte d'octets irréversible.
3. Le fail-open est GARDÉ — ne rien purger serait pire — mais il ne se justifie
   plus par un rejeu inexistant. Ce qui manque vraiment est nommé : #10021, et
   #20139 pour le fait que personne ne LIT encore ce `complete`.
4. La descente porte une borne de **VIVACITÉ** (500 pages). Un `for (;;)` dont la
   sortie dépend de la réponse d'une dépendance n'en a aucune, et celle-ci tourne
   dans la passe HORAIRE : une page qui ne progresse pas y bouclait pour
   toujours. Le dépassement est une incomplétude annoncée.
5. `failedIds` est tenu pour la PASSE, pas par fournée : l'identité du compte
   figure dans CHAQUE fournée, donc une pièce de l'espace nominal appartient à
   toutes, et la retenir par fournée la faisait retenter autant de fois qu'il y a
   de fournées (250 fois pour un compte à 50 000 participations).

### Un seul producteur de la liste des sièges

Trouvé au passage, et soldé dans le même lot : **trois** sites lisaient « les
sièges de ce compte » avec trois `where` — `{ userId, type: 'user' }` pour
l'export, `{ userId }` pour la purge et pour la télémétrie d'appel — et la
section `calls` de l'export en faisait une **quatrième lecture de la même liste
dans la même requête**.

La clause unique est `{ userId }` : la question posée est « quels sièges portent
l'IDENTITÉ de ce compte ? », et `type` classe le siège, pas l'identité qu'il
porte. Le resserrement est inerte sur l'arbre d'aujourd'hui (aucun écrivain ne
pose `userId` sur un siège `anonymous`, et il n'existe aucun écrivain de siège
`bot`) — et il cesse d'être une divergence qu'on alignera un jour dans le mauvais
sens : dix lignes sous la clause de l'export, la section `contacts` écrit
`{ userId, type: 'user', isActive: true }`.

Le cliquet de source garde l'absence d'un second producteur, et **son
discriminant est le `select`, pas la table** : une lecture qui ne demande que
`id` ne peut répondre qu'à une question, tandis que `contacts` — qui demande la
conversation et ses co-participants — en pose une autre, donc sort par
CONSTRUCTION et non par exemption.

`SECTIONS_NEEDING_PARTICIPANT_IDS` porte désormais la liste des sections qui
dépendent de cette lecture, **avec les sections elles-mêmes** : la condition
écrite dans la route affirmait « ce sont les sections qui en ont besoin » sans
l'avoir vérifié, et `calls` la démentait (leçon 261).

### Ce que ce lot ne change PAS

Le `where` du filtre reste écrit en ligne — `{ uploadedBy: { in: [userId, …] } }`,
la forme que #20131 a fusionnée. Un helper partagé avait été écrit, puis retiré :
il ne gagnait rien de mesurable et re-litigeait une décision déjà fusionnée. La
règle « la correction déjà sur `dev` se garde, et le lot s'y adapte » (#18654)
vaut aussi quand le lot d'en face est le sien.
