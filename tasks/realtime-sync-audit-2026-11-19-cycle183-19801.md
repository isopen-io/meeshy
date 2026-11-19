# Cycle 183 — la branche jumelle posait sa clé d'attente, celle-ci ne la posait pas

*2026-11-19, à la suite du cycle 182 (#19800, fusionné dans `dev` par `9885c35a4`).
Branche `claude/exciting-planck-loe3fu`. Instruit **#19801**, l'une des colonnes
rendues par le tri de #19748.*

---

## Pourquoi celui-là, et ce que j'ai écarté d'abord

Les suivis du cycle 182 étaient #19833 (`décision-produit`), #19834, #19835,
#19836, #19837 ; le tri de #19748 laissait #19801, #19802, #19803.

**Les trois rouges de `dev` passaient avant tout cela**, et le relevé les a
rendus déjà soldés par d'autres sessions :

| rouge lu sur le run de `4fc8cbdf4` | état sur `e72b07b19` |
|---|---|
| `gateway-test-file-size-budget` : `calls-routes.test.ts` 2 154 → 2 175 (#19817) | **soldé** par `a16deb08fc` — les témoins du join et du retrait ont quitté le fichier, qui fait 1 198 lignes pour une dette de 1 198 |
| `Tests · web` : `call-network-recovery.ts` hors du lecteur unique (#19818) | **soldé** — le module est inscrit à `READS_RAW_SIGNALS` avec sa raison (#19776) et un témoin qui BORNE l'exception à `connection` |
| `Web · gardes navigateur · tranche 4` — « Gate contrôles d'appel » | **non élucidé**, et pas reproductible ici : voir la fin de ce journal |

> **Un rouge de CI se relit sur la TÊTE, jamais sur le run qui l'a signalé.**
> Les deux premiers avaient été réparés dans les deux heures qui ont suivi le run
> que je lisais. Le journal le note parce que l'inverse — reprendre un lot déjà
> livré par une autre session — est le coût que la doctrine de la branche poussée
> tôt (#5243) existe pour éviter, et il se paie aussi en LECTURE : la mesure se
> prend sur l'arbre vivant (leçon du cycle 182 sur le SHA du brief).

Parmi les colonnes restantes, #19801 l'emporte sur un critère que les autres
n'ont pas : **il se prouve ENTIÈREMENT dans le conteneur, et son correctif ne
supprime rien.** #19802 (deux files vides depuis toujours) et #19815 (la bascule
d'une communauté en privée a expulsé ses occupants) demandent tous deux une
mesure de PRODUCTION — un arriéré, un envoi de masse, une réadmission — que je
ne peux pas prendre sans base, et une décision du porteur.

## Le défaut

`MaintenanceService.cleanupOrphanedAttachments` ramasse les pièces jointes « pas
liées à un message et vieilles de plus de 24 h » :

```ts
where: { messageId: null, createdAt: { lt: orphanedThreshold } }
```

`{ champ: null }` est une ÉGALITÉ : sous MongoDB elle exige la clé PRÉSENTE. Les
cinq créateurs de `MessageAttachment` ne l'écrivaient pas tous :

| créateur | ce qu'il écrit | balayé ? |
|---|---|---|
| `copyAttachments.ts:138` · `MessageProcessor.ts:777` | un `messageId` réel | sans objet |
| `UploadProcessor.ts:437` · `:614` | `messageId: messageId \|\| null` — la clé est POSÉE | **oui** |
| `routes/uploads/tus-handler.ts:723` (branche MESSAGE) | la clé n'est pas dans le `data` | **non** |

Or le téléversement REPRENABLE est précisément celui qui produit des orphelines :
un média poussé puis jamais envoyé. **Aucune pièce jointe venue de ce chemin
n'était balayable** — la ligne restait en base et ses octets sur le disque, pour
toujours. Sans erreur : le balayage rend une liste vide et journalise qu'il n'a
rien trouvé à nettoyer. Septième occurrence du piège de `utils/prisma-unset.ts`.

## La preuve était dans la branche JUMELLE du même `else`

C'est ce qui fait de ce lot autre chose qu'une septième répétition. Le `if/else`
de `onUploadFinish` a DEUX branches, et la première pose sa clé d'attente :

```ts
if (isPostMedia) {
  const postMedia = await prisma.postMedia.create({ data: { postId: null, … } });  // ← posée
} else {
  const attachment = await prisma.messageAttachment.create({ data: { /* rien */ … } });
}
```

`postId: null` est là parce que `sweepPendingPostMedia` le lit pour trouver les
médias de publication abandonnés — même seuil de 24 h, même journée de ménage,
appelé par la même méthode de `MaintenanceService` — **87 lignes** au-dessus de
son jumeau (`postId: null` à la 650, `messageId: null` à la 737), dans la même
fonction et le même `if/else`.

> **La discipline d'écriture n'était pas une règle manquante du dépôt : elle était
> appliquée par trois sites sur quatre, dont le voisin immédiat du fautif.** Ce
> qui manquait n'est pas la connaissance, c'est un endroit où le quatrième
> rougisse. « Une règle ne se propage pas depuis son énoncé : elle vaut là où
> quelqu'un l'a récitée » (leçon 307) — ici elle valait même là où quelqu'un
> l'avait récitée dans la BRANCHE VOISINE, et c'est la version la plus coûteuse de cette
> leçon, parce qu'elle rend le défaut invisible à la relecture : on lit la branche
> voisine, on y voit la règle, et on conclut que le fichier la tient.

## Pourquoi l'ÉCRITURE et pas la lecture — et la part que cela ne répare pas

`...unsetOrNull('messageId')` au site de lecture est la forme évidente. Elle est
écartée, et pas pour une raison de goût : elle ARME une suppression de masse sur
une population que personne n'a mesurée. La directive porteur du 2026-10-03 fait
attendre le feu vert à toute purge de données de production, et un balayage
journalier qui ramasse d'un coup un arriéré inconnu EST une purge.

`prisma-unset.ts` le dit déjà, et ce lot est le cas d'école de sa phrase : « écrire
la colonne rend les lectures exactes pour les lignes À VENIR, ce prédicat les rend
exactes pour celles DÉJÀ EN BASE. **Les deux moitiés ne se substituent pas l'une à
l'autre.** » Ce lot livre la première moitié. La seconde reste #19801.

| option | écartée parce que |
|---|---|
| `unsetOrNull` au site de lecture | purge un arriéré non mesuré, sans feu vert |
| une migration de rattrapage | même objet, et elle exige une sauvegarde vérifiée |
| les deux | l'arriéré d'abord mesuré, puis décidé : c'est le reste de #19801 |

**Et pour les lignes à venir, ce lot n'invente aucune politique** — c'est la
mesure qui a décidé du scope, parce que poser la clé rend bien les futures lignes
BALAYABLES, donc supprimables à 24 h :

- `UploadProcessor` pose déjà la clé à ses deux sites : toute pièce jointe de
  message téléversée par REST est soumise au seuil depuis toujours ;
- la branche `PostMedia` du même handler y est soumise aussi ;
- `isReferencedAsProfileMedia` protège déjà, dans ce même balayage, la population
  qui reste légitimement sans message (avatars et bannières).

### Ce que j'avais écrit ici était faux dans les deux sens, et l'audit l'a mesuré

La première version de ce paragraphe ajoutait : « la copie vocale d'un
enregistrement d'appel du web passe par REST, pas par TUS : **rien de nouveau
n'est exposé** de ce côté », et plus bas « le web borne à 50 Mo et passe par
REST ; TUS sert les publications côté Android ». **Trois affirmations, trois
fausses** :

| ce que j'avais écrit | la mesure |
|---|---|
| « le web **borne** à 50 Mo et passe par REST » | `SMALL_FILE_THRESHOLD` (50 Mo) est le seuil **AU-DESSUS** duquel le web passe par TUS — son propre commentaire le dit (« below this, use direct REST upload »). `uploadMessageAttachment` n'envoie aucun `uploadcontext`, donc **branche MESSAGE** |
| « TUS sert les **publications** côté Android » | `MediaGroupUploader.kt` et `CallRecordingUploader.kt` emploient `TusUploadContext.ATTACHMENT` ⇒ **branche MESSAGE** |
| « la question n'est pas close côté **iOS** » | iOS est le client le plus SÛR des trois : sa file hors ligne persiste des **chemins de fichiers locaux**, jamais un identifiant serveur. Le client exposé est le **WEB** |

**La conclusion du lot ne bouge pas, sa justification était fausse** — et c'est
une distinction qui compte, parce qu'une conclusion juste portée par une mesure
fausse est exactement ce qu'un cycle suivant relira comme acquis. Ce qui la
sauve est une mesure que je n'avais pas prise : `UploadProcessor` posant la clé
à ses deux sites, **toute pièce ≤ 50 Mo subit déjà ce sort par la voie REST.**
Le lot ÉTEND une politique en vigueur ; il ne la crée pas.

> **Une affirmation d'exposition se mesure sur le CHEMIN, pas sur le seuil.** Je
> savais qu'il existait un seuil de 50 Mo et j'en ai déduit une borne — j'ai lu
> la constante et pas son commentaire, qui dit laquelle des deux moitiés est
> REST. Un seuil ne dit jamais de lui-même de quel côté il garde.

**Ce que l'audit a trouvé derrière**, et qui est pire que ce que j'avais écarté :
le web persiste `upload.attachmentIds` dans IndexedDB, et
`perform-send.ts` rend cet identifiant tel quel à la reprise
(`if (upload.attachmentIds !== undefined) return upload.attachmentIds;`) — il ne
re-téléverse jamais. Un envoi de plus de 50 Mo dont le `POST /messages` a échoué,
repris 48 h plus tard, trouve donc une pièce que le balayage a supprimée, et
**rien n'efface l'identifiant** : l'entrée devient un « Réessayer » qui ne peut
plus jamais réussir, alors que le fichier est encore dans IndexedDB. Préexistant
pour tout envoi ≤ 50 Mo ; ce lot l'étend aux gros. C'est #19865.

Le lot aligne donc le quatrième créateur sur une politique EN VIGUEUR pour les
trois autres. Ce qu'il ne fait pas : décider si 24 h est le bon seuil pour un
média poussé par un gros téléversement — question réelle, qui n'est pas la
mienne, et qui est dite dans l'issue.

## Les témoins, et celui qui pouvait seul voir ce défaut

Trois ROUGES mesurés, trois raisons différentes :

1. **la clé est POSÉE** — et l'assertion est `toHaveProperty('messageId', null)`,
   jamais `data.messageId === null`. Sur une valeur nulle, les deux états que ce
   lot distingue sont indiscernables par comparaison de valeur : **le témoin
   aurait été vert sur le défaut** ;
2. **le témoin qui COMPOSE les deux unités** — la ligne que le handler CRÉE,
   évaluée par `matchesMongoWhere` contre la clause que le balayage ENVOIE,
   relevée sur l'appel réel. C'est la leçon du cycle 182 reprise telle quelle :
   « une règle qui s'exprime en deux unités demande un témoin qui les COMPOSE ».
   Les deux moitiés avaient des témoins chez elles — `tus-handler` en a seize
   fichiers, le balayage en a quatre — et le défaut vivait exactement dans
   l'espace entre les deux ;
3. **la parité des DEUX branches du même `else`**, qui épingle ce qui a rendu le
   défaut lisible : l'écart entre deux créations écrites par la même main, dans
   la même fonction.

Le double du balayage des orphelines (`maintenance-orphan-profile-media.test.ts`)
est de la forme que le cycle 182 a nommée : `findMany: jest.fn(async () =>
options.orphans)` rend ses lignes QUELLE QUE SOIT la clause. Il ne mentait pas
sur son sujet — il garde la protection des médias de profil, et il la garde bien
— mais **il ne pouvait pas voir une clause qui n'apparie rien**. Le témoin 2 ne
le remplace pas : il lui ajoute l'évaluation.

## Le cliquet : les créateurs, pas un idiome

`__tests__/attachment-pending-key-guard.test.ts` +
`__tests__/helpers/attachment-pending-key-sweep.ts`, inventaire d'infractions
**VIDE** : il n'y a pas de créateur légitime qui omette la clé, donc rien à geler.
Quand il tombe, la réparation est de poser la clé au site.

Trois décisions de forme, chacune avec sa raison :

- **il part des CRÉATEURS** — `create`, `createMany`, `upsert`, les trois façons
  dont Prisma fabrique une ligne. Aucun `createMany` ni `upsert` ne vit sur ce
  modèle aujourd'hui, et c'est exactement pourquoi ils sont vérifiés sur fixture :
  un balayage qui ne chercherait que la méthode VIVANTE mesurerait sa popularité,
  pas la propriété (règle du cycle 107, dont le balayage fut JETÉ plutôt que gelé) ;
- **un site NON RÉSOLU reste gardé.** Un `...spread` de premier niveau peut
  porter la clé ; ce qu'on ne sait pas se rend explicite AU SITE, jamais ici. La
  direction sûre d'un cliquet est le faux positif, qui fait regarder (cycle 182,
  constat A) ;
- **les commentaires et les contenus de chaînes sont blanchis**, et pas pour la
  raison habituelle seulement. Le commentaire que ce lot pose dans `tus-handler`
  CITE `{ messageId: null }` sur douze lignes : sans blanchiment, un créateur
  fautif se ferait absoudre par le commentaire qui le dénonce. Un témoin l'épingle.
  Le dépôt a déjà `stripCommentsPreservingStrings`
  (`__tests__/route-manifest/root-mounted-surfaces.ts`) et elle ne convient pas
  ici — elle GARDE les chaînes, parce qu'elle y cherche des chemins de route,
  quand ce balayage COMPTE DES ACCOLADES et qu'un `${…}` de gabarit fausse la
  profondeur. **La forme juste d'à côté s'ouvre contre le cas présent, elle ne se
  copie pas** (règle du cycle 91).

Et une BORNE avant les règles : le balayage doit voir au moins cinq créateurs et
nommer `tus-handler.ts`. Un balayage vide passerait les règles au vert pour la
pire des raisons — c'est ce que le cliquet du budget de taille a payé (#4531).

## Preuve

- **RED prouvé par mutation** (la ligne `messageId: null` retirée de
  `tus-handler`) : **4 témoins tombent** sur deux suites, et le cliquet NOMME le
  site — `routes/uploads/tus-handler.ts (create) : unresolved` ;
- `tus-handler-orphan-sweepable` **3 verts**, `attachment-pending-key-guard`
  **6 verts** ;
- les dix-sept suites de `routes/uploads/__tests__` : **123 verts, 1 rouge
  PRÉEXISTANT** — `tus-handler-heif-conversion` rend `415 Image format not
  supported` dans ce conteneur, où `sharp` n'a pas HEIF. Mesuré sur `dev` SANS
  mes changements : même rouge. Il est VERT en CI (le verdict de `4fc8cbdf4` ne
  nomme que le budget de taille), donc propre au conteneur, pas une issue.
  **Son jumeau est `ExifStrip.gain-map`**, dont le seul témoin rouge dit
  `heif-convert injoignable : spawnSync heif-convert ENOENT` : les deux rouges de
  la suite complète ont la MÊME cause — l'outillage HEIF absent du conteneur — et
  ni l'un ni l'autre ne touche la colonne de ce lot. **Deux rouges de même
  famille se vérifient séparément quand même** : j'ai ouvert le second plutôt que
  de le ranger sous le premier, et c'est ce qui a rendu son message, qui n'accuse
  pas `sharp` mais un binaire manquant ;
- les quatre suites de maintenance **60 verts** ; `gateway-file-size-budget`,
  `gateway-test-file-size-budget`, `soft-state-equality-filter-guard` **41 verts** ;
  `jest-ci-hidden-suites` + `tsc-never-loaded-tests-ratchet` **7 verts** ;
- `tsc --noEmit` sur `services/gateway` : **EXIT=0** ;
- suite passerelle complète et verdict CI : voir la PR et le commentaire de
  clôture de #19801.

## Ce qui n'a pas été mesuré, et ne doit pas se lire comme vert

- **L'ARRIÉRÉ.** Combien de lignes `tus` sans clé `messageId` existent en
  production, et quel volume de fichiers elles représentent : inconnu, aucune
  base dans ce conteneur. C'est la seconde moitié de #19801, et elle garde son
  issue ouverte.
- **Le comportement contre un vrai MongoDB 8** : la sémantique employée est celle
  que le dépôt porte déjà à plus de dix endroits (forme attestée), et
  `callRecordingLink.FREE_ATTACHMENT` la dit sur CETTE colonne de CE modèle.
  Non rejouée contre le moteur : #19739.
- **Le seuil de 24 h sur la population des gros téléversements** : un média de
  plusieurs centaines de méga-octets poussé en reprise est désormais supprimé
  s'il n'est pas envoyé dans la journée. C'est la politique déjà en vigueur pour
  les trois autres créateurs ; elle n'a jamais été instruite pour celui-ci.
- **Ce que les clients font d'une pièce jointe supprimée sous eux** : mesuré
  depuis, et ce n'est pas « aucun client ne le fait » — voir le § ci-dessus. Le
  WEB garde l'identifiant dans une file DURABLE et ne re-téléverse jamais ; iOS
  et Android gardent les octets, donc se réparent seuls. Le scénario web est
  établi par lecture du code, **pas par une recette navigateur** : il reste à
  exécuter (joindre plus de 50 Mo, couper le réseau au `POST /messages`, avancer
  l'horloge de 24 h, rejouer).

## Le troisième rouge de `dev` : il PASSE sur la tête, et le premier rejeu était le mien

« Gate contrôles d'appel » (`apps/web/scripts/check-calls-controls.mjs`,
tranche 4) est rouge en CI sur `4fc8cbdf4`. Rejoué ici une première fois, il a
rendu **8 invariants rompus sur 8**, tous sur le PREMIER sélecteur
(`[data-row] a`, le lien d'une ligne de liste), sans aucune erreur de page.
`apps/web/dist` était VIDE dans ce conteneur : le gate servait un `dist` sans
contenu, donc une page blanche.

> **Un gate qui échoue au même endroit sur tous ses cas n'a probablement pas
> commencé.** Huit scénarios indépendants — clair, sombre, vidéo, doigt, quatre
> tailles de vocal — qui tombent tous sur le premier sélecteur décrivent une
> absence de page, pas huit défauts. Le compte « 8 sur 8 » est l'indice, et il se
> lit avant d'ouvrir le premier message d'erreur. Publier ce rouge-là comme
> « troisième rouge de `dev` confirmé » aurait été une mesure de MON conteneur
> présentée comme une propriété du dépôt.

`apps/web` construit (`bun run build`, EXIT=0), le gate rejoué rend **255
invariants tenus, EXIT=0** sur la tête de `dev`. Aucun défaut à nommer, donc
aucune issue ouverte. Le rouge de `4fc8cbdf4` est soit un accident de CI, soit
déjà parti avec un lot fusionné depuis ; les runs de `dev` étant annulés les uns
par les autres à chaque poussée (`4fc8cbdf4` et `2f949a701` sont tous deux
`cancelled`), l'état de `dev` ne se lit pas sur un run isolé. **Si ce gate
rougit de nouveau sur un run complet, c'est un intermittent, et c'est à ce
moment-là qu'il mérite son issue** — pas avant, faute de quoi on ouvre une issue
sur une absence de mesure.

---

## L'audit adversarial a rendu NON BLOQUANT, et pour la TROISIÈME fois le défaut du lot était dans l'INSTRUMENT

Verdict **NON BLOQUANT** pour `dev` : le correctif d'une ligne est jugé juste,
minimal et conforme à la directive du 2026-10-03, et les trois témoins sont tous
falsifiables — l'audit l'a mesuré par trois mutations, dont une que je n'avais pas
faite (remplacer l'égalité du balayage par `{ isSet: false }`, qui fait tomber le
témoin composant et prouve qu'il évalue la clause RÉELLE).

> **Trois cycles de suite, le pire constat portait sur le cliquet que le lot
> livrait comme sa preuve** — cycle 181, cycle 182 (constat A), celui-ci. Ce n'est
> plus une coïncidence : **un lot dont la preuve est un instrument doit auditer
> l'instrument plus durement que la production**, parce que ni le `tsc` ni les
> témoins ne regardent là, et parce qu'un cliquet faux ment plus longtemps qu'un
> journal.

### Le constat qui attaquait la garantie elle-même : poser la clé ne suffit pas

`verdictOf` ne testait que la PRÉSENCE SYNTAXIQUE de `messageId`. Or **Prisma
IGNORE un champ `undefined` exactement comme un champ absent** — et le double du
dépôt l'écrit en tête (`helpers/mongo-where.ts`). Reproduit :

```
data: { messageId: peutEtre?.id, … }   ⇒  poses   ← VERT sur le défaut même
data: { messageId: undefined,    … }   ⇒  poses   ← VERT sur le défaut même
```

Un créateur écrit ainsi produit, sur le chemin où la chaîne est vide, un document
SANS la clé : le défaut du cycle 183, et le cliquet le bénissait.

**La discipline réelle du dépôt était plus forte que celle que j'avais lue.**
`UploadProcessor.ts:431` écrit `const finalMessageId = messageId || null;` —
PRÉCISÉMENT pour fermer ce cas. J'avais regardé ce site, j'y avais vu « la clé
est posée », et je n'avais pas demandé pourquoi il prenait la peine du `|| null`.

> **Une forme défensive voisine est une AFFIRMATION sur le piège qu'elle évite.**
> Quand un site de référence en fait plus que la règle qu'on en tire, l'écart est
> la règle — pas une précaution de style. La question à poser en lisant le site
> modèle n'est pas « applique-t-il ma règle ? » mais **« que fait-il de plus, et
> contre quoi ? »**.

Le balayage rougit désormais sur `undefined` littéral et sur toute chaîne
optionnelle, admet `null` / un identifiant simple / `x || null` / `x ?? null`, et
**dit ce qu'il ne décide pas** plutôt que de le cacher.

### Le second : une apostrophe impaire dans une regex éteignait la suite du fichier

`blanked` n'avait pas d'état « littéral de regex ». Sur `/[^']+/`, l'apostrophe
du jeu de caractères ouvrait une chaîne qui courait **jusqu'à la fin du fichier**,
et tout créateur situé plus bas devenait INVISIBLE. Le dépôt porte déjà un tel
motif (`jobs/backfill-search-tokens.ts` → `/for the field '([^']+)'/`), qui ne
doit sa survie qu'à la PARITÉ de ses quatre apostrophes : le parseur se recalait
par accident.

> **Une borne garde contre un balayage VIDE, jamais contre un balayage AMPUTÉ.**
> `sites.length >= 5` + `toContain('tus-handler.ts')` restaient VERTS avec un
> sixième créateur rendu invisible. La borne est désormais EXACTE — les cinq
> fichiers nommés — et c'est la seule forme qui attrape une amputation.

### Le troisième : « les DEUX lecteurs » étaient TROIS, et le troisième est une bonne nouvelle

`AttachmentService.associateAttachmentsToMessage` (deux sites) lit
`...unsetOrNull('messageId')` — l'ATTACHEMENT lui-même cherche « une pièce encore
libre », et il dit déjà les deux états d'absence.

Ce que cela change dépasse le compte : **l'arriéré d'avant #19801 reste
ATTACHABLE.** Une pièce sans la clé peut toujours rejoindre un message ; la seule
chose qu'elle perd est d'être balayée. Mon énumération était incomplète du
lecteur qui rendait le sort de l'arriéré le moins grave — c'est-à-dire du seul qui
répondait à la question ouverte du lot.

> C'est la leçon 261 retournée contre moi dans le lot qui la cite : **une
> énumération de lecteurs porte deux affirmations**, « ceux-là lisent » (vrai) et
> « ce sont ceux qui lisent » (jamais vérifié). Je l'avais appliquée aux
> CRÉATEURS, mesurés par commande ; j'ai énuméré les LECTEURS de mémoire.

### Le quatrième : un second registre là où le dépôt en avait un

La clause nue que ce lot CONSERVE n'était gardée par aucun cliquet de FILTRE —
`soft-state-equality-filter-guard` existe exactement pour cela, et son périmètre
(`COLONNES`) ne portait pas `messageId`. Une seconde égalité nue écrite demain
ailleurs sur cette colonne ne rougirait nulle part : le cliquet neuf ne regarde
que les CRÉATEURS. `messageId` y est désormais inscrit, borné à
`messageAttachment` (le seul modèle où la colonne est optionnelle), avec sa
discipline d'écriture mesurée.

Et une erreur de plus, dite parce que le témoin l'a dite : j'ai écrit `sites: 5`
en pensant « cinq créateurs », quand ce champ compte les LECTURES nues du fichier
(une). **Un champ compte ce que son témoin compte, jamais ce que son nom
suggère** — et c'est le témoin « une discipline gelée couvre le NOMBRE de sites
qu'elle a mesuré » qui l'a rendu, du premier coup.

### Les suivis ouverts

| constat | issue |
|---|---|
| le web garde l'identifiant d'une pièce supprimée et ne re-téléverse jamais : « Réessayer » impossible à vie | #19865 |
| le seuil de 24 h pour un gros téléversement reprenable n'a jamais été instruit | #19866 (`décision-produit`) |
| les quatre formes de création que le balayage ne voit pas (alias, index, imbriquée, littéral de `createMany`) | #19867 |
