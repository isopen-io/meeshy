## Cycle 209 — le tiroir du composeur web s'offrait entier à un visiteur sans compte : sa ligne de participation était cherchée sur la colonne d'un inscrit (#20264)

**Date** : 2026-11-21. **Base** : `dev` à `25454555e`. **Issue** : #20264.

### D'où vient ce lot

La SECONDE moitié de #20228 (cycle 206), que son journal a nommée et laissée
ouverte par décision : « le correctif y est une lecture d'identité et non un
applieur temps réel, et les mélanger ferait un lot dont la preuve ne dirait plus
laquelle des deux règles elle garde. »

### Le défaut

`viewer.id` ne nomme pas toujours la même COLONNE. `resolveViewer`
(`lib/api/viewer.ts`) y met un `User.id` pour un inscrit et un `Participant.id`
pour un invité de lien (`isAnonymous` reste vrai, `id` n'est plus `null`) — c'est
la règle que la passerelle épelle pour ses propres requêtes
(`services/gateway/CLAUDE.md` : « une requête `Participant` sur cette clé doit
choisir sa COLONNE », et son symptôme est une ligne INTROUVABLE, pas une erreur).

**Trois orthographes de cette lecture vivaient dans `apps/web`, et la plus
consultée était la seule fausse :**

| site | la lecture | verdict |
|---|---|---|
| `menuViewerOf` (`lib/view/message-action-scope.ts`) | `p.userId === id \|\| p.id === id` | juste |
| `selfSenderOf` (`lib/view/self-sender.ts`) | branche sur `isAnonymous` | juste |
| `thread.tsx:187` → le tiroir du composeur | **`p.userId === viewer.id` SEUL** | **faux pour tout invité** |

Conséquence : `Composer` recevait `rights: undefined`, que son contrat lit « tout
est autorisé » (« aucun participant chargé encore »). Les tuiles du tiroir
s'offraient donc à un visiteur **à qui l'hôte les avait retirées**, pour un geste
que la passerelle refuse en 403 (`ATTACHMENT_RIGHT_NOT_PERMITTED`). C'est la loi
4 prise à l'envers — **un contrôle qui existe sans avoir d'effet** — et elle
frappe exactement la population que le web sert : les droits booléens ne se
pilotent que sur un participant SANS COMPTE (`PARTICIPANT_HAS_ACCOUNT` refuse les
autres), et un visiteur de lien navigue sur `apps/web`.

Le défaut n'attendait aucun événement : **il était déjà là au premier rendu.**

### Le correctif

- **`apps/web/src/lib/view/viewer-participant.ts`** — `viewerParticipantOf`, le
  site unique. La colonne se choisit sur la NATURE de la clé, jamais par une
  disjonction : en production les deux formes rendent le même verdict (un
  `Participant.id` ne vaut jamais un `User.id`), mais **la disjonction ne DIT
  rien** — elle laisse croire que la clé est de nature inconnue, et c'est cette
  ignorance qui a produit la troisième orthographe.
- **La résolution a DÉMÉNAGÉ chez `useComposerAccess`**, et ce n'est pas un
  rangement : cette unité est la seule à tenir ENSEMBLE la conversation servie et
  l'identité du lecteur, donc la seule qui puisse nommer la ligne sans que son
  hôte ait à réécrire la lecture. `thread.tsx` ne compose plus rien — il passe
  `viewer`. **Un paramètre qu'un hôte doit calculer est une règle qu'un hôte
  finira par calculer de travers**, et c'est ce qui s'était passé.
- `menuViewerOf` et `selfSenderOf` consomment le site unique. `selfSenderOf` ne
  garde que ce qui lui est propre : la SURCHARGE du pseudo de l'invité (#10120).
- **Le doc-comment de l'applieur de #20228 est corrigé dans le MÊME lot** : il
  nommait `viewerParticipant?.permissions`, un site qui n'existe plus. Il dit
  désormais que le cycle 206 **n'atteignait le tiroir qu'une fois cette seconde
  moitié posée** — les deux lots se complètent, aucun des deux ne suffit.

### La preuve

| gate | résultat |
|---|---|
| `bun test` (web, suite COMPLÈTE) | **34 971 verts / 1 rouge** (2 703 fichiers) — le rouge est #20276, PRÉ-EXISTANT sur `dev` (mesuré par `git stash`) et vert en CI |
| `tsc --noEmit` (web) | **0** |
| `bun run build` + `measure-weight.mjs` | **vert** — chunk `thread` 52,45 Ko |
| `check-composer-band`, `check-thread-chrome`, `check-thread-states`, `check-join-first-screen`, `check-links` (pixels, isolés) | **5 verts** |
| les 80 autres maillons statiques de `bun run gate` | verts |

**Le ROUGE, prouvé par mutation sur le site unique :**

| mutation | témoins qui tombent |
|---|---|
| la colonne `userId` SEULE (le défaut de #20264) | **5 rouges** |
| la disjonction des deux colonnes | **3 rouges** |

Le témoin qui porte le lot passe par le PIXEL — la tuile rendue dans le tiroir
ouvert, `data-composer-source` — et non par le champ `rights` : ce qui compte est
que le GESTE disparaisse (cycle 123, « suivre la donnée jusqu'au PIXEL »).

**Et trois de ses quatre cas passaient DÉJÀ**, il faut le dire : ce sont les cas
de PRÉCISION (un inscrit non confondu avec une ligne d'invité, une ligne non
servie qui laisse le tiroir ouvert). Ce sont des **pièges armés** (patron du
cycle 84) — la mutation « disjonction » montre qu'ils peuvent tomber, et c'est
cette mesure, pas leur vert, qui les qualifie de témoins.

### Ce que la preuve a coûté — et ce qu'elle a trouvé (#20279)

Les ~60 gates de pixels du web sont **injouables hors CI** : `browser.mjs`
épingle `/opt/pw-browsers/chromium-1194/chrome-linux/chrome` quand le conteneur
porte `chromium-1243/chrome-linux64/chrome`, et l'absence du candidat ne dit
rien — `existsSync` rend la main à Playwright, qui affiche une bannière
d'installation. Soixante rouges identiques qui ne nomment pas leur cause.
`CHROMIUM=/opt/pw-browsers/chromium` les rend jouables.

**Et ils ne s'enchaînent pas.** Lancés en batch, `check-thread-chrome` et
`check-thread-states` ont rendu des rouges (compte de bulles parti de 13 au lieu
de 9 — l'état persisté d'un gate précédent) qui ont DISPARU au lancement isolé.
J'ai cru une régression de mon lot et j'ai rebâti `dev` pour la comparer : la
bonne manœuvre, mais la mauvaise première hypothèse. **Avant d'imputer un rouge
de gate de pixels à un diff, le rejouer SEUL.**

Un seul rouge survit à l'isolement, identique sur `dev` et avec le lot :
`check-access-column` à 1440×900, qui dit lui-même « aucun contenu perceptible
trouvé — le témoin ne mesure rien ». Instruit dans #20279.

### Une collision de numéro de cycle, et ce qu'elle redit

Ce journal s'est d'abord appelé `cycle207`. **`cycle207` et `cycle208` étaient
déjà pris** (#20267, #20271), par des lots de la même journée dont la trace vit
dans `tasks/lessons.md` et non dans un registre. C'est la collision d'espace de
noms partagé que le `CLAUDE.md` racine décrit (#5102, « un identifiant qui ne
s'alloue pas ne collisionne pas ») : la doctrine de la branche poussée tôt
réduit la fenêtre des collisions de FICHIERS, elle ne fait rien pour un numéro
que chacun déduit du dernier qu'il a vu. Le relevé qui tranche est
`ls tasks/ | grep cycle20`, et il se fait AVANT d'écrire le nom du fichier, pas
après.

### Ce que ce lot ne fait pas, et ce qu'il a trouvé en chemin

- **Le détail d'une conversation sert l'INSTANTANÉ des droits d'un invité, pas
  l'ensemble RÉSOLU — #20277.** En suivant la donnée que le tiroir vient de se
  mettre à lire : `conversationDetailInclude` sélectionne `permissions` (la table
  figée au join) et ne charge pas `anonymousSession`, et `resolveEntryRights` —
  la loi qui classe `anonymousSession.rights` AU-DESSUS de cet instantané, et que
  `middleware/auth.ts` applique à chaque envoi — **n'a aucun appelant dans
  `core-detail.ts`** (mesuré : 6 appelants, aucun n'est le détail). C'est le
  CINQUIÈME lecteur de la même règle, et celui que les clients montent à chaque
  ouverture de fil. Symptôme : l'applieur de #20228 rattrape, fil ouvert, une
  divergence que la lecture d'amorce fabrique — le tiroir s'ouvre, puis se ferme
  à la première socket.

  > **Un lot qui met un client à lire une donnée hérite de la question de sa
  > justesse.** Le cycle 206 a posé l'applieur, celui-ci a posé le lecteur ; ni
  > l'un ni l'autre n'avait de raison de demander *qui compose la valeur
  > d'amorce*, et c'est pourtant la seule question qui restait.

- **La garde des `act()` abandonnés ne reproduit plus son défaut sous bun ≥ 1.4
  — #20276.** DEUX causes empilées, la première masquant la seconde : les chemins
  ABSOLUS que son harnais remet à `bun test` y sont lus comme des FILTRES (les
  fixtures portent `.fixture.tsx`, pas `.test.`), et une fois cela corrigé, le
  préchargement de la garde n'a plus d'effet sur le sous-processus. Le correctif
  de la première a été écrit, mesuré, **puis reverti** : nécessaire, insuffisant,
  et sur un harnais dont le comportement sous la bun de la CI (1.3.14) n'est pas
  vérifiable ici. Modifier à l'aveugle une garde dont une CI verte dépend coûte
  plus que l'attendre.

- Il ne touche ni **#20093** (convergence de l'annuaire E2EE et des quatre
  lectures de la liste de membres) ni **#20189** (les droits du créateur d'un
  lien banni) : deux dossiers qui attendent une décision, pas un applieur.
