## Leçon 234 bis — Un défaut NOMMÉ dans le code n'est pas un défaut suivi (cycle 67)

> Numéro en « bis » : le cycle 67 a repris un 234 déjà pris par le cycle 66,
> faute d'avoir relu la fin du carnet avant d'écrire. Corrigé ici sans renuméroter
> la suite — une cascade traverserait les branches concurrentes, et le numéro
> d'une leçon n'est pas ce qu'elle enseigne.

`conversationWriteAdmission.ts` portait, depuis le cycle 30, cette phrase exacte :

> `leave.ts` (créateur dernier membre) n'écrit que `isActive: false` — **constat
> latent nº 2 du cycle 30, non corrigé depuis.**

Trente-sept cycles. Le défaut n'était ni caché, ni subtil, ni difficile : il
était **écrit**, au bon endroit, par quelqu'un qui l'avait parfaitement compris.

> **Un commentaire qui nomme un défaut le DOCUMENTE ; il ne le suit pas.** Et il
> a un effet second, pervers : il rend le défaut CONFORTABLE. La prochaine
> lecture tombe sur la note, constate que c'est connu, et passe — la note tenant
> lieu de décision. Chercher activement les aveux du dépôt (« non corrigé
> depuis », « constat latent », « à revoir », « TODO ») est une famille de
> recherche à part entière, et elle rend des défauts INSTRUITS, prêts à livrer.

### Le corollaire qui explique la longévité : le prix ne se paie pas chez l'écrivain

Quatre routes ferment une conversation. Trois posent `{ isActive, closedAt,
closedBy }` ; la quatrième ne posait que `isActive`. Deux lecteurs de cet état :

| lecteur | politique | effet de la divergence |
|---|---|---|
| `conversationWriteAdmission` | lit les DEUX colonnes | **aucun** — survit 37 cycles |
| `delta-tombstones` | lit `closedAt` SEUL | **aveugle depuis le début** |

> **La divergence d'un écrivain ne se paie jamais chez lui : elle se paie chez le
> lecteur le moins défensif.** Tant qu'on inventorie les écrivains, tout semble
> « juste inélégant » ; le coût n'apparaît qu'en inventoriant les LECTEURS et
> leurs politiques. Un état écrit par N sites et lu par M lecteurs a M
> politiques, pas une.

Corollaire de correction : réparer à la SOURCE (aligner l'écrivain), jamais chez
le lecteur. Ajouter `isActive` au `where` du tombstone aurait fait taire le
symptôme en créant une TROISIÈME politique de lecture.

Corollaire de non-correction, plus délicat : **la lecture défensive RESTE** après
que les écrivains se soient accordés. Les lignes déjà écrites par l'écrivain
divergent existent en base et rien ne les rétro-remplit. « Les écrivains
s'accordent enfin » est un fait sur le FUTUR ; une garde porte sur les données.

### Un défaut sans symptôme n'est pas un défaut sans victime

La branche fautive ne firait que quand l'appelant est le dernier membre actif —
et l'appelant était couvert par un autre stream de tombstones. En régime
nominal : **aucune victime**, donc aucun rapport de bug, donc trente-sept cycles.

La victime était hors régime nominal, dans la fenêtre entre le `count` de garde
et l'écriture (un participant ajouté entretemps se retrouve actif dans une
conversation terminale, sans direct ni rattrapage).

> **Ne pas classer « sans victime » ce qui est « sans victime tant qu'une garde
> lue à l'instant T reste vraie à l'instant T+1 ».** Chercher la victime dans la
> fenêtre de la garde, pas dans le cas nominal. Et l'écrire sans la gonfler : un
> correctif honnête sur une fenêtre étroite vaut mieux qu'un correctif vendu sur
> un symptôme qui n'existe pas.

### Deux fichiers de témoins peuvent geler le MÊME défaut

Le défaut était épinglé par deux fichiers — l'un appelant le handler à nu,
l'autre via `app.inject` — affirmant tous deux `data: { isActive: false }` **à
l'exclusion du reste**. Le second n'a PAS été trouvé en lisant : il est tombé
quand la suite LARGE a été lancée après le vert du fichier ciblé.

> Après avoir réécrit un témoin qui épinglait un défaut, **lancer la suite large
> avant de conclure** : les fichiers qui gèlent le même comportement ne partagent
> ni nom, ni harnais, ni convention d'assertion, et aucune recherche par nom de
> route ne les réunit.

### Un rouge dont on n'a pas vérifié la CAUSE est aussi trompeur qu'un vert

Le premier jet des gardes d'audience est parti rouge — pour une raison fausse.
`expect(io.to).toHaveBeenCalledWith(ROOMS.user(…))` ne retient que le PREMIER
maillon d'une chaîne `.to().to().emit()`, et le fan-out amorce toujours par la
room de conversation. La production était juste ; la sonde regardait ailleurs.

L'en-tête de `makeChainableIO` le documentait déjà en toutes lettres, avec la
sonde correcte (`_roomsFor(event)`, qui lit la chaîne de l'émission elle-même).

> **Un helper qui documente la bonne sonde ne protège que les tests qui le
> lisent.** Lire l'en-tête du double AVANT d'écrire l'assertion — et devant un
> rouge attendu, vérifier qu'il tombe pour la raison nommée, pas seulement qu'il
> tombe.

---
