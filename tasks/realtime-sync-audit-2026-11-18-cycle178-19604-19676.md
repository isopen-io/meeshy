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

Aucune question d'appartenance à la CONVERSATION. Avec une ligne vivante ET
bannie, l'emoji :

1. est **persisté** comme réaction sur la bulle « Appel … en cours » du fil ;
2. part en **`reaction:added` à `conversation:<id>`** — la room de la
   conversation dont la personne est bannie ;
3. fait **remonter cette conversation en tête de liste** de chaque participant
   (`recordConversationActivity`) ;
4. crédite l'axe d'engagement et note l'interaction de paire.

Ouvert en **#19676** et livré ici.

### Mesure 3 bis — et ma première explication du CHEMIN était fausse

Publiée dans le commit, le commentaire de code, l'issue, la PR et la leçon :
« un membre banni **pendant** qu'il est dans l'appel ». **Réfutée par l'audit
adversarial du lot**, et il avait raison :

```
resolveBanWrite(participant, bannedAt)        ← conversationBanState.ts, SEUL écrivain de bannedAt
  participant.isActive === false  ⇒ { bannedAt }
  sinon                          ⇒ { bannedAt, isActive: false, leftAt: bannedAt }
```

Bannir un membre ACTIF écrit donc `isActive: false` : **le filtre NU refusait
déjà ce cas**, et le bannissement appelle en prime
`endCallParticipationForDepartedMember`, qui sort la personne de l'appel.

Le producteur réel est une COURSE entre une rentrée et un bannissement, et il
est pire que ce que j'avais écrit parce qu'il ne demande aucune ligne héritée :

| t | | état de la ligne |
|---|---|---|
| t1 | invitation d'un ex-membre non banni ⇒ `outcome: 'rejoin'` | `isActive: false` |
| t2 | un modérateur bannit ; la cible est lue `isActive: false` ⇒ `resolveBanWrite` n'écrit QUE `bannedAt` | `isActive: false` |
| t3 | le bannissement commet | `isActive: false, bannedAt` |
| t4 | l'invitation commet `{ ...REJOIN_PARTICIPANT_STATE }`, qui rallume `isActive` et n'efface PAS `bannedAt` | **`isActive: true, bannedAt ≠ null`** |

`REJOIN_PARTICIPANT_STATE` laisse `bannedAt` délibérément, et sa note dit
pourquoi : « une rentrée ne débannit personne, et les trois portes refusent un
banni **en amont** ». C'est le pari, et il ne tient pas dans la fenêtre t1→t4 :
les trois portes de rentrée n'ont pas la garde que `restore-for-me` porte DANS
son `where`, dont le commentaire nomme exactement cette course. Ouvert en
**#19688**, et c'est le lot qui TARIT la source.

> **Une leçon de méthode juste, bâtie sur une instance fausse, est plus
> dangereuse qu'une leçon absente** — c'est elle que le prochain auditeur citera
> comme prémisse, et il la citera avec confiance parce que la méthode tient.
> Vérifier l'instance tenait en une commande : énumérer les `data:` qui écrivent
> la colonne. Il y en a UN.

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

## L'audit adversarial, et les trois choses qu'il a BLOQUÉES

Le lot a été soumis à l'agent `auditeur-adversarial` avant fusion (directive
#9226, un lot de contrôle d'accès). Il n'a pas bloqué le code — « les deux
resserrements sont justes, la loi la plus étroite est le bon choix pour un `where`
de droit d'agir, aucun consommateur du sur-ensemble n'en est affecté » — et il a
bloqué **trois** choses, dont deux étaient du TEXTE. Les trois sont corrigées ici.

### a-1 — le `where` que ce lot venait de réécrire répondait faux à une SECONDE question

`input.userId` vient de `resolveActiveCallParticipant`, dont le doc-comment dit
que ce champ **retombe sur le `Participant.id` pour un invité de lien** (pas de
ligne `User` à viser). `where: { userId: <Participant.id> }` n'apparie donc rien,
et le symptôme est un `return false` SILENCIEUX : **l'emoji d'un invité de lien
n'atterrissait jamais sur la bulle du fil**, quand celui de tout inscrit y
atterrissait. Le `CLAUDE.md` du service documente exactement ce piège (« une
requête `Participant` sur cette clé doit choisir sa COLONNE […] le symptôme est
une liste VIDE, pas une erreur »), et la graphie juste — `participantKeyWhere`,
#10473 — vit à vingt lignes de là, dans le module dont ce lot cite le verrou.

> **Toucher une ligne au nom d'une loi n'exempte pas de relire les AUTRES
> questions qu'elle pose.** J'ai audité ce `where` sur l'appartenance, qui était
> ma question, et j'ai recopié l'identité sans la lire. Un `where` répond à
> autant de questions qu'il a de clauses.

Les deux prédicats se composent par **`AND`** et jamais par double spread :
chacun rend une clé `OR`, et le second écraserait le premier en silence. Un
témoin assert cette forme, parce qu'un commentaire ne rougit pas.

### d-1 — la primitive partagée est arrivée sans un seul témoin à elle

L'audit l'a mesuré par mutation : faire que `include` se comporte comme `select`
— détruire précisément « la différence qui décide d'un défaut d'appartenance » —
laissait **2 047 témoins verts** sur les 101 suites consommatrices. Retirer le
garde-fou `select` + `include` passait de même.

`__tests__/helpers/mongo-where-include.test.ts` existe maintenant, et il tombe
sous les **quatre** mutations, dont la plus coûteuse — celle du sens PERMISSIF.

> **Une primitive de test est du code de production pour les témoins qui la
> consomment.** Le dépôt l'écrit déjà dans l'autre sens (« un double de test ment
> aussi par ce qu'il ACCEPTE ») ; la conséquence est que **ce qui atteste doit
> être attesté**, et que « les 2 047 témoins consommateurs passent » ne mesure
> pas la primitive — il mesure qu'aucun d'eux ne l'interroge.

Et trois écarts à Prisma sont corrigés dans le même geste, par un seul
discriminant : `where`/`take` ne sont valides que sur une relation TO-MANY. Un
to-many absent du document rend donc `[]` et non `null` (sans quoi un `.some()`
JETTE, ce qui rend vert tout témoin assertant un `rejects.toThrow()` sans
message) ; un `where` posé sur une relation to-one est REFUSÉ au lieu de laisser
passer le document non filtré ; et une relation to-many que l'`include` ne nomme
pas n'est plus reportée — c'était le seul écart **permissif**, celui qui rend un
témoin vert sur une garde inerte. Les deux écarts qui SUBSISTENT (composite
indistinguable d'une to-one, scalaire absent non null-rempli) sont gelés **comme
écarts** : un écart documenté par un témoin se relit comme une décision, un écart
tacite comme un bug.

### Ce que l'audit a trouvé À CÔTÉ, et qui ne part pas dans ce lot

Quatre constats hors périmètre, chacun devenu une issue plutôt qu'une ligne de
ce journal. Le plus instructif est **#19689** : la porte d'ENTRÉE dans l'appel
(`call-participants.ts:38`) épelle la loi NUE, donc une ligne vivante et bannie
**rejoint l'appel** — signalisation, média, audio et vidéo. C'est la leçon 275
retournée contre ce lot : *j'ai mesuré la protection sur la chaîne (l'emoji) et
pas sur ce qui voyage à côté (le flux live), dans le fichier même dont mon
commentaire cite le verrou.*

**Je ne l'ai pas corrigée ici, et la raison est celle de ce cycle.** Ce module
déclare HUIT gardes de sévérité croissante et son doc-comment prévient que « s'en
tromper ne lève rien » : fermer celle-là seule serait exactement le geste
porte-par-porte dont la leçon de ce lot dit qu'il tient trois heures. La question
de #19689 n'est pas « cette ligne est-elle juste ? » mais « **lesquelles des huit
portent la loi ?** », et c'est un lot d'instruction.

## Suivis

- **#19688** — les TROIS portes de rentrée, producteur VIVANT de l'état que toute
  cette famille refuse. À traiter **avant** #19677 : tarir la source rend les 199
  resserrements moins urgents, et l'inverse n'est pas vrai.
- **#19689** — la porte d'entrée dans l'appel, et les sept autres gardes du module.
- **#19690** — « Ensemble » inerte pour toute la population (`leftAt: null` en
  égalité sous MongoDB), trouvé en chemin, hors périmètre.
- **#19691** — les trois jumelles de la réaction sans loi à leur convergence : la
  prédiction de #19604 leur est intacte.
- **#19677** — la dette des 199 sites, triée par famille, avec son balayage dans
  le dépôt (jamais dans un journal : cycle 87 bis).
- **#19603** reste ouverte et INTOUCHÉE, instruite ci-dessus : elle se décide aux
  portes de #19525, pas à la convergence.
- Les quatre autres suivis du cycle 177 restent ouverts : **#19612** et **#19613**
  (self-test du cliquet de verrouillage, format de `bun.lock`), **#18062** et
  **#19654** (les deux rouges de `dev` qui ne appartiennent à personne), et
  **#18760** — quatrième session de suite.
