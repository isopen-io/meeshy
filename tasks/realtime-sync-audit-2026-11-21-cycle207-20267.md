## Cycle 207 — le relevé « qui LIT cet événement » comptait un doc-comment comme un lecteur, et ne résolvait pas les cartes de noms de DOMAINE (#20267, #20268)

**Date** : 2026-11-21. **Base** : `dev` à `0111884c9`. **Issues** : #20267 (l'instrument), #20268 (la décision produit que la mesure a rendue).

### D'où vient ce lot

Du cycle 206. Son applieur web a fait rougir `socket-event-platform-parity-gate`
dans son SECOND sens (« lu par cette plateforme, à sortir de l'inventaire »), ce
qui a mis le relevé sous les yeux — et la question de la leçon 261 avec lui :
**cette liste mesure-t-elle la propriété, ou seulement le mot par lequel on la
trouve ?**

### Le défaut, en deux moitiés qui se COMPENSAIENT

`client-event-readers.ts` est partagé par DEUX gardes : l'orphan gate (« cet
événement, personne ne le lit ») et la parity gate (« deux clients le lisent, le
troisième l'ignore »).

**1. Les commentaires ne sont pas retirés du balayage.** Six citations du relevé
sont des doc-comments — et **deux disent le CONTRAIRE de ce que le relevé en
conclut** :

| citation fantôme | ce que la phrase dit |
|---|---|
| `battery:pull-requested` (web) | « le web REÇOIT, il n'émet pas … **cet onglet n'écoute pas l'événement** » |
| `user:preferences-community-reordered` (android) | « **stays unheard**: measured, nothing under `apps/android` caches a community-preference row » |
| `pack:installation-updated` (web, ios) | une comparaison, et le commentaire d'un cas d'énumération |

C'est le sens d'erreur qui ne crie pas : un lecteur de trop, donc une asymétrie
ou un orphelin de MOINS — exactement ce que les deux gardes cherchent.
`withoutComments` vit dans le module VOISIN, exporté, et déjà employé par les
relevés de contrat du même répertoire.

**2. Les cartes de noms de DOMAINE ne sont pas résolues.** Le `CLAUDE.md` de
`packages/shared` prescrit que certains noms vivent dans `*-event-names.ts`
« que les deux cartes répandent, pour que le socle n'importe pas la carte
entière (#9966) ». Il y a **18 de ces fichiers**, `SERVER_EVENTS` en ÉTALE 25, et
`constantValues()` ne lisait que `event-names.ts` : **55 noms du contrat étaient
irrésolubles**, donc un abonnement par la carte de domaine —
`socket.on(RELATION_SERVER_EVENTS.RELATION_LEVEL_RAISED, …)` — invisible.

**Les deux jouent en sens INVERSE** : la première invente des lecteurs, la
seconde en cache. Le solde mesuré est petit, et chacune de ses quatre lignes
faussait un inventaire :

| plateforme | abonnement RÉEL devenu visible | citation fantôme retirée |
|---|---|---|
| web | `authenticated` | `battery:pull-requested`, `pack:installation-updated` |
| android | — | `user:preferences-community-reordered` |
| ios | — | `pack:installation-updated` |

- **`authenticated` était inscrit à l'ORPHAN gate** — « ÉMIS … Aucun client ne
  le cite ; ils lisent l'accusé de la poignée de main ». Faux du WEB, qui
  l'écoute et y accroche ses rattrapages de reconnexion (#18573) : son nom vient
  de `session-event-names.ts`, donc le relevé ne pouvait pas le voir. Il passe à
  la parity gate, `absents: ['android','ios']`.
- **`user:preferences-community-reordered` figurait à la PARITY gate** sous
  « signaux que seul le miroir ANDROID cite ». Mesuré, **aucun client ne le
  cite** : c'est un ORPHELIN que l'orphan gate ne pouvait pas voir, la phrase
  « unheard » le sauvant. Il fait le chemin inverse, et sa décision produit est
  #20268.
- `battery:pull-requested` (asymétrie DÉCIDÉE : un onglet n'a pas de batterie à
  relever) et `pack:installation-updated` (Android le ROUTE ; iOS et le web
  relisent par REST, et `sticker:library-updated` qu'ils écoutent porte la
  BIBLIOTHÈQUE de stickers, pas la POSSESSION d'un pack) entrent à la parity
  gate avec leur raison mesurée.

### La leçon

> **Un relevé qui ne retire pas les commentaires ne mesure pas une propriété du
> code : il mesure ce que le code DIT de lui-même** — et parfois l'inverse exact.
> Une phrase qui déclare « je n'écoute pas X » est, pour un balayage textuel, la
> meilleure preuve que X est lu ici.

C'est la leçon du cycle 206 (« une négation est l'affirmation la moins relue »)
vue depuis l'instrument : là-bas une négation PÉRIMÉE trompait un lecteur
humain ; ici une négation VRAIE trompe un cliquet, et dans le sens qui l'endort.
Détail : `tasks/lessons/2026-11-21-un-releve-qui-ne-retire-pas-les-commentaires-mesure-ce-que-le-code-dit-de-lui-meme.md`.

Et la limite que le relevé s'écrivait — « cité ≠ branché … c'est une limite, pas
un silence : elle est écrite » — était honnête et parlait d'AUTRE CHOSE : du nom
cité mais non branché. Le cas mesuré ici est plus fort : le nom n'est pas cité
du tout, il est seulement RACONTÉ. **Une limite écrite protège contre le défaut
qu'elle nomme, et contre aucun autre.**

### Le correctif

- `withoutComments` appliqué à chaque source avant le balayage.
- `constantValues()` lit `event-names.ts` ET les dix-huit cartes de domaine, et
  rend AUSSI le nom des objets porteurs : `X.CLÉ` n'est accepté que sous un
  porteur de noms d'événements réellement déclaré. Résoudre `n'importe.CLÉ`
  ferait d'une propriété homonyme une citation — l'erreur du cycle 107
  (« un balayage qui cherche UN idiome mesure sa popularité »), dans l'autre
  sens.
- Les deux inventaires corrigés, chacun avec sa raison MESURÉE, dans le commit
  qui livre.

### La preuve

| mutation | ce qui tombe |
|---|---|
| les commentaires ne sont plus retirés | **3 rouges** — `user:preferences-community-reordered` (orphan), `battery:pull-requested` et `pack:installation-updated` (parity) redeviennent « lus », donc leurs entrées périment |
| les cartes de domaine ne sont plus lues | **3 rouges** — `authenticated` redevient « cité par AUCUN client » |

| gate | résultat |
|---|---|
| `vitest run __tests__/ci/` (shared) | **216 verts / 25 fichiers** |
| `tsc --noEmit` (shared) | **0** |

Les deux mutations tombent dans des assertions DIFFÉRENTES et sur des gardes
différentes : c'est ce qui distingue deux défauts d'un seul défaut vu deux fois.

### Ce que ce lot ne fait pas

- Il ne tranche pas #20268 : écrire le lecteur du réordonnancement de
  communautés, retirer l'émission ou retirer la déclaration est une décision
  produit, et les trois ont leur coût écrit dans l'issue.
- Il ne ferme pas la limite « cité ≠ branché » — mais il lui donne sa TAILLE,
  sur le web : des **167** événements que le CODE de `apps/web/src` cite, **163**
  ont un branchement reconnaissable sous l'une de QUATRE formes
  (`socket.on(NOM, h)`, une table de couples `[NOM, h]`, une carte
  `{ [NOM]: h }`, une LISTE de noms parcourue — ce que fait
  `call-socket-bridge.ts` pour vingt-six noms), et les **quatre** restants sont
  des listes EXPORTÉES que leur hôte parcourt dans un AUTRE fichier
  (`COMMUNITY_MEMBER_EVENTS` → `community-live.ts`,
  `CALL_LIVE_FRAME_SERVER_EVENTS`, `CALL_RECORDING_SERVER_EVENTS`). **La classe
  est VIDE pour le web** ; iOS et Android ne sont pas mesurés. Un relevé de
  branchements serait un lot à lui : son premier essai, qui ne voyait que
  `socket.on(`, rendait **soixante** faux positifs — il a été **JETÉ, pas
  gelé** (cycle 107), et c'est pour cela que le chiffre ci-dessus est donné avec
  les formes qu'il reconnaît, jamais seul. « Une limite assumée sans chiffre ne
  dit pas s'il y a un trou d'un site ou de quatre-vingt-dix. »
- `pack:installation-updated` manque à deux clients sur trois : la question
  « faut-il l'y porter ? » appartient au lot des vitrines, pas à l'instrument.

### Un accident du lot, consigné

Les deux fichiers de leçon ont été écrits avec leurs sous-titres en `## `, ce
que `journal-one-file-per-entry-guard` (passerelle) refuse : un fichier de
`tasks/lessons/` commence par `## ` et ne porte **qu'un seul** titre de ce
niveau hors bloc de code. Le gate l'a dit en une seconde, et il tourne dans les
« Gardes du dépôt » de la CI.

> **Les gardes de DOCUMENTATION se rejouent comme les autres.** Un lot dont la
> moitié est de la prose n'a pas moins de gates à passer : il en a d'AUTRES, et
> ce sont ceux qu'on oublie, parce qu'écrire un journal ne ressemble pas à
> toucher au code. Les deux commandes du lot :
> `npx jest src/__tests__/journal-one-file-per-entry-guard.test.ts src/__tests__/lessons-numbering-single-key-guard.test.ts`
> (et, pour balayer large, `npx jest --testPathPatterns 'src/__tests__/[^/]*(guard|sweep)[^/]*\.test\.ts'`
> — 24 suites, 209 témoins verts sur l'arbre de ce lot).
