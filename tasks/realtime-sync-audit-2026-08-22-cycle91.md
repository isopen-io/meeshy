# Cycle 91 — La forme juste était trois cents lignes plus bas, et elle tronquait aussi

**Date** : 2026-08-22
**Branche** : `claude/keen-hamilton-inwn81`
**Périmètre** : passerelle — `routes/voice/translation.ts`, `routes/voice/types.ts`

**Clients touchés** : aucun changement de code client. Aucun nom d'événement
ajouté ni retiré, aucune charge utile temps réel modifiée, aucune ligne de
Socket.IO touchée. Quatre réponses REST gagnent des champs — voir §5.

---

## 1. D'où vient ce cycle

L'inventaire du cycle 90 (§9) nommait trois sites de `voice/translation.ts` :
`attachment` × 2 (200 et 202) et `transcription` × 1, tous
`{ type: 'object', nullable: true }` — donc `{}` dès que la valeur n'est pas
`null`.

La vérification d'usage du cycle 88 répond **oui** : l'enveloppe `{ success, data }`
est correctement décrite, la déclaration s'applique, le champ sortait vraiment
vide.

## 2. Le producteur, et le superset

Deux méthodes de `MessageTranslationService` alimentent ces champs, et elles se
rangent proprement :

| producteur | champs d'`attachment` |
|---|---|
| `translateAttachment` / `transcribeAttachment` | `id`, `messageId`, `fileName`, `fileUrl`, `duration`, `mimeType` |
| `getAttachmentWithTranscription` | les six + `originalName`, `fileSize`, `bitrate`, `sampleRate`, `codec`, `channels`, `createdAt` |

Même relation pour `transcription` : le chemin base64 de `POST /voice/translate`
en construit une INLINE de quatre champs (`text`, `language`, `confidence`,
`durationMs`), quand `getAttachmentWithTranscription` en rend huit
(`id`, `source`, `segments`, `createdAt` en plus).

**Déclarer le SUPERSET est le seul choix qui ne tronque aucun des deux.** Une
clé déclarée que l'objet ne porte pas n'est pas fabriquée par le sérialiseur ;
une clé portée et non déclarée est supprimée. L'asymétrie décide.

## 3. Ce que ce cycle a trouvé en plus : la forme « juste » tronquait

Le même fichier portait déjà, trois cents lignes plus bas, un
`attachment: { type: 'object', properties: { … } }` en toutes lettres sur
`POST /voice/transcribe` — la forme que les trois sites nus auraient dû copier.
C'est la troisième fois de la session que la bonne forme se trouve à portée de
regard du défaut (cycles 84, 89).

**Sauf qu'elle était fausse aussi.** Elle déclarait les six champs du producteur
COURT, et cette route sert le producteur LONG. Mesuré au compilateur, sur le
schéma tel qu'il était :

```
in  : attachment { id, messageId, fileName, originalName, fileUrl, mimeType,
                   fileSize, duration, bitrate, sampleRate, codec, channels, createdAt }
out : {"id","messageId","fileName","fileUrl","duration","mimeType"}
```

Perdus à chaque appel : `originalName`, `fileSize`, `bitrate`, `sampleRate`,
`codec`, `channels`, `createdAt` — soit toute la fiche technique de l'audio,
sur la route dont c'est précisément le sujet. `transcription` perdait `id` et
`createdAt`. Et **`translatedAudios` n'était pas déclaré du tout** : produit par
les trois chemins de la route, supprimé par le sérialiseur sur les trois.

Le balayage ne voit pas cette forme-là de défaut, et ne le peut pas : le schéma
porte des `properties`, il n'est donc pas « nu ». **Une déclaration n'est juste
que CONTRE SON PRODUCTEUR** ; l'outil vérifie qu'il y en a une, jamais qu'elle
dit vrai.

## 4. `translatedAudios` reste SANS `items`, et c'est délibéré

Les deux producteurs de cette clé n'ont pas la même forme :

| producteur | forme |
|---|---|
| `translateSync().translations` | `targetLanguage`, `translatedText`, `audioBase64`, `audioUrl`, `durationMs`, `voiceCloned`, `voiceQuality` |
| `getAttachmentWithTranscription().translatedAudios` | `id`, `targetLanguage`, `translatedText`, `audioUrl`, **`audioPath`**, `durationMs`, `format`, `voiceCloned`, `voiceQuality`, `createdAt` |

Déclarer l'une tronquerait l'autre. Et un tableau sans `items` **laisse passer
ses éléments intacts** — mesuré au cycle 90, redit ici :

```
schéma : { success: { type: 'array' } }
out    : {"success":[{"a":1,"b":{"c":2}}]}      ← intact
```

Le laisser non typé n'est donc pas un oubli mais la seule déclaration qui ne
mente pas sur cette clé aujourd'hui. Unifier les deux formes de producteur est
un lot en soi, et il commence par une décision sur `audioBase64` / `audioPath`,
que rien ne tranche ici. Un commentaire le dit sur place.

## 5. Ce qui change dans les réponses

- `POST /voice/translate` (200) : `attachment` et `transcription` portent leurs
  champs au lieu de `{}`.
- `POST /voice/translate/async` (202) : `attachment` idem.
- `POST /voice/transcribe` (200) : `attachment` gagne ses **sept** champs
  tronqués, `transcription` ses deux, et `translatedAudios` cesse d'être
  supprimé.

Aucune réponse ne perd de champ.

## 6. Témoins

`voice/translation.test.ts` : 6 témoins neufs à travers `app.inject()`, qui
assertent sur des VALEURS et couvrent les deux producteurs, les deux longueurs
de transcription et les trois chemins.

**ROUGE prouvé : 6 des 6 tombent** contre la version `main` du fichier de routes.

Le témoin du chemin base64 mérite d'être lu : il vérifie que le superset sert
les quatre champs courts **et ne fabrique pas les quatre autres**. C'est la
propriété exacte qui rend le superset sûr, et elle valait d'être gardée plutôt
que raisonnée.

`response-schema-sweep.test.ts` : l'inventaire gelé passe de **11 à 8**.

### Le lot a cassé 39 témoins, et c'est le plus utile qu'il ait produit

La suite complète a rendu `1 failed, 813 passed` — et pas sur une assertion :

```
FastifyError: Failed building the serialization schema for POST: /api/v1/voice/translate,
due to error schema is invalid: data/properties/data/properties/attachment must be object,boolean
```

**La route ne se CONSTRUISAIT plus.** `voice-translation.test.ts` remplaçait
`routes/voice/types` par un double qui listait trois schémas à la main, « pour
éviter les dépendances complexes ». `voiceAttachmentSchema` et
`voiceTranscriptionSchema`, nés dans ce cycle, en revenaient donc `undefined`,
et AJV refusait le schéma entier.

C'est exactement la mise en garde que `services/gateway/CLAUDE.md` porte depuis
le cycle 86 — *« ne pas mocker les schémas partagés dans un témoin de
sérialisation »* — rencontrée pour la première fois par son autre bout : non pas
un double qui cache un défaut, mais un double qui **empêche un correctif de se
charger**. Un double PARTIEL d'un module perd en silence tout ce que le module
GAGNE ; la seule question est de savoir si la perte se voit.

Ici elle s'est vue, bruyamment, parce que la perte portait sur la couche que ces
témoins traversent. Elle aurait pu ne pas se voir du tout — c'est le cas de
figure du cycle 86.

**Réparé en PROLONGEANT au lieu de remplacer** : le double disparaît, la suite
exécute les vrais schémas. L'intention de sécurité d'origine — garantir que
`getUserId()` ne réintroduise pas le repli sur l'en-tête client `x-user-id`
(usurpation d'identité complète, CWE-290 / CWE-807) — est **mieux** servie : un
double ne pouvait qu'ATTESTER l'absence du repli, le vrai code la PROUVE. 39/39
verts.

## 7. Coût

Nul. Trois déclarations remplacées par deux constantes partagées, une quatrième
élargie, une clé ajoutée. Aucune requête, aucun chemin de code, aucun handler
touché.

## 8. Ce que ce cycle laisse ouvert

**Inventaire : 8 sites restants** :

| champ | sites |
|---|---|
| `message` × 2 | `conversations/messages-advanced.ts` |
| `sender` | `messages.ts` — dette de FORME seulement (cycle 88) |
| `creator`, `details`, `link`, `permissions`, `user` | un par un |

**Reconnaissance faite pour le cycle suivant** (`messages-advanced.ts`) — pour
qu'il parte informé plutôt que de la refaire :

- Les deux sites sont les réponses d'ÉDITION (`message: { type: 'object',
  description: 'Updated message object' }`), et leur enveloppe `{ success, data }`
  est correctement décrite : la déclaration s'applique, le champ sort bien `{}`.
- Le producteur est un `prisma.message.update({ include: … })` **profond** :
  `sender` (avec son `user`), `replyTo` (avec le sien), plus les champs de
  message. Le déclarer complètement est un travail de recensement, pas une
  substitution de constante — et le déclarer À MOITIÉ tronquerait, ce que le
  §3 de ce cycle vient de montrer en vrai.
- **Aucune dimension de PRÉSENCE**, vérifié : ni `isOnline` ni `lastActiveAt`
  dans les deux `select`. La règle du cycle 84 — réparer ce qui rendait une
  donnée invisible oblige à poser la visibilité dans le MÊME lot — ne s'applique
  donc pas ici. C'est le genre de fait qui coûte cinq minutes à établir et qui
  décide de la taille du lot.

Et, propre à ce cycle :

- **`translatedAudios` a deux formes de producteur** (§4). Les unifier suppose
  de trancher `audioBase64` contre `audioPath`, ce qui touche les clients.
- **Le balayage ne détecte pas une déclaration INCOMPLÈTE**, seulement une
  déclaration ABSENTE. C'est la dette la plus intéressante que laisse ce cycle :
  la forme du §3 est invisible à l'outil et n'a été trouvée qu'en ouvrant le
  producteur. Un balayage qui comparerait les `properties` déclarées aux clés
  qu'un handler construit serait un outil différent, et beaucoup plus ambitieux.
- Dettes reconduites : le balayage ignore l'enveloppe (cycle 88) et
  `packages/shared` (cycle 89) ; `npx eslint` échoue dans ce conteneur
  (cycle 79).

## 9. La leçon

> **Une déclaration n'est juste que contre son PRODUCTEUR.** Le fichier portait
> la « bonne forme » trois cents lignes sous le défaut, et la copier aurait
> propagé une troncature de sept champs — parce que cette bonne forme avait été
> écrite contre l'autre producteur. Le cliquet du balayage garde contre
> l'ABSENCE de déclaration ; rien ne garde contre une déclaration qui dit faux,
> sinon ouvrir le producteur.

Et le corollaire, sur le choix de la forme quand il y en a deux :

> **Entre deux producteurs, on déclare le SUPERSET.** L'asymétrie du sérialiseur
> le permet et le commande : une clé déclarée qu'un objet ne porte pas n'est pas
> fabriquée, une clé portée et non déclarée est supprimée. Le superset est donc
> sans risque dans un sens et le seul correct dans l'autre. Quand les deux
> producteurs se CONTREDISENT au lieu de s'emboîter — `translatedAudios` — il
> n'y a pas de superset, et ne rien déclarer est plus honnête que d'en choisir
> un.
