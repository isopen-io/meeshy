## Cycle 201 — le chemin disque interne ne part plus sur le fil (#20048)

**Date** : 2026-11-21. **Base** : `dev` à `79b8991bf1`. **Issue** : #20048.
**Milestone** : #288.

### Le défaut

`GET /attachments/:id/metadata` servait `MessageAttachment.filePath` — le chemin
de STOCKAGE du serveur — à tout membre actif de la conversation, invités de lien
partagé compris (la route est `authOptional` + garde d'appartenance) :

```
attachments/2026/11/68f2a81417a557e8ce4ddfc1/memo_8b1f0c1e.m4a
```

Rien d'exploitable seul. Mais la racine, le partitionnement par
année/mois/conversation et la convention `<base>_<hash8>.<ext>` sont exactement
ce qui transforme une traversée de chemin, un rendu d'erreur bavard ou un accès
S3 mal borné en lecture **ciblée**. De la reconnaissance offerte, et sans aucun
lecteur.

### La mesure qui précède le retrait

Retirer un champ d'un contrat PARTAGÉ est un changement de contrat, et la
production est rétrocompatible par directive (#9223, #9231). La question du
cycle 122 se posait donc à l'envers — non pas « qui affiche ce qu'on sert ? »
mais **« qui LIT ce qu'on retire ? »** :

| décodeur d'API | déclare `filePath` ? |
|---|---|
| web (`apps/web/src`) | **non** — les seules occurrences sont un chemin LOCAL du plugin Capacitor de pellicule |
| `APIMessageAttachment` (Swift) | **non** — ni `filePath`, ni `file_path` dans son `CodingKeys` |
| `ApiMessageAttachment` (Kotlin) | **non** — aucune occurrence |
| les deux `struct Decodable` des appelants iOS de CETTE route | **non** — ils lisent `isEncrypted` et `fileUrl` |

Les deux seuls types clients qui portent un `filePath` de pièce jointe
(`MeeshyMessageAttachment` Swift, son miroir `Core.kt`) sont des modèles
**domaine/cache** que le fil n'alimente pas : le mapper iOS ne passe pas le
champ, et Android n'a ni producteur ni lecteur. Aucun lecteur mesuré, donc aucun
client à casser.

### Les DEUX moitiés, coupées ensemble

| moitié | site | ce qu'elle coupe |
|---|---|---|
| le CONTRAT | `messageAttachmentSchema` | l'ÉMISSION — `fast-json-stringify` retire désormais le champ |
| la PROJECTION | `getAttachmentWithMetadata` | le CHARGEMENT — la valeur ne monte plus jusqu'au sérialiseur |

Les deux, et c'est la règle du cycle 84 lue dans ses deux sens :

- le `select` **seul** laisserait la déclaration publier la prochaine route qui
  réutilise `messageAttachmentSchema` avec un `select` qui porte le champ —
  « compter sur une omission de schéma pour retenir un secret est un piège armé,
  pas une protection », et ici l'arme était déjà chargée, le cran de sûreté
  étant un `select` ;
- le contrat **seul** laisserait la lecture charger le chemin, à un spread de
  distance d'une réponse.

**La COLONNE Prisma et ses deux index restent.** Une douzaine de lectures
internes résolvent le chemin disque pour lire les octets (`getFilePath`,
`getThumbnailPath`, la copie au transfert, le pipeline audio, le miroir
d'objets) ; aucune ne sérialise. Le champ interne n'est pas le défaut — le
SERVIR l'était.

### `thumbnailPath` était déclaré, jamais chargé, et il est parti aussi

Le critère de fin de l'issue demandait de « vérifier la même question pour
`thumbnailPath`, s'il est déclaré (non vérifié) ». Il l'était, et **aucun
`select` du dépôt ne le charge** : la déclaration était donc inerte, et lue par
personne sur les trois clients.

Inerte n'est pas inoffensif — c'est la définition même du piège armé, et le
témoin l'a prouvé : la fixture le fournit, et il **sortait** sur le fil. Il part
avec son jumeau, dans le même lot, pour la même raison.

### Le ROUGE, et deux témoins qui ne voient pas la même chose

| mutation | témoins rouges |
|---|---|
| `filePath` remis dans le **SELECT** seul | **1** — la projection. Les témoins de sérialisation restent VERTS |
| `filePath` remis dans le **CONTRAT** seul | **2** — la sérialisation. Le témoin de projection reste VERT |

Les deux distributions sont **disjointes**, et c'est la preuve que les deux
moitiés exigent deux témoins. Le dépôt le dit déjà : **un double Prisma rend ce
qu'on lui dit quel que soit le `select`** — la projection est la seule des trois
moitiés d'une règle qu'un témoin de comportement ne peut pas observer. Le témoin
de projection assert donc sur la **REQUÊTE**, jamais sur le rendu.

Le témoin de sérialisation, lui, traverse le vrai `fast-json-stringify`
(`app.inject()`, schémas partagés NON doublés — mocker les schémas partagés
désarme précisément la couche qu'on mesure), et il porte trois assertions dont
une se lit à l'œil : **aucune des deux chaînes de chemin n'apparaît dans le
corps**, à quelque profondeur et sous quelque nom de clé que ce soit. Elle
attrape ce qu'un `not.toHaveProperty` manque — un chemin recopié ailleurs.

### Le témoin NÉGATIF, dans les deux fichiers

Un retrait trop large ne se verrait pas sans lui. Chaque témoin porte donc son
contrôle : la route sert toujours `fileUrl`, `fileName`, `mimeType` et
`fileSize` ; le `select` demande toujours ces mêmes colonnes. Sans eux, un
`select` vidé par accident — ou une lecture qui cesse d'être appelée — rendrait
les assertions de retrait vertes pour la mauvaise raison.

### Ce que ce lot NE fait pas

`AttachmentSchemas.full` (`packages/shared/utils/validation-media.ts`) déclare
`filePath` en Zod **REQUIS** et n'a, mesuré, **aucun consommateur** — sa seule
autre occurrence du dépôt est sa ré-exportation. Les deux champs y sont alignés
sur le contrat servi, parce que laisser une jumelle divergente est ce que le
dépôt refuse ; mais le fait qu'un schéma de validation entier n'ait aucune
frontière qui l'exécute est un constat DISTINCT, de la famille de #20102 (« un
contrat déclaré par quatre sites et écrit par personne »), et il ne se solde pas
dans un lot de confidentialité.
