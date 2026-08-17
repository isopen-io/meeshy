# Cycle 57 bis — le troisième réglage de police, réglable partout et appliqué nulle part

> **Numérotation.** Un second couloir a livré le même jour un journal nommé
> `cycle57` (« le rattrapage du cycle 56 dépensait le budget dont il dépend »,
> PR #3154). Les deux documents sont conservés ; celui-ci prend le suffixe `-bis`
> selon la convention déjà employée aux cycles 46-bis, 54-bis et 56-bis — le nom
> canonique reste à celui de `main`. Même collision sur `tasks/lessons.md` : deux
> « Leçon 221 » ont été proposées, celle qui n'était pas encore sur `main` a cédé
> et devient la **222**, règle de préséance retenue au cycle 56-bis (§6) parce
> qu'elle ne casse aucun renvoi existant. C'est la **troisième journée
> consécutive** où les trois compteurs partagés — leçons, cycles, journaux —
> collisionnent : la piste n°10 ci-dessous n'est plus une observation, c'est une
> dette qui se manifeste à chaque livraison.
>
> **Note d'exactitude.** Le sujet du commit de code de ce cycle porte
> `(#3154)` : le numéro a été deviné avant l'ouverture de la PR, et #3154 est en
> fait la PR de l'AUTRE couloir. La PR de ce cycle est **#3156**.

## 0. La voie, et pourquoi ce n'est toujours pas IOS_DETTE

`tasks/lane-cursor.md` est à `lane=ANDROID android_streak=5
last_run=post-detail-reach-stats`. Comme aux cycles 54-bis, 55 et 56-bis,
l'environnement d'exécution est un conteneur Linux sans Xcode ni toolchain Swift
(`which xcodebuild swift` → rien) : les deux gates obligatoires du couloir iOS
sont inexécutables, et livrer du Swift non compilé serait un diff non prouvé.

Voie retenue : le couloir temps réel côté gateway, entièrement gatable ici
(jest + tsc sous bun). Le curseur reste intact pour le prochain run disposant
d'un Xcode.

> **Note d'environnement.** Le conteneur est arrivé sans `node_modules`.
> `bun install` échoue sur le postinstall de `grpc-tools` (téléchargement d'un
> binaire préconstruit via une URL S3 réécrite par le proxy) ;
> `bun install --ignore-scripts` passe et suffit — `grpc-tools` ne participe à
> aucun gate du gateway. À retenir pour les runs suivants.

## 1. D'où vient la piste

Piste n°5 du cycle 56-bis :

> **`slowModeSeconds`, réglage de conteneur que personne n'applique** — la
> dernière des trois colonnes « WRITE PERMISSIONS » à n'avoir aucun exécuteur.

Les deux premières ont été câblées au cycle 31 (`isAnnouncementChannel`,
`defaultWriteRole`). Celle-ci restait, et le cycle 56-bis l'avait explicitement
écartée en refusant de trancher son inapplication.

## 2. Le constat

### 2.1 Une fonctionnalité complète de bout en bout, sauf son application

| Étage | État |
|---|---|
| `schema.prisma` | `slowModeSeconds Int @default(0)`, documenté « minimum seconds between messages per user » |
| `api-schemas.ts` | déclaré, décrit, `nullable`, testé (`api-schemas-phase2.test.ts`) |
| `PUT /conversations/:id` | l'écrit ; l'interdit aux `moderator` et aux `direct` |
| `conversation:updated` | le diffuse |
| iOS `CoreModels` / `ConversationStore` | le décode, le fusionne, le persiste |
| iOS `ConversationSettingsView` | un `Picker` qui le RÈGLE |
| **serveur, à l'envoi** | **rien** |

Un modérateur choisissait « 30 s », l'écran le confirmait, l'événement partait —
et aucun envoi n'était ralenti, sur aucun des trois transports.

### 2.2 Pourquoi la règle avait été déclarée hors de portée

L'en-tête de `conversationWriteAdmission` l'écrivait noir sur blanc :

> `Conversation.slowModeSeconds` est de la même famille (un réglage de conteneur
> que personne n'applique) mais demande un état « dernier envoi par personne »
> qui n'existe nulle part : c'est un limiteur de débit, pas une admission.

**C'était faux, et d'une façon instructive.** L'état existe : c'est la table
`Message`, dont l'index `[senderId, conversationId]` porte exactement cette
question. La phrase cherchait un COMPTEUR — une colonne dénormalisée à tenir à
jour, avec son écrivain, son invalidation et sa dérive — là où le JOURNAL des
messages répond déjà, autoritairement et gratuitement.

C'est la forme la plus discrète de dette : non pas un oubli, mais une note de
conception qui ferme la question. Elle avait survécu à deux cycles qui l'ont lue
(31, 56-bis) parce qu'un « ça demande un état qui n'existe pas » se lit comme un
constat, pas comme une hypothèse à vérifier.

### 2.3 Le second demi-mot : « limiteur de débit, pas admission »

La phrase opposait deux catégories qui n'en font qu'une ici. La question posée à
l'envoi est *cet envoi passe-t-il maintenant ?* — c'est une admission, dont la
réponse dépend du temps. Le module en portait déjà une du même genre : l'état
terminal dépend d'une DATE (`closedAt`).

## 3. Le correctif

### 3.1 La fenêtre est bornée à la LECTURE, pas après

```
where: { conversationId, senderId, messageSource: 'user',
         createdAt: { gt: now - slowModeSeconds } }
orderBy: { createdAt: 'desc' }  select: { createdAt: true }
```

Le filtre `gt` passe AVANT le tri : l'ensemble trié est ce qu'une seule personne
a pu écrire pendant quelques secondes, pas son historique entier dans le fil. La
naïveté — `findFirst` par `(senderId, conversationId)` trié desc sans borne —
aurait fait trier en mémoire tous les messages d'un bavard dans un grand groupe.
Aucun index neuf n'est nécessaire ; l'égalité est portée par l'index existant.

**Conséquence de forme :** c'est la FENÊTRE qui tranche l'admission, pas
l'arithmétique. Une ligne rendue est, par construction, dans la fenêtre — donc
un `if (remaining > 0) …` après coup serait le même calcul une seconde fois, et
une branche qu'aucun état de la base ne peut atteindre. L'absence de ligne est le
seul « oui », et l'arithmétique ne fait plus que CHIFFRER l'attente. (Écrite
d'abord avec ce garde, elle laissait une ligne non couverte — le trou de
couverture a nommé la redondance.)

### 3.2 Seuls les messages `messageSource: 'user'` comptent

`CallService.postCallSummary` écrit ses résumés d'appel sur le participant de
l'INITIATEUR, qui ne les a pas tapés. Sans ce filtre, **raccrocher faisait taire
l'initiateur pendant toute la fenêtre.**

Le filtre positif ignore aussi les documents antérieurs à la colonne (absent ≠
`'user'` sur le connecteur MongoDB — le piège que `firstMessageSentAt` documente
au schéma). Sans conséquence ici, et c'est la fenêtre qui le garantit : la règle
ne regarde que les dernières secondes, où aucun document hérité ne tombe.

### 3.3 Le refus porte son décompte

`retryAfterSeconds` — le seul des trois refus à être TEMPORAIRE. Un client qui
reçoit « vous n'avez pas le droit » range le message en échec définitif ; ici il
doit pouvoir le REPRÉSENTER. Trois bornes :

| Borne | Pourquoi |
|---|---|
| arrondi au-dessus | un réessai à la seconde annoncée doit passer, pas retomber sur un refus d'un dixième |
| plafond au réglage | une ligne datée dans le futur (horloges désaccordées) ne promet pas plus d'attente que le mode lent |
| plancher à 1 s | jamais un refus qui invite à réessayer immédiatement, ni un décompte négatif |

Côté HTTP, les deux routes de lien répondent **429 + `Retry-After`**, et non 403.
410 reste la clôture. Le code de statut porte la différence parce que c'est ce
que les files d'attente clientes savent lire sans connaître notre vocabulaire.

### 3.4 Le rang avant le débit, sur UNE seule lecture

Un refus définitif annoncé comme un « pas encore » ferait attendre un client qui
ne passera jamais. Et les deux règles se tranchent sur le même rôle : il est lu
une fois, avec le rôle global de plateforme dans la même ligne (idiome de
`messageEditAdmission`, déjà celui de la règle du rang).

### 3.5 La dispense des conteneurs sans hiérarchie couvre AUSSI le débit

Contourner le mode lent est un privilège de RANG (`SLOW_MODE_BYPASS_RANK`), donc
une hiérarchie. Dans un tête-à-tête il n'y en a pas : le `creator` — qui n'est
que celui qui a ouvert le fil — imposerait l'attente à son pair `member` sans la
subir. **C'est l'attaque du cycle 56-bis, au ralenti.**

Les deux gestes du cycle 56-bis se répètent donc à l'identique, et pour la même
raison : la route refuse d'écrire le champ sur un `direct` (elle empêche l'état
de naître), la règle le dispense (elle GUÉRIT les fils déjà empoisonnés, dont
aucune route ne rendra jamais compte).

`SLOW_MODE_BYPASS_RANK` est DÉRIVÉ de la hiérarchie (`WRITE_ROLE_RANK.moderator`)
et non énuméré : un rôle inséré demain se place tout seul du bon côté de la barre.

### 3.6 `conversationId` devient EXIGÉ, et le compilateur a fait le travail

La fenêtre se cherche par `conversationId`. Le déduire de `conversation.id`
aurait rendu la règle silencieusement INERTE partout où ce champ manque au
`select` de l'appelant — la moitié exacte du défaut que l'en-tête de
`SHARE_LINK_CONVERSATION_SELECT` documente déjà (« une garde à moitié posée qui
en a l'air d'une entière »). En paramètre exigé, `tsc` a nommé les deux chemins
de lien avant qu'un test ne le fasse.

Même logique pour le `select` partagé : `slowModeSeconds` y entre, sans quoi les
deux routes de lien auraient porté une règle inerte.

### 3.7 `describeConversationWriteRefusal` — la fin des `if/else` binaires

Les trois sites de refus portaient chacun `reason === 'conversation-closed' ? … : …`,
en deux dialectes. Cette forme n'est pas seulement duplicatoire : **elle range
tout refus AJOUTÉ dans sa branche par défaut**, ce qui aurait annoncé le mode
lent — un « pas encore » — avec les mots d'un « jamais ». Un `switch` exhaustif
sur l'union rend la prochaine addition visible.

## 4. Gates

- Suite gateway COMPLÈTE sous bun (parité CI) : **740 suites, 17 969 témoins
  verts, 0 échec** (baseline cycle 56-bis : 17 937 ⇒ **+32 témoins**)
- `conversationWriteAdmission.ts` : **100 % lignes / branches / fonctions /
  instructions** (le niveau où le cycle 56-bis l'avait laissé)
- `tsc --noEmit -p services/gateway` : **0 erreur** sur tout le service
- `prisma generate --generator client` + `packages/shared` reconstruits avant la
  campagne (prérequis de parité CI documentés au CLAUDE.md racine)

### Preuve par mutation, dans les deux sens

| # | Mutation | Effet attendu | Constaté |
|---|---|---|---|
| 1 | compter les messages `system` | le filtre d'attribution tombe | 1 échec |
| 1b | *retirer* le filtre `messageSource` | — | **ne compile pas** : l'interface du lecteur le rend non retirable |
| 2 | `floor` au lieu de `ceil` | l'arrondi au-dessus tombe | 1 échec |
| 3 | retirer le contournement par rang | les 6 dispenses tombent | 6 échecs |
| 4 | lire même sans mode lent | le chemin nominal gratuit tombe | 3 échecs |
| 5 | accepter une valeur négative | la normalisation tombe | 1 échec |
| 6 | retirer la dispense des conteneurs sans hiérarchie | les 2 dispenses + bornes tombent | 5 échecs |
| 7 | ajouter `'group'` aux types sans hiérarchie | toute la police du groupe tombe | 22 échecs |
| 8 | retirer le plafond au réglage | la borne de l'horloge désaccordée tombe | 1 échec |
| 9 | le débit avant le rang | l'ordre des refus tombe | 9 échecs |
| 10 | barre de contournement à `member` | la borne du contournement tombe | 7 échecs |

Les cinq sur-dosages (6 à 10) sont ce qui prouve que les témoins tiennent des
BORNES et pas seulement une direction. La mutation 1b est le meilleur résultat
du lot : le typage structurel du lecteur rend le filtre d'attribution
impossible à retirer sans casser le build — une garde plus forte qu'un témoin.

## 5. Écartés délibérément

**Borner `slowModeSeconds` côté route.** Le schéma déclare `type: 'number'` sans
minimum ni maximum : un négatif est écrivable (normalisé en « désactivé » par la
règle) et une valeur énorme vaut un mutisme de fait. La borne HAUTE est une
décision produit — quel est le mode lent maximal légitime ? — et pas un
correctif ; la nommer ici sans la trancher vaut mieux que de choisir un chiffre
au hasard.

Sévérité mesurée avant de la classer : le SEUL client qui expose le réglage
(`ConversationSettingsView`) offre un `Picker` fermé à cinq valeurs — `0`, `10`,
`30`, `60`, `300` — donc aucune valeur absurde ne peut venir du client officiel.
La règle livrée ici couvre exactement ces cinq cas. Une valeur hors bornes exige
une requête FORGÉE par un `creator`/`admin`/`moderator` du conteneur, c'est-à-dire
quelqu'un qui peut déjà régler 5 minutes par l'interface. Piste n°1, réelle mais
sans urgence.

**Porter `retryAfterSeconds` dans l'accusé de réception socket.**
`MessageResponse` ne transporte qu'un `error: string`, et le décompte y arrive
donc sous forme de PHRASE (« réessayez dans 12 s ») plutôt que de champ. Les
clients peuvent l'afficher mais pas le décompter. Élargir le contrat touche web,
iOS et Android — un cycle à lui seul. Piste n°2.

**L'interface web n'a AUCUN réglage de mode lent.** `grep slowMode apps/web` ne
rend rien : seul iOS l'expose. Un modérateur web ne peut donc ni le poser ni
constater qu'il est actif. Manque de fonctionnalité, pas défaut. Piste n°3.

**Le mode lent ne s'applique pas à la conversation globale.** Elle est dans
`WRITE_HIERARCHY_FREE_TYPES`, et `PUT /conversations/:id` refuse de toucher
`'meeshy'` — le champ n'y est donc pas posable par une route. Un mode lent y
serait pourtant l'usage le plus naturel (anti-spam d'un salon public), mais il
demanderait d'abord un ÉCRIVAIN. Piste n°4.

## 6. Pistes pour le cycle 58 (ou 59 — cf. la note de numérotation) — repérées, NON livrées

1. **`slowModeSeconds` n'a aucune borne haute** (§5) — décision produit à
   trancher, puis à faire tenir par le schéma.
2. **L'accusé socket ne porte pas `retryAfterSeconds` en CHAMP** (§5) — le
   décompte voyage en prose, donc indécomptable côté client.
3. **Le web n'expose aucun réglage de mode lent** (§5).
4. **La conversation globale ne peut porter aucune police d'écriture** (§5) —
   aucun écrivain ne la vise, par garde de route.
5. **Le code mort des trois hooks de préférences React Query** (piste n°1 du
   cycle 55) — intacte.
6. **`handleMessageDeleted` renonce quand le cache messages est vide** —
   intacte, à re-prouver avant d'y consacrer un cycle.
7. **Les deux ÉVÉNEMENTS avant les deux FUSIONS côté iOS** — intacte, bloquée
   sur l'absence de Xcode.
8. **Le témoin de source ne couvre qu'un fichier** (cycle 54-bis n°4) — intacte.
9. **`PUT /conversations/:id` n'accepte pas les identifiants que son schéma
   annonce** (cycle 56-bis §5) — intacte.
10. **Les compteurs PARTAGÉS collisionnent dès que deux couloirs livrent le même
    jour** (cycle 56-bis n°7) — intacte. Aucun allocateur pour les trois
    compteurs (leçons, cycles, journaux).
11. **La question généralisée du cycle 56-bis, désormais close sur son premier
    domaine** : pour chaque réglage de CONTENEUR appliqué par une garde, quels
    TYPES de conteneur peuvent le porter ? Les trois colonnes « WRITE
    PERMISSIONS » ont maintenant leur réponse. **Les préférences de communauté et
    les droits de lien de partage ne l'ont toujours pas reçue** — et le recensement
    à faire est celui des EXÉCUTEURS : quel réglage de ces deux familles est lu
    par une garde de production, et lequel n'est qu'une colonne réglable ?
