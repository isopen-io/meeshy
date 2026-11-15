# Cycle 152 — ce qu'une requête ne ramène pas, une garde ne peut pas garder

*2026-11-09. Branche `claude/exciting-planck-n3mdrp`, redémarrée depuis `dev`
après la fusion du cycle 151 (PR #17198, `210d93b3b`).*

Le suivi que le cycle 151 avait laissé le plus actionnable : **#17195**, le
second verrou de l'enveloppe de l'appareil. En l'instruisant, le lot a trouvé un
second défaut dans la relecture dont il allait se servir — **#17208** — et les
deux tiennent en une phrase :

> **Une garde ne vaut que ce que sa requête ramène, et qu'autant de verrous
> qu'elle a de chemins.**

| lot | issue | ce qui change de comportement |
|---|---|---|
| P | #17195 | la base peut CONTREDIRE l'éventail et retenir l'enveloppe |
| Q | #17208 | la vivacité des bannières voit sa troisième preuve de mort |

## Lot P — une garde qui se relit chez elle

### Le défaut

`deviceEnvelopeForPush` (#17191, cycle 151) retient l'enveloppe quand le message
porte une protection plus forte que son chiffrement. Elle lit ces drapeaux
**dans ses paramètres**.

Le cycle 151 avait déjà resserré ce qu'un type pur pouvait resserrer : les cinq
champs sont REQUIS, donc un appelant qui n'en dit rien ne compile pas. C'est le
maximum d'une fonction PURE, et ce n'est pas le maximum souhaitable — un appelant
peut écrire `null` de **bonne foi** sur une ligne qu'il n'a pas chargée entière.
La règle du dépôt est plus exigeante, et elle est écrite depuis le cycle 123 bis :

> **Une garde de confidentialité se relit CHEZ ELLE, pas dans ses paramètres.**
> Un paramètre dont l'absence désactive une garde est un demi-correctif — et les
> transports construisent chacun leur propre enregistrement.

### Pourquoi c'était GRATUIT, et c'est ce qui rendait l'issue actionnable

Les trois éventails relisent DÉJÀ la ligne du message, dans la même fenêtre de
course : `loadMessagePrismSource` pour la réponse et la mention, la relecture
d'éligibilité pour `regular`. Leur `select` portait déjà `effectFlags`,
`expiresAt` et `ephemeralDuration` ; il manquait `isViewOnce` et `isBlurred` —
**deux colonnes, zéro requête**.

C'est exactement l'argument du cycle 127, et il se reprend tel quel : *avant de
conclure qu'une garde coûterait une requête, regarder ce que le site lit déjà.*

### Le défaut que le premier gate a laissé passer, et son témoin l'a trouvé

Le verrou a d'abord été posé sur le seul `data` de la charge push. Le témoin de
ligne PERSISTÉE est tombé immédiatement :

```
"context":{…,"encryptedContent":"BASE64_CIPHERTEXT_DU_MESSAGE",…}
```

`NotificationContext` est persisté **et servi sur `notification:new`**. Garder le
fil APNs seul aurait laissé l'enveloppe d'un message à VUE UNIQUE déchiffrable
par tout client in-app — la même fuite, un canal plus loin, et par le mécanisme
le plus discret : le champ ne compose aucune chaîne, donc rien ne le confronte au
corps que la garde venait de masquer.

> C'est le cycle 123 rejoué d'un cran : **le corps servi et les champs du fil
> sont DEUX PROJECTIONS, et une garde posée sur la plus visible ne garde pas
> l'autre.** D'où `envelopeAwareContext`, appliquée UNE fois en amont des deux —
> la forme que le cycle 123 avait choisie pour la descente du Prisme, retrouvée
> ici pour une retenue.

Et il faut dire comment il a été trouvé : **pas par un raisonnement, par une
assertion de non-régression écrite par habitude.** Le témoin disait seulement
« le chiffré n'apparaît pas dans `notification.create.mock.calls` », ajouté parce
que le dépôt écrit toujours les deux. C'est le cas où la discipline rapporte plus
que l'analyse.

### Fail-CLOSED, et pourquoi ce n'est pas en contradiction avec sa voisine

Deux arbitrages cohabitent dans la MÊME relecture, et ils sont opposés :

| question | verdict sur « je n'ai pas pu lire » | ce qui est en jeu |
|---|---|---|
| le message est-il VIVANT ? (`messageLivenessOf`) | fail-OPEN — on annonce | une LIVRAISON |
| est-il protégé AUTREMENT ? (`protectedBeyondEncryption`) | fail-CLOSED — on retient | un SECRET |

Une bannière appauvrie se rattrape : elle reste « 🔒 💬 », l'état d'avant #17080.
Un secret poussé sur un écran verrouillé, non.

Ce qui l'a rendu exprimable est une décision de TYPE : `MessageBannerSource`
porte `protection: MessageProtectionRow | null`, **imbriqué**, et pas cinq
colonnes de plus au premier niveau. Aplaties, les cinq colonnes à `null` se
lisent « message ordinaire » — c'est-à-dire le fail-OPEN exact qu'on refuse, et
il aurait été invisible.

> **Un type qui ne peut pas dire « je ne sais pas » force son lecteur à
> inventer.** La question à poser à tout champ de garde n'est pas « porte-t-il la
> valeur ? » mais « peut-il distinguer la valeur de son absence ? ».

### La préséance devient UNE loi

Le lot aurait pu poser une seconde boucle `messageProtection(...).ephemeral ||
…viewOnce || …blurred` au gate. Elle est à la place extraite
(`protectedBeyondEncryption`), et `deviceEnvelopeForPush` l'a rejointe dans son
module : deux expressions d'une même règle divergent au premier cycle qui en
touche une — c'est mot pour mot la raison qui a fait sortir
`messageLivenessOf` de cette classe au cycle 140.

Le déplacement n'était pas esthétique : avec les sept lignes du lot,
`messageNotificationFanOut.ts` est passé à **1 002** lignes, et la directive
interdit d'ajouter à un fichier hors budget avant d'en avoir extrait. Le cliquet
l'a dit avant moi. **Le découpage s'est fait par RESPONSABILITÉ, pas par
tranche** — les deux verrous et la loi qu'ils partagent se lisent désormais
ensemble, et plus personne ne peut toucher l'un sans voir l'autre. 995 → **914**.

## Lot Q — la loi publiait son `select`, deux appelants sur quatre l'ignoraient

### Comment il a été trouvé

En posant au `select` de la relecture la question que #17195 posait à ses
paramètres. L'issue demandait d'ajouter deux colonnes à `loadMessagePrismSource` ;
en ouvrant le `select` pour les ajouter, il a fallu constater qu'il était écrit à
la main — et le confronter à la loi qu'il sert.

### Le défaut

`messageLivenessOf` interroge TROIS colonnes depuis le cycle 143 bis —
`deletedAt`, `expiresAt`, `viewOnceBurnedAt` — et publie la liste sous
`MESSAGE_LIVENESS_SELECT`, avec son doc-comment qui dit pourquoi : « tout
consommateur doit les `select` ; le `select` est la seule des conditions
qu'aucun témoin de verdict ne peut voir ».

Des **quatre** consommateurs, les deux du DRAIN la spreadent. Les deux de
`NotificationService` énuméraient huit colonnes à la main, sans la troisième.

Et le type du paramètre de `messageLiveness` déclarait `{ deletedAt?, expiresAt? }` :
il ne POUVAIT pas faire rougir le compilateur sur une ligne sans
`viewOnceBurnedAt`, **puisqu'il ne la demandait pas.**

### Ce que ça coûtait, à sa taille

`purgeViewOnceContent` détruit le clair d'une vue unique — `content: ''`,
`encryptedContent: null`, `translations: null`, les fichiers — **sans écrire
`deletedAt`** : la bulle survit, c'est la raison d'être du module, et
`viewOnceBurnedAt` est la seule preuve qu'il laisse. Le verdict était donc `live`
sur les trois éventails, et la bannière partait pour un message dont le serveur
n'a plus le contenu.

**Ce n'est pas une fuite de clair, et il faut le dire plutôt que gonfler le
récit** : le texte est masqué en amont par `protectedPreview`, le média retenu
par `mediaMayTravel`, l'enveloppe par le lot P. Ce qui partait est une bannière
de protection et la bulle que la NSE PRÉ-ENREGISTRE derrière elle. Défaut de
JUSTESSE.

### Le lot qui a laissé le trou l'avait ÉCRIT

Le doc-comment de `purgeQueuedCopies` porte, mot pour mot : « `viewOnceBurnedAt`
n'est lu par aucune garde de remise ». Le cycle 143 bis a donné la colonne au
DRAIN — et pas aux bannières.

> **Diagnostiquer qu'une garde est aveugle à une preuve n'est pas la rendre
> voyante.** La règle était déjà dans le dépôt, écrite par le lot #16706 dans ces
> termes exacts, et elle s'est appliquée à son auteur suivant : *un lot qui écrit
> « cette garde ne peut pas voir X » doit, dans le même lot, soit lui donner X,
> soit dire pourquoi elle ne doit pas l'avoir.* Elle vaut une couche plus haut :
> **une loi qui PUBLIE son `select` n'est appliquée que par les consommateurs qui
> l'importent**, et rien ne rougit chez les autres.

### Les trois témoins de VERDICT étaient VERTS, et c'est la démonstration

Un double Prisma rend ce qu'on lui dit quel que soit le `select` : la fixture
porte `viewOnceBurnedAt`, la loi la lit, le verdict est `gone`, le témoin passe —
sur une production dont la requête ne ramenait pas la colonne.

Ce qui PROUVE le correctif est le témoin de **REQUÊTE**, qui assert sur
`findUnique.mock.calls[n][0].select`. Les trois témoins de verdict restent
écrits, avec la raison pour laquelle ils ne peuvent pas tomber inscrite au-dessus
d'eux — un témoin dont on sait qu'il ne peut pas tomber vaut mieux qu'un témoin
dont on l'ignore.

Le cliquet, lui, ferme la CLASSE : tout fichier de production qui appelle
`messageLivenessOf(` doit référencer `MESSAGE_LIVENESS_SELECT`. Sa limite est
ÉCRITE dans le fichier plutôt que tue — il ne prouve pas que le `select` de la
requête est celui-là, et le dépôt a déjà JETÉ un balayage coupable de mesurer la
popularité d'un idiome au lieu d'une propriété (cycle 107).

## Preuve

| gate | résultat |
|---|---|
| `tsc --noEmit` gateway | **EXIT=0** (après `packages/shared && bun run build` — le talkie scellé arrivé de `dev` l'exige) |
| rouge, lot P | **22 des 42 témoins tombent** — 3 éventails × 8 protections, les 2 projections, le fail-closed |
| rouge, lot Q | le témoin de REQUÊTE tombe sur les 3 éventails + le cliquet ; les 3 témoins de VERDICT sont verts, et le fichier dit pourquoi |
| mutations | **3 sur 3 attrapées** — verrou retiré (25 rouges), fail-OPEN sur l'absence de ligne (2), colonne retirée du `select` (4) |
| zone d'impact | **227 suites / 4 016 témoins verts** (notifications, messagerie, E2EE, socket) |
| cliquets | **12 suites / 97 témoins verts** — budgets de taille, `detached-promise-catch-sweep`, manifeste de routes, porte d'émission, 3 balayages de schémas, garde de présence, écrivains de préférences, comptes de suites |
| suite gateway COMPLÈTE | **2 594 / 2 600 suites · 40 512 témoins verts.** Les 6 rouges sont HEIF/AVIF/EXIF, mesurées IDENTIQUES sur `dev` sans le lot (codec absent du conteneur) |
| budget de taille | `messageNotificationFanOut.ts` 995 → **914** ; `NotificationService.ts` 3 586 → **3 660** (gelé à 3 761) |
| audit adversarial | lancé sur l'arbre FUSIONNÉ avant toute demande de fusion (directive 2026-10-03) |

### Sur le budget, et ce que l'extraction a coûté

Le cycle 151 avait entamé 11 des 175 lignes de marge de `NotificationService.ts`
en disant que c'est à cela qu'elles servaient. Ce cycle en prend 74 de plus —
3 660 contre un gel à 3 761 — et rend 81 lignes à `messageNotificationFanOut.ts`.
**Le compte se lit dans le fichier, jamais dans ce journal** : la première
rédaction de ce tableau annonçait 3 613, chiffre hérité d'une mesure faite avant
les derniers commentaires. Un compte est une AFFIRMATION, comme un tri.

L'extraction que le cycle 151 avait ENVISAGÉE et refusée — la composition
`servedTranslation` + `bannerBody`, dupliquée mot pour mot dans les deux
créateurs — n'a pas été prise ici non plus, et pour la même raison : un lot de
confidentialité ne refactore pas le chemin qu'il garde. Elle reste à ouvrir.

## Ce que ce cycle laisse ouvert

- **La composition de bannière est toujours écrite trois fois** (message,
  réponse, mention) : `this.prismTranslation(this.previewPrismSource({…}),
  prism.ordered)` suivi de `servedBannerBody({…})`. Suivi du cycle 151, non
  repris ; trois exemplaires d'une règle est la configuration qui a produit les
  cycles 121 à 128. À extraire chez elle, et cela paierait le budget que ces deux
  cycles ont entamé.
- **#17196** — l'effet de bord du lot N (cycle 151) sur iOS : la NSE discrimine
  l'E2EE sur la PRÉSENCE du chiffré pour décider s'il faut pré-enregistrer une
  bulle, et retenir l'enveloppe INVERSE ce verdict. **Ce cycle en ÉLARGIT la
  portée** : le lot P retient l'enveloppe sur un chemin de plus, donc le même
  troc s'applique au contexte persisté. Toujours lu, pas exécuté : pas de Xcode
  ici.
- **#17197** — un client sur trois lit l'enveloppe. Le web la REFUSE par garde
  écrite et gelée, Android n'a aucun lecteur de charge push : une bannière E2EE
  reste « 🔒 💬 » sur ces deux plateformes. Dimension 13 non mûre, et ce lot ne
  la touche pas.
- **#17075** — « supprimer pour moi » n'annonce à personne. `décision-produit`,
  assignée au porteur.
- **#17139**, **#17140** — l'ORDRE sur un agrégat non planchéisé, et le
  fail-OPEN décisionnel d'un `shareLinkId` orphelin. Décisions par surface.

**Et ce que ce lot ne couvre pas, comme son prédécesseur** : la cryptographie. La
session AES-GCM par pair et la couche libsignal par appareil n'ont pas été
revues. **Un audit cryptographique TIERS reste requis avant de présenter Meeshy
comme une messagerie chiffrée** — ni ce lot ni son audit n'en tiennent lieu.
