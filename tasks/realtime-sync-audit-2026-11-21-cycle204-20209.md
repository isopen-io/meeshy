## Cycle 204 — le QUATRIÈME genre de porte : l'appelant nommé dans un FILTRE DE RELATION (#20209)

**Date** : 2026-11-21. **Base** : `dev` à `cfbdc6eada`. **Issue** : #20209.
**Milestone** : #286.

### D'où vient ce lot : un critère de ROUGE qui a échoué

Ce cycle a commencé sur #20155 — « construire le cliquet des portes ». Son
critère de fin exige que la preuve de ROUGE **nomme #20104, #20135 et #20136**.
La sonde a été écrite, passée sur les trois arbres d'avant, et **elle a
échoué** : 1 porte relevée, 0 avec refus.

C'est l'échec qui a rendu le lot. Les trois défauts de référence ne sont pas de
la même espèce :

| genre | où l'appelant est NOMMÉ | référence | instrumenté par |
|---|---|---|---|
| **CLAUSE** | le `where` | #20135 | rien (36 sites avec refus, mesurés) |
| **PRÉDICAT** | un `.find`/`.some` en CODE sur une liste large | #20104, #20136 | **plus rien** |
| **PROPRIÉTÉ** | une colonne d'appartenance d'une AUTRE table | la 7e porte de #20183 | rien, jamais (15 sites avec refus) |
| **FILTRE DE RELATION** | `participants: { some: { userId … } }` | **ce lot** | rien, **par décision écrite** |

> **Un critère de ROUGE qui exige qu'un instrument nomme trois défauts suppose
> qu'ils sont de la même espèce.** Celui de #20155 ne pouvait pas être tenu, et
> c'est en essayant de le tenir qu'on apprend pourquoi. Un critère de fin est
> une affirmation comme une autre.

Et le genre PRÉDICAT a perdu son seul porte-voix : #20104 vivait dans
l'inventaire des audiences sous une famille écrite pour lui
(`porte-sur-un-sur-ensemble`, « PORTE, et c'est un défaut OUVERT »), que son
correctif a **retirée avec son dernier site** — la règle « aucun refus périmé »
appliquée correctement, dont personne n'avait mesuré qu'elle emporte les **NOMS**
en même temps que les clés.

### Le quatrième genre, et pourquoi aucun instrument ne le voit

Le balayage des audiences s'arrête explicitement avant ces filtres :

> « La traversée s'arrête aux combinateurs. Elle n'entre pas dans un filtre de
> RELATION (`conversation: { participants: { some: { userId } } }`) : un `userId`
> là-dedans ne désigne pas le membre lu, il désigne une conversation. »

Juste **pour ce que ce balayage mesure**. Faux comme conclusion sur ce que la
clause AUTORISE : ce `userId` désigne précisément **ce que l'appelant a le droit
d'OUVRIR**.

**Mesuré : 30 filtres de relation keyés sur l'appelant dans
`services/gateway/src`. ZÉRO n'épelait la loi.** Pas un seul.

### Les quatre que ce lot ferme

| site | ce qu'un banni-mais-actif obtenait |
|---|---|
| `routes/conversations/core-list.ts` | **`GET /conversations`, la liste principale du produit** |
| `routes/conversations/list-cursor.ts` | la même liste, au curseur |
| `routes/conversations/search.ts` | **la RECHERCHE** — la conversation et son contenu indexé |
| `routes/communities/core.ts` | les conversations de la communauté |

### Et l'un d'eux AFFIRMAIT la loi qu'il n'appliquait pas

`communities/core.ts`, trois lignes au-dessus de sa clause : « une participation
ACTIVE (**ni partie, ni bannie**) », au-dessus d'un `{ userId, isActive: true }`
— et **invoquant comme preuve la jumelle `core-list.ts`, qui ne la portait pas
davantage**.

> **Un commentaire qui invoque une JUMELLE comme preuve de conformité est une
> affirmation DOUBLE** : il affirme la règle, et il affirme que l'autre site
> l'applique. Les deux moitiés étaient fausses. Quatrième affirmation fausse de
> cette série de cycles, après `messages-send.ts` (#20183) et la NOTE de
> `sendSuccess` (#20190).

### Le piège de forme, et pourquoi il décide du correctif

`core-list.ts` porte **déjà** une clé `OR` (`deletedForMe`, null OU absent — la
raison en est écrite sur place : 10 documents hérités sur 716 en production).
Y étaler `...PARTICIPATION_VIVANTE` **écraserait ce `OR`** — le seul piège
d'`unsetOrNull` — et ferait disparaître de la liste toute conversation dont la
ligne héritée ne porte pas le champ. D'où `AND: [PARTICIPATION_VIVANTE]`, et
d'où un témoin qui mesure l'erreur : sous la forme étalée, **la garde de
bannissement disparaît** (le `OR` littéral gagne), et le témoin le prouve.

### Le ROUGE, et la leçon sur les témoins qui le portent

| mesure | résultat |
|---|---|
| les quatre clauses remises NUES — gardes de SOURCE | **4 rouges** |
| le curseur, clause **CAPTURÉE** de la production | **3 rouges** (dont le verdict de comportement) |
| le témoin #19541 réparé, clause de communauté remise nue | **2 rouges** (2 salons servis au lieu de 1) |
| après correctif, surface touchée | **248 suites / 3272 témoins verts**, `tsc` à 0 |

**Un verdict posé sur une COPIE de la clause décrit la LOI, pas le site.** Les
quatre clauses vivent dans des littéraux inline ; seul `resolveListCursor` est
exporté, donc seul lui permet de CAPTURER le `where` de la production et de le
faire juger sur des lignes. Le fichier le dit à voix haute, et les gardes de
source font le pont pour les trois autres : si un site revient à `isActive` nu,
elles tombent. Rendre les trois exerçables demande de monter leurs routes —
suivi de #20209, pas ce lot.

### Le témoin qui s'appelait « ni quitté ni BANNI » et ne testait que « quitté »

`salons-actifs-19541.test.ts` portait un témoin nommé « ne sert ni le salon
quitté ou **banni** ». Sa fixture disait :

```ts
// le lecteur l'a quitté (ou en a été banni : même écriture, `isActive: false`)
```

Vrai du chemin NOMINAL depuis #19688. **Faux des lignes héritées d'avant #10436**
— celles que ce milestone entier vise. Le témoin modélisait donc le salon
QUITTÉ et l'appelait banni : **il ne pouvait pas voir le seul état pour lequel la
loi existe.**

Et son double ne pouvait pas l'exprimer. Son matcheur était
`Object.entries(filter).every(([k, v]) => row[k] === v)` — une égalité STRICTE
qui ne sait dire ni `OR`, ni `{ isSet: false }`, ni `AND`. Conséquence :
resserrer la production faisait **disparaître toutes les lignes**, et le témoin
rougissait sur un correctif juste.

> **Un double ad-hoc ment aussi par ce qu'il REFUSE** — le jumeau de « un double
> ment par ce qu'il ACCEPTE ». Une clé qu'il ne comprend pas, il l'évalue
> `undefined === valeur`, donc il refuse : il rend FAUX tout resserrement, et
> son auteur conclut que le correctif est mauvais. Le remède est la sémantique
> UNIQUE du dépôt (`matchesMongoWhere`), qui traverse les filtres de relation
> et sait qu'un champ ABSENT n'est pas un champ à `null`.

Le double emploie désormais cette sémantique, et la fixture manquante — le
lecteur **actif-et-banni** — est posée.

### Ce que ce lot ne touche pas, et c'est inventorié par un témoin

Les 30 filtres ne se resserrent pas en bloc : trois raisons distinctes
l'interdisent, et les confondre rouvrirait ce qu'on vient de fermer.

| ce qui reste large | la raison |
|---|---|
| la branche `withUserId` de la liste (deux `some`, un `every`) | recherche d'un TÊTE-À-TÊTE entre deux comptes NOMMÉS : le `every` est une contrainte de composition, et sa polarité s'inverse au resserrement |
| `callGroupConversation.ts`, `callHistoryList.ts` en `none:` | une EXCLUSION se construit sur le SUR-ENSEMBLE (loi #16690) : resserrer un `none` RETIRE du refus |
| `search.ts` `userId: { in: matchingUserIds }` | nomme un ENSEMBLE apparié, pas l'appelant |
| `directPair.ts`, `InitService.ts`, `call-invite-lifecycle.ts` | égalités de PAIRE : resserrer un côté les fait DIVERGER — le net-négatif de #20093 |
| `list-viewer-scope.ts` `{ userId, role: 'creator' }` | la visibilité d'un tête-à-tête VIDE, qui ne porte même pas `isActive` — question de produit |

### La population exposée, dite honnêtement

Le chemin nominal de bannissement écrit `isActive: false` (#19688), donc ces
filtres excluaient déjà le banni ordinaire. La population atteinte est celle que
tout ce milestone vise : les lignes `isActive: true, bannedAt ≠ null` héritées
d'avant #10436, dont le dépôt dit qu'elles existent en base sans migration. Ce
n'est pas une fuite de masse — c'est le même sur-ensemble que les cinq portes de
#20183, atteint par la surface la plus visible du produit.

---

## La CI a rendu ce que ma sélection de gates ne pouvait pas voir

`Tests · gateway · tranche 3/3` **rouge** sur la tête du lot, et la cause était
à moi : mon commentaire portait `routes/conversations/core-list.ts` de **999 à
1011 lignes**, au-delà du seuil de 1000 que `gateway-file-size-budget.test.ts`
tient (règle 1 : aucun fichier neuf hors budget ; règle 3 : le cumul ne remonte
pas).

**Pourquoi mes gates locaux ne l'ont pas vu.** J'avais lancé
`src/__tests__/unit/routes/conversations`, `…/communities`,
`src/socketio/__tests__/` et `src/routes/__tests__/` — la surface *touchée*. Le
budget de taille vit à la RACINE (`src/__tests__/gateway-file-size-budget.test.ts`)
et balaie le dépôt ENTIER.

> **Une sélection de gates par « ce que mon diff touche » ne voit pas les
> cliquets dont la portée est le DÉPÔT.** Taille de fichier, dette de types,
> table des routes, promesses détachées, cohésion : ils ne vivent pas près du
> code qu'on change, et c'est précisément leur raison d'être. Le raccourci
> « je lance les suites du répertoire que je modifie » est juste pour les
> témoins de comportement et faux pour les cliquets globaux.

### Et la contrainte a rendu le lot MEILLEUR

Le fichier était à **999** sur `dev` : une ligne de marge, zéro après l'import.
La directive du dépôt est claire — « un fichier qui dépasse se DÉCOUPE […]
ajouter à un fichier déjà hors budget est interdit : on extrait d'abord, on
ajoute ensuite ». Le périmètre de base de la liste est donc parti dans
`utils/list-viewer-scope.ts`, le module dont le doc-comment dit lui-même qu'il
existe pour cette raison (« extraites de `core-list.ts` (budget de taille) »).

`core-list.ts` : **999 → 980**. Et surtout, `conversationListScope` est
désormais **exportée** — ce qui règle la faiblesse que ce même journal nommait
trois paragraphes plus haut :

| témoin | avant l'extraction | après |
|---|---|---|
| la LISTE | copie de la clause ⇒ décrit la LOI | **capture la production** ⇒ 2 rouges à la mutation |
| le CURSEUR | capture déjà | capture |
| recherche, communauté | copie + garde de source | inchangé (suivi) |

> **Un budget de taille n'est pas une taxe, c'est une question.** Celle-ci était
> « pourquoi la clause qui décide ce qu'un lecteur peut ouvrir vit-elle dans un
> littéral inline de mille lignes ? » — et la réponse a rendu la moitié des
> verdicts de ce lot exerçables contre la production.
