# Le TEXTE qui accompagne un média protégé voyageait sans la loi qui le nomme (#19978)

*2026-11-20. Journal daté : l'état des tâches vit dans les issues.*

## Le défaut

`mediaSideContent.ts` énonce, en PREMIÈRE ligne de son en-tête, ce qu'il
gouverne :

> « Ce qui voyage À CÔTÉ d'un média — **sa transcription en sous-titres**, sa
> description textuelle et ses traductions — et la loi UNIQUE qui décide s'il en
> a le droit. »

La loi était appliquée à **deux** endroits : `alt` (`servedDescription`) et les
sous-titres (`servedSubtitles`). **La première rédaction de ce journal disait
« quatre » en y comptant les projections d'administration — mesuré faux, et
c'est l'audit qui l'a relevé** : celles-ci appellent `mediaAttachmentIsProtected`,
un prédicat DIFFÉRENT qui ouvre sur un éphémère non échu (`expiresAt <= now`)
et sur une pièce chiffrée (`maskedAttachment` ne lit pas `isEncrypted`, et son
doc-comment l'assume). Il y a donc **deux lois homonymes**, et c'est devenu un
complément de #20017.

La loi n'était pas appliquée sur les **deux chemins les plus fréquentés**, qui
répandent la ligne brute :

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

**Le lot ferme la transcription ORIGINALE, et RIEN de plus.** Sa première
rédaction retirait aussi les mots des pistes traduites ; l'audit adversarial l'a
interdit par deux mesures — voir ci-dessous. Le texte traduit reste servi, et
c'est désormais une **dette ÉCRITE au site** (#20015), pas un oubli.

**`servedDescription` n'a plus AUCUN appelant de production** — mesuré par
l'audit, et la première rédaction de ce journal affirmait le contraire. Un helper
à zéro appelant ne documente rien : il ATTEND qu'on l'utilise, et le prochain qui
le fera appliquera la moitié de la loi en croyant l'appliquer. Un cliquet
l'interdit désormais aux fichiers de production
(`__tests__/side-content-single-door.test.ts`).

**Le type suit la LIGNE** (`ServedSideContent<R>`) : un appelant dont le contrat
déclare `transcription: TranscriptionBlob` le retrouve, nullable. Rendre
`unknown` aurait obligé chaque appelant à caster — c'est-à-dire à réaffirmer à
la main ce que la loi vient de garantir.

## Preuve

- 6 témoins sur la loi, 3 sur le sérialiseur socket, 6 sur le CONTRAT DE SÉRIALISATION (la garde de C1), 2 sur la porte unique ;
- chaque garde tombe sous SA mutation : transcription non gardée (**5 rouges**),
  mots des pistes gardés (**3**), porteur ignoré (**3**) ; intact **33/33** ;
- `tsc --noEmit` EXIT=0.

## Ce que l'audit adversarial a cassé, et qui a REDUIT le lot

Verdict rendu : **BLOQUANT**, et justifié. Deux constats ont retourné le lot
contre lui-même.

### C1 — CRITIQUE : le lot rendait `GET /messages` et `GET /sync` en **500**

`messageAttachmentSchema` déclare `transcription` **REQUISE** sur chaque entrée
de la carte des pistes
(`packages/shared/types/api-schemas/message-attachment.ts:333-335`), et
`fast-json-stringify` **lève** sur une clé requise absente. Reproduit à nu,
puis vérifié sur le schéma partagé réel :

```
FULL    : {"translations":{"fr":{"type":"audio","transcription":"secret",…}}}
STRIPPED THREW: Error | "transcription" is required!
```

Donc **500 sur la PAGE ENTIÈRE**, pas sur la pièce. Et sur `/sync`, la
pagination par curseur ramenant la même ligne à chaque tentative, le rattrapage
delta était bloqué **définitivement** pour ce lecteur.

Le déclenchement est NOMINAL : la loi ferme sur tout `expiresAt` POSÉ, et une
conversation en messages éphémères le pose à la CRÉATION — le pipeline audio
n'ayant par ailleurs aucun gate de protection, un vocal y reçoit bien ses pistes.

> **Un correctif de confidentialité qui casse la lecture d'une page entière est
> pire que la fuite qu'il ferme.** Et il était invisible à la suite complète
> (2 945 suites vertes) : aucun témoin ne faisait traverser le sérialiseur à une
> pièce PROTÉGÉE portant une piste traduite. C'est désormais le cas
> (`sideContent.serializerContract.test.ts`, 6 témoins, rouge sous la
> réintroduction du retrait — avec le message d'erreur exact).

### C5 — le lot gardait le MÉDIUM et retirait la seule chose qui l'ÉLIT

La justification centrale de la première rédaction — « il retient le TEXTE,
jamais le MÉDIUM » — est défaite par la loi du cycle 128 que le dépôt énonce
lui-même : *la piste est élue par la langue du TEXTE SERVI*. Vider les mots sans
vider la carte fait retomber le web sur la piste ORIGINALE (donc les `url`
« gardés » deviennent inatteignables, et la bulle affiche le nom de fichier),
pendant qu'iOS, qui élit sur les langues DISPONIBLES, joue la piste traduite
sans aucun texte. Deux clients divergents sur la même charge, sur toute
conversation éphémère.

> **« Garder le médium » n'est une position tenable que si quelque chose sait
> encore l'élire.** Le lot avait séparé le texte et le médium comme deux
> familles indépendantes ; ils sont couplés par la loi d'élection, et c'est
> écrit dans le `CLAUDE.md` que le lot cite par ailleurs.

### Les trois autres, qui ne sont pas de ce lot mais le mettent en perspective

- **#20016** — deux canaux audio (`audio:transcription-ready`,
  `audio:translation-ready`) émettent la transcription entière à la room **depuis
  la même fonction**, quelques lignes avant le canal que ce lot garde. Et le web
  lit un `transcription: null` comme « pas encore enrichi, je garde le mien », ce
  qui rend la garde de ce lot **inerte pour ce lecteur** tant que #20016 est
  ouvert. C'est la question du cycle 122 — *qui AFFICHE ce que tu élis ?* —
  posée à une garde.
- **#20017** — cinq portes REST servent le même texte, dont une aux visiteurs
  ANONYMES de lien de partage, et une à quarante lignes de sa jumelle qui le
  refuse.
- **#20018** — la citation d'un vocal éphémère porte sa transcription entière :
  `quotedMessageIsProtected` ne lit pas `expiresAt`.

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
