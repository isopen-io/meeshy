# Cycle 108 bis — `main` était rouge, et la panne n'était dans aucun environnement : elle était dans l'horloge

Écrit en parallèle du cycle 108 (PR #3385), sur le même dépôt, par une autre
session. Les deux lots ont rencontré **le même symptôme** et en ont tiré des
conclusions opposées. Ce journal dit lequel a raison, et pourquoi l'autre
raisonnement était bon tout en étant faux.

Suite directe du cycle 107 bis. Ce lot n'a pas commencé par un suivi : il a
commencé par mesurer l'état de `main`, et `main` était ROUGE.

## 0. Ce que le cycle précédent laissait

Trois suivis ouverts (bivariance `strictFunctionTypes` ; le même cast côté web
dans `VideoCallInterface.tsx` ; trois services prenant un `Server` nu pour
émettre). Aucun n'est traité ici : un `main` rouge prime. Ils restent ouverts
en §5, avec un recomptage qui en corrige un.

## 1. La mesure d'ouverture, et ce qu'elle a corrigé de ma propre lecture

`git status` : branche synchronisée avec `origin/main`, 0/0 — le cycle 107 bis a
bien fusionné.

Premier réflexe : lancer le cliquet de dette de types. Il rend **1242 contre une
baseline de 1239**. Lecture immédiate et FAUSSE : « `main` a régressé sur le
cliquet ».

La vérification l'a renversée. La CI du `HEAD` de `main` (run `32633238504`)
montre l'étape *Type-check (apps/web — debt ratchet)* en **success**. La CI lit
1239, moi 1242 : ce n'est pas une régression, c'est une **divergence local/CI**.
Et le vrai échec de `main` est ailleurs — le job **Test gateway**.

> Deux défauts distincts se cachaient derrière un seul chiffre inattendu.
> Prendre le premier pour le second aurait fait corriger un `main` qui n'avait
> pas ce défaut-là, et laissé le vrai en place.

Le +3 est réel, mesuré, et **appartient à la PR #3385** (§3).

## 2. `main` rouge — une bombe à retardement de 24 heures

`Test gateway` : 835 suites vertes, **1 rouge**, 2 témoins.
`src/socketio/handlers/__tests__/MessageHandlerEditDelete.test.ts`.

Reproduit localement, **déterministe** — pas un flottement :

```
● sert le noyau que `SocketIOMessage` EXIGE …    expect(edited).toBeDefined() → undefined
● sert le `User.id` de l'expéditeur …            Received array: []
```

### La cause

Les deux témoins fabriquent leur message avec
`createdAt: new Date('2026-08-22T10:00:00Z')`.

`admitMessageEdit` (`services/messaging/messageEditAdmission.ts`) refuse à
l'auteur toute édition au-delà de `MESSAGE_EDIT_WINDOW_MS` = **24 h**, comptées
depuis `Date.now()`.

La CI a tourné le **2026-08-23 à 10:15Z** — soit **24 h 15 min** après le
littéral. La fenêtre venait de se fermer. L'édition est refusée, la diffusion
n'a pas lieu, les deux `expect` tombent.

Écrits au cycle 101 (`ed4c45f6`), verts ce jour-là, verts le lendemain matin,
rouges à 10:15. **Aucun commit n'est coupable** : le seul changement est
l'horloge.

### Le trou qui a armé la bombe

Le littéral n'est pas la faute — il en est la conséquence.

`makeMessageRecord`, la fabrique du fichier, ne portait **ni `createdAt` ni
`messageType`**. Or la règle est écrite pour ne bloquer personne sur une date
illisible :

```ts
const ageMs = now - new Date(message.createdAt ?? NaN).getTime();
if (!(ageMs > MESSAGE_EDIT_WINDOW_MS)) return { admitted: true, … };
```

`NaN > w` est faux ⇒ un `createdAt` absent **ADMET**. Presque tous les témoins du
fichier franchissaient donc la fenêtre par ABSENCE de date : **la porte était
traversée sans jamais être exercée.**

Le seul témoin qui vérifie les sept champs requis par `SocketIOMessage` avait
besoin d'un vrai `createdAt`. Ne le trouvant pas au socle, il s'en est écrit un —
en absolu. La fabrique incomplète a armé la bombe.

### Ce que le message d'échec accusait, et ce qui était vraiment cassé

`Received array: []` : aucune émission. Le témoin qui GARDE le contrat de
diffusion du cycle 101 tombait donc en désignant la **diffusion** — alors que la
panne est dans l'**admission**, deux étages plus haut.

Vérifié plutôt que supposé : `buildMessageEditedCore` replie les deux champs
(`message.createdAt || new Date()`, `message.messageType || 'text'`). **La charge
utile était intacte.** Une première rédaction de mon commentaire affirmait qu'un
`createdAt` indéfini atteignait le fil ; c'était faux, et c'est le code du
constructeur qui l'a dit, pas moi.

> Un témoin qui tombe pour un motif étranger à ce qu'il garde est pire qu'un
> témoin absent : il fait croire que la propriété gardée a régressé, et il pousse
> au correctif qui la rendrait vraiment fausse.

### Le correctif

Structurel, pas cosmétique. Repousser le littéral d'un jour aurait réarmé la
bombe pour le lendemain.

- `makeMessageRecord` porte désormais `messageType: 'text'` et
  `createdAt: new Date()` — un message FRAIS et complet au socle ;
- les deux témoins perdent leur surcharge : `makeMessageRecord()` nu ;
- les cinq témoins de fenêtre gardent leurs surcharges **relatives**
  (`twentyFiveHoursAgo`, `tenMinutesAgo`) — l'idiome que le fichier employait
  déjà partout ailleurs, et qui rendait ces deux-là visiblement singuliers.

L'admission redevient un verdict sur la **fraîcheur** au lieu d'un laissez-passer
sur l'absence.

### ROUGE prouvé — les deux gardes peuvent toujours tomber

Un correctif qui rend un témoin vert en le rendant incapable de tomber n'est pas
un correctif. Deux mutations, appliquées puis annulées, sur
`socketio/messageEditedPayload.ts` :

| mutation | témoins tombés |
|---|---|
| `createdAt` retiré du noyau | **1** — le témoin des sept champs |
| `senderId: message.senderId` (le `Participant.id` brut) | **1** — le témoin d'identité |

Chacune fait tomber **exactement** le témoin qui la garde, et aucun autre.

## 3. Le +3 : trouvé, mesuré, et laissé à la PR #3385

Le cliquet de dette rend 1242 en local et 1239 en CI. Cause mesurée, une seule
variable changée :

| état | compte |
|---|---|
| sans `packages/shared/dist` | **1242** |
| après `bun run build` dans `packages/shared` | **1239** |

Le delta est constitué des trois seuls `TS2307` de
`apps/web/__tests__/lentille/shared-law-dist-parity.test.ts`, qui importe
`packages/shared/dist/utils/*.js` en chemin **relatif** — hors des `paths`, par
construction, puisque vérifier la parité source/`dist` est sa raison d'être.
L'en-tête du garde jurait l'inverse, en troisième de trois sources de dérive
« vérifiées et absentes ».

**Ce défaut est déjà corrigé par la PR #3385**, et mieux que ne le faisait ma
première rédaction : là où j'avais écrit un `require_shared_dist` vérifiant
l'existence d'un RÉPERTOIRE, #3385 résout la **déclaration `.d.ts`** effectivement
consultée par TypeScript — ce qui détecte aussi un build PARTIEL, sans coder en
dur ni chemin ni nom de fichier. Mon correctif a donc été **retiré de ce lot** :
deux PR réécrivant le même bloc d'en-tête produiraient un conflit certain pour
zéro gain.

Ce lot n'y laisse qu'un fait : ce que #3385 conclut du symptôme §2.

## 4. Le désaccord entre les deux sessions, et sa résolution

La PR #3385 a rencontré **les deux mêmes témoins rouges**, et a écrit :

> Ce n'est pas une régression de `main` : ils échouent à l'identique au commit
> `f69cbd26`, dont le job « Test gateway » est vert. La recette ne reproduit donc
> pas la CI aussi complètement qu'elle l'affirme.

Le raisonnement est correct ; sa prémisse tacite ne l'est pas.
**« La CI de ce commit est verte » se lit comme une propriété du COMMIT, alors
que c'est une propriété du commit ET de l'INSTANT où le job a tourné.** Pour une
panne pilotée par l'horloge, les deux se séparent : la CI de `f69cbd26` avait
tourné avant l'expiration des 24 h, la session mesurait après. Même arbre, même
commande, deux verdicts — et aucun défaut de recette.

Le run de `main` à `HEAD` (`32633238504`, 10:15Z) tranche : *Test gateway* en
**failure**, sur exactement ces deux témoins, nommés dans le log.

> Un vert de CI est **horodaté**. Devant un rouge local qu'un vert distant
> contredit, la question n'est pas seulement « quel arbre ? » mais « QUAND ? ».
> Si l'écart entre les deux mesures franchit une frontière temporelle du code
> testé, le vert distant est PÉRIMÉ, pas contradictoire.

Le prix de l'inversion est concret : un `main` en train de casser a été rangé
dans des « Future Considerations », comme un défaut d'outillage local. **Un
défaut attribué à l'outil de mesure cesse d'être cherché dans le produit.**

Aucun reproche de méthode dans l'autre sens : #3385 a trouvé et corrigé le défaut
du cliquet (§3) que ce lot-ci n'aurait pas su corriger aussi bien.

## 5. Ce que le lot pose

- [x] `makeMessageRecord` complétée (`createdAt` frais, `messageType`) — la
      fenêtre d'édition est exercée par fraîcheur, non contournée par `NaN`.
- [x] Les deux littéraux de date absolue retirés ; le job *Test gateway* de
      `main` repasse au vert.
- [x] ROUGE prouvé sur 2 mutations, une par garde, sans débordement.
- [x] Leçons 252 (la bombe à retardement, et la fabrique qui l'arme) et 253
      (un vert de CI est horodaté).
- [x] Correctif du cliquet **retiré** au profit de #3385, plus complet.

## 6. Suivis

- [ ] **Dépendance** — si la PR #3385 ne fusionne pas, le défaut du cliquet
      (§3) reste ouvert : le garde continuera d'accuser d'un +3 tout poste qui
      n'a pas construit shared, avec un `top_offenders` nommant des fichiers
      étrangers à la modification.
- [ ] **Hérité du cycle 107 bis — la bivariance.** Aucune porte typée
      n'attrapera une charge divergente tant que `strictFunctionTypes` vaut
      `false`. Décision à instruire, elle dépasse Socket.IO.
- [ ] **Hérité, avec recomptage** — le cast côté web. Le cycle 107 bis annonçait
      **trois** sites dans `VideoCallInterface.tsx` ; j'en compte **cinq**
      (229, 488, 522, 549, 638), plus trois du même motif sur `window` et
      `constraints` dans ce seul fichier. #3385 en recense **13** sur 4 fichiers.
      À noter avant de s'y attaquer : `(x as unknown).membre` est une erreur
      `TS2571` franche — **108** occurrences de ce code dans la dette de
      `apps/web`, dont 95 sites `as unknown).`. C'est une cicatrice de codemod
      (`any` → `unknown` appliqué sans relecture), rendue invisible par
      `ignoreBuildErrors: true` dans `next.config.ts`. Les fermer **fait
      descendre** le cliquet.
- [ ] **Hérité** — trois services (`CallCleanupService`,
      `StoryTextObjectTranslationService`, `NotificationService`) prennent encore
      un `Server` NU pour ÉMETTRE.
- [ ] **Neuf — la classe « bombe à retardement » est-elle peuplée ?** 1057
      littéraux de date absolue dans les témoins de la passerelle. La classe est
      largement **auto-purgeante** : une date absolue contre une fenêtre COURTE
      tombe le jour même, donc tout ce qui passe aujourd'hui est soit injecté par
      `now`, soit indépendant de la fenêtre. Le cas dangereux est étroit — une
      fenêtre LONGUE (24 h) et un littéral écrit le jour même. Aucun balayage
      n'est proposé ici : le cycle 107 a payé sept faux positifs pour un garde
      trop large, et je n'ai pas de discriminant sans bruit. À reprendre si un
      second cas apparaît — deux occurrences feraient un motif.
