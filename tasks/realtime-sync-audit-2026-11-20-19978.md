# Le TEXTE qui accompagne un média protégé voyageait sans la loi qui le nomme (#19978)

*2026-11-20. Journal daté : l'état des tâches vit dans les issues.*

## Le défaut

`mediaSideContent.ts` énonce, en PREMIÈRE ligne de son en-tête, ce qu'il
gouverne :

> « Ce qui voyage À CÔTÉ d'un média — **sa transcription en sous-titres**, sa
> description textuelle et ses traductions — et la loi UNIQUE qui décide s'il en
> a le droit. »

La loi était appliquée à **quatre** endroits : `alt` (`servedDescription`), les
sous-titres (`servedSubtitles`), et les deux projections d'administration
(`sovereign-message-projection.ts:442`, `admin/content.ts:458`). Elle ne l'était
pas sur les **deux chemins les plus fréquentés**, qui répandent la ligne brute :

| chemin | ce qu'il sert | ce qu'il gardait |
|---|---|---|
| `serializeAttachmentForSocket` | `message:new`, `message:edited`, `message:attachment-updated` — **et la file de rejeu, 48 h** | `alt` seulement |
| `cleanAttachmentsForApi` (`messages-list-query.ts`) | la liste REST | `alt` seulement |

Les deux composaient `{ ...ligne, ...servedDescription(ligne) }` : la
description passait sous la loi, et `transcription` passait **juste à côté**,
dans le même objet littéral. `servedAttachmentTranslations` ne retire que
`path` — jamais les mots.

Pour un **VOCAL à vue unique édité** : #19939 signe désormais l'adresse du
fichier, et la même entrée Redis gardait 48 h, **en clair**, tout le texte
prononcé (`transcription.text`, `transcription.segments[].text`) et sa
traduction (`translations[lang].transcription`, `.segments[].text`).

> **L'adresse est gardée, les mots ne le sont pas.** C'est la leçon 275 — « une
> protection de CONTENU se mesure sur tout ce que la charge TRANSPORTE, jamais
> sur sa seule chaîne » — appliquée au module qui la cite. La garde existait,
> bien écrite, bien motivée, et elle gardait UN champ sur trois : celui pour
> lequel elle avait été ajoutée.

## Ce qui a été livré

`servedSideContent` (`services/attachments/mediaSideContent.ts`) est le site
unique que l'en-tête décrivait depuis #11329 et qui n'existait pas. Les deux
chemins l'appellent à la place de `servedDescription`.

**La loi retient le TEXTE, jamais le MÉDIUM.** `transcription` et `segments`
d'une piste traduite partent ; `url`, `durationMs`, `format`, `voiceModelId`
restent — ils ont leur propre loi, et elle est plus forte : `fileUrl` et
`translations[].url` sont **signés pour le lecteur nommé** (#9646), donc
l'adresse d'une piste protégée est une CAPACITÉ que la route re-juge, pas une
fuite. Les retirer tous les deux aurait été plus simple et plus faux.

`servedDescription` reste exporté : il a des appelants qui ne servent QUE la
description, et leur faire rendre `transcription: null` leur ajouterait une clé
qu'ils ne portent pas.

**Le type suit la LIGNE** (`ServedSideContent<R>`) : un appelant dont le contrat
déclare `transcription: TranscriptionBlob` le retrouve, nullable. Rendre
`unknown` aurait obligé chaque appelant à caster — c'est-à-dire à réaffirmer à
la main ce que la loi vient de garantir.

## Preuve

- 6 témoins sur la loi, 3 sur le sérialiseur socket (famille par famille) ;
- chaque garde tombe sous SA mutation : transcription non gardée (**5 rouges**),
  mots des pistes gardés (**3**), porteur ignoré (**3**) ; intact **33/33** ;
- `tsc --noEmit` EXIT=0.

## Ce qui sort de ce lot, et pourquoi

**`thumbHash` → #20006.** Il est servi sans aucune loi, et la distinction qui le
rend intéressant n'est pas « est-il protégé ? » mais **qui le re-juge au moment
où il sert** : `fileUrl` est une adresse que la route réexamine (loi de sortie,
scellement, signature) ; `thumbHash` est ~20 octets qui décodent en image **côté
client, sans requête**. Pour une vue unique consommée ou une éphémère échue, la
route refuse le fichier et la vignette continue de rendre.

Lui appliquer `mediaSideContentMayTravel` tel quel serait pourtant faux : la loi
ferme aussi sur le FLOU, où l'image elle-même voyage — on ne protégerait rien et
on perdrait le placeholder. Le périmètre juste est plus étroit que la loi
existante, et le choix de ce que l'utilisateur voit à la place est une décision
produit. D'où une issue, pas un correctif.

`fileName` / `originalName` suivent la même issue, avec un enjeu moindre et une
réponse qui peut légitimement différer.
