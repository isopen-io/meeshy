# Cycle 178 — la prédiction du cycle 176 s'est réalisée en trois heures, et la convergence est ce qui rend la septième gratuite

*2026-11-18. Branche `claude/exciting-planck-8hretq`, partie de la tête de `dev`
(`65738b005`). Livre **#19604** (le point de convergence des réactions) et
**#19676** (le sixième transport, ouvert par ce cycle), et ouvre **#19677** (la
taille de la dette).*

---

## Le point de départ, et ce que la mesure en a corrigé

Le cycle 177 s'est clos sur cinq suivis. J'ai pris #19604 — « la loi
d'appartenance se pose au point de CONVERGENCE des réactions, comme elle l'est
déjà pour les messages » — parce que c'est le seul des cinq qui soit entièrement
dans la passerelle, donc prouvable dans ce conteneur.

Son énoncé portait **trois affirmations**, et deux étaient fausses.

### Mesure 1 — « DEUX lookups, `:116` et `:172` » : il n'y en a qu'UN

```
ReactionService.ts:125   participants: { where: { isActive: true } }   ← l'include d'addReaction
ReactionService.ts:163   « `GET /conversations` filtre `isActive: true` »  ← un COMMENTAIRE
ReactionService.ts:173   « a posé pendant trente-sept cycles `isActive: false` » ← un COMMENTAIRE
```

Les deux adresses citées par l'issue désignent des commentaires qui CITENT la
graphie pour la commenter. C'est exactement le motif que le cycle 177 avait
rencontré en écrivant son cliquet (« sans quoi il retrouverait les doc-comments
qui CITENT l'idiome pour l'interdire »), ici du côté de l'inventaire plutôt que
du balayage.

Et les deux `participant.findMany` du service ne sont pas des portes : ils
servent l'AFFICHAGE du trombinoscope des réacteurs, par id de réaction.
Resserrer là retirerait le nom de l'auteur d'une réaction passée — ce n'est pas
une porte, c'est une archive.

### Mesure 2 — #19603 n'est pas une dépendance de ce lot, et c'est démontrable

L'issue posait comme critère de fin d'« instruire la question de la RÉTRACTATION
avant de resserrer (#19603) : le service est précisément l'endroit où la décision
écrite sur l'axe CLÔTURE vit ». Instruit :

**`removeReaction` n'interroge AUCUNE ligne de participation.** Il supprime par
le triplet `messageId`/`participantId`/`emoji` (`deleteMany`), et le seul lookup
du service vit dans `addReaction`. Resserrer la convergence ne peut donc pas
toucher l'axe du retrait — mesuré, pas raisonné : `conversationClosedWriteVerbs.test.ts`
§ 3, le témoin qui gèle le choix de la clôture, est **vert avant et après**.

L'arbitrage de #19603 reste donc entier, et il se décidera là où il est
effectivement appliqué : aux portes de #19525.

### Mesure 3 — « ce n'est pas un trou vivant » était vrai à 06h04, et faux à 10h37

C'est la mesure qui a changé le lot. L'issue prenait soin de qualifier le
constat :

> Ce qui reste est une **promesse non tenue** : […] un sixième transport qui
> résoudrait son participant à la main ne rougirait nulle part.

**Le sixième transport était déjà dans `dev`.** #19650 a créé
`services/gateway/src/services/calls/callReactionOnBubble.ts` le même jour —
#19525 a fusionné à ~03h05, #19604 a été ouverte à 06h04, et ce fichier est
arrivé à ~10h37 — avec la graphie NUE :

```ts
where: { conversationId, userId: input.userId, isActive: true }
```

Et ce n'est pas un piège armé. Le seul verrou en amont,
`resolveActiveCallParticipant`, ne pose **que** la question de la participation à
la SESSION D'APPEL :

```ts
const activeParticipant = callSession.participants.find(
  (p) => ((p.participant?.userId ?? p.participantId) === userId) && !p.leftAt
);
```

Aucune question d'appartenance à la CONVERSATION. Un membre banni **pendant**
qu'il est dans l'appel — un modérateur qui bannit en cours d'appel, le cas
nominal — garde sa ligne de session, passe le verrou, et son emoji :

1. est **persisté** comme réaction sur la bulle « Appel … en cours » du fil ;
2. part en **`reaction:added` à `conversation:<id>`** — la room de la
   conversation dont il vient d'être banni ;
3. fait **remonter cette conversation en tête de liste** de chaque participant
   (`recordConversationActivity`) ;
4. crédite l'axe d'engagement et note l'interaction de paire.

Ouvert en **#19676** et livré ici.

## Le lot

| site | avant | après |
|---|---|---|
| `ReactionService.addReaction` (convergence, #19604) | `participants: { where: { isActive: true } }` | `participants: { where: PARTICIPATION_VIVANTE }` |
| `callReactionOnBubble` (6e transport, #19676) | `{ …, isActive: true }` | `{ …, ...PARTICIPATION_VIVANTE }` |

Le sens ne s'inverse pas : ces deux `where` disent qui a le **DROIT D'AGIR**,
donc la loi la plus étroite — à l'inverse d'une liste d'EXCLUSION, qui se
construit sur le sur-ensemble (#16690).

### Les témoins : deux par site, et aucun ne subsume l'autre

Le CLAUDE.md du service l'écrit : « un mock Prisma rend ce qu'on lui dit quel que
soit le `select` ». Le témoin EXISTANT de `callReactionOnBubble` en est la
démonstration — `findFirst: async () => ({ id: 'p-bob' })` rend l'auteur quel que
soit le `where`, donc la mutation de la loi y reste VERTE.

- **COMPORTEMENT** par `findFirstIn` / `findUniqueIn` (`__tests__/helpers/mongo-where.ts`),
  le double partagé qui refuse ce que le vrai client refuse — clé ABSENTE traitée
  comme absente, `isSet` connu.
- **PROJECTION** sur la requête, qui seule voit un `where` que personne n'honore
  en test, et qui assert `PARTICIPATION_VIVANTE` **par la constante**, jamais par
  une copie de sa forme.

Chaque témoin construit la DIVERGENCE : une ligne `isActive: true, bannedAt ≠ null`,
celle que le filtre nu laisse passer. **Un témoin posé sur une ligne saine ne peut
pas tomber** — la loi et le filtre nu y rendent le même verdict (règle du
cycle 175).

### Et le double partagé a dû apprendre `include`

`findUniqueIn` ne connaissait que `select` et REJETAIT `include`. Or la porte de
la convergence vit précisément dans un `where` imbriqué sous un `include`
(`conversation: { include: { participants: { where: … } } }`) : sans cette
extension, il n'existait aucun témoin de comportement possible sur ce site, et
c'est probablement pourquoi il n'en avait pas.

La différence n'est pas cosmétique : `select` énumère ce qui sort, `include` rend
TOUS les scalaires **plus** la relation nommée, dont le `where` filtre les
lignes. `hydrate()` porte la distinction, refuse les deux ensemble au même niveau
comme Prisma le refuse, et la sémantique du `where` reste chez
`matchesMongoWhere` — une seconde jumelle de cette règle serait libre de diverger
de la première.

## Preuve

- **RED d'abord**, poussé avant la logique (`a2a2c6ea…`, doctrine de la branche
  poussée tôt) : **4 témoins sur 6 rouges** sur l'arbre de `dev`, et les deux
  verts sont les deux NON-RÉGRESSIONS — elles doivent passer avant comme après,
  c'est ce qui prouve que resserrer ne refuse rien de légitime ;
- après : **6/6 verts** ;
- **les 101 suites qui consomment le double partagé** : 2 047 témoins verts
  (l'extension `include` ne casse rien de ce que 126 fichiers en attendaient) ;
- **la famille réaction + appels + la garde de clôture** : 79 suites,
  1 114 témoins verts, `conversationClosedWriteVerbs.test.ts` compris ;
- `tsc --noEmit` sur `services/gateway` : **EXIT=0** ;
- suite COMPLÈTE du gateway : voir § ci-dessous ;
- **aucun client ne change** : ces deux sites sont des portes serveur. Rien à
  porter sur iOS, le web ou Android.

## Ce que ce cycle ouvre, avec sa TAILLE

Les deux lots qui ont précédé ont chacun fermé la graphie nue « sur les sites
qu'ils touchaient », et aucun n'a dit combien restait. Compté ici — balayage des
lookups `prisma.participant.{findFirst,findUnique,findMany,count,updateMany,aggregate}`
dont le `where` porte `isActive: true` sans la loi, commentaires dépouillés,
`__tests__` exclus, sur 1 717 fichiers :

```
199 sites
```

**Les 199 ne sont pas 199 défauts**, et c'est ce qui fait de #19677 un lot et non
un correctif : la loi étroite est juste pour une porte, FAUSSE pour une liste
d'exclusion ou un nettoyage (sur-ensemble, #16690), et à instruire pour une
audience de diffusion. Le tri par famille EST le travail. Un cliquet posé sur un
inventaire faux transformerait une erreur de mesure en vérité de dépôt — le
cycle 107 avait JETÉ son balayage plutôt que de le geler, et c'était le bon
geste.

## Suivis

- **#19677** — la dette des 199 sites, triée par famille, avec son balayage dans
  le dépôt (jamais dans un journal : cycle 87 bis).
- **#19603** reste ouverte et INTOUCHÉE, instruite ci-dessus : elle se décide aux
  portes de #19525, pas à la convergence.
- Les quatre autres suivis du cycle 177 restent ouverts : **#19612** et **#19613**
  (self-test du cliquet de verrouillage, format de `bun.lock`), **#18062** et
  **#19654** (les deux rouges de `dev` qui ne appartiennent à personne), et
  **#18760** — quatrième session de suite.
