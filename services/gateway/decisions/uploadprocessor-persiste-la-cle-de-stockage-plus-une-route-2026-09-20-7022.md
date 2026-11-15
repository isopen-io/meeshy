## `UploadProcessor` persiste la CLÉ DE STOCKAGE, plus une route (2026-09-20, #7022)

**Contexte.** #4324 a tranché ce qui se persiste : « la clé de stockage, jamais
une adresse : ni hôte, ni préfixe d'API, ni version. » La base ne l'avait jamais
appliqué. Mesuré en production le 2026-09-18 sur 2 912 références : 1 600 en
adresse ABSOLUE (`https://gate.meeshy.me/api/v1/attachments/file/<clé>`), 574 en
ROUTE RELATIVE (`/api/v1/attachments/file/<clé percent-encodée>`), 738 en clé
nue. Le producteur de l'absolu est mort ; celui de la route relative,
`UploadProcessor.getAttachmentPath`, était VIVANT — dernière ligne écrite le
2026-09-16.

**Décision.** `getAttachmentPath` rend `filePath` tel quel. Les cinq appels
qu'il sert (variantes responsive, fichier et vignette d'un upload simple,
fichier et vignette d'un upload chiffré) gravent donc la clé : `fileUrl` et
`filePath` portent désormais la MÊME valeur, et `tus-handler` — qui écrivait
déjà `const fileUrl = relPath` — cesse d'être le seul producteur conforme.

**L'ordre n'est pas commutatif, et c'est la raison d'être de ce lot isolé.**
Normaliser la base avant de tarir la source aurait payé une migration pour un
sursis : chaque téléversement suivant regravait une route, et le relevé suivant
n'aurait pas su distinguer une survivante d'une nouvelle. Le balayage
(`scripts/normalize-media-urls.ts`, déjà écrit, jamais joué en production) vient
APRÈS.

**Ce que la clé n'ajoute à personne.** Elle est le cas NOMINAL de
`resolveAttachmentSrc` (web-v2) et a sa branche explicite dans
`MeeshyConfig.resolveMediaURL` (iOS). Côté passerelle, les deux sites qui
doivent composer une adresse le font déjà : `publicMediaUrlFromEnv` (fil push et
archive `/me/export`) reconnaît la clé par `STORAGE_KEY_SHAPE`, et
`MediaService.relativePathFromUrl` — le site qui EFFACE les octets — a sa
branche `estUneCle`. La clé RETIRE une forme à supporter, elle n'en ajoute pas.

**La fonction est l'identité, et elle reste nommée.** Ce site porte la DÉCISION
de ce qui atteint la base : l'inliner disperserait en cinq appels un choix qui
doit se changer en un endroit. `getAttachmentUrl` et `buildFullUrl` — les deux
composeurs d'absolu que garde `absolute-media-url-sweep.test.ts` — n'ont, eux,
aucun appelant de production.

**Le témoin n'interroge pas la fonction**, mais ce qui part dans
`prisma.messageAttachment.create`
(`__tests__/unit/services/uploadProcessorPersistsStorageKey.test.ts`) : le
témoin des variantes responsive calculait son attente PAR `getAttachmentPath` et
serait resté vert quelle que soit la forme rendue. Il compare désormais des clés
littérales.

**Ce que la décision n'assure PAS.** Les 2 174 références non nues déjà en base
restent telles quelles jusqu'au balayage — la décision d'exécution revient au
porteur. `PostMedia` écrit par `publishAttachment` porte une clé `snapshots/…`,
hors `STORAGE_KEY_SHAPE` par construction, et n'est pas visé.
