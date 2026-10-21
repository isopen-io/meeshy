## Toute route de fichier sert les plages, un ETag et `immutable` sur une clé écrite une fois (2026-10-21, #11265)

**Statut** : Accepté

### Contexte
`GET /attachments/:id` et sa miniature envoyaient le fichier entier en un flux,
sans plage, sans validateur : un lecteur vidéo posé sur cette adresse attendait
la fin du téléchargement. La route par chemin et l'adresse signée ne servaient
des plages qu'aux types audio et vidéo, et gardaient un cache long sans
`immutable` sur des clés que rien ne réécrit.

### Décision
- UN transport, `streamStoredFile` (`routes/attachments/download.ts`), pour les
  quatre routes de fichier : plages 206 (suffixe `bytes=-N` compris), 416 hors
  bornes, `ETag` faible (taille + mtime), 304 sur `If-None-Match` en
  comparaison faible, `If-Range` qui ne désigne pas la version servie ⇒ fichier
  entier, `Accept-Ranges`, `Vary: Accept` AJOUTÉ à l'existant.
- La REPRÉSENTATION (type, `Content-Disposition`, garde SVG, `nosniff`) reste
  propre à chaque route.
- Le validateur et le cache ne décrivent qu'une réponse réussie (200, 206, 304),
  jamais un 416.
- Une clé dont le dernier segment porte l'UUID d'un envoi
  (`UploadProcessor.generateFilePath`, `tus-handler`) est écrite une fois : son
  cache ORDINAIRE devient `private, max-age=31536000, immutable`
  (`immutableWhenWriteOnce`, `services/attachments/fileRouteVerdict.ts`). Une vue
  unique (`no-store`), un éphémère (`no-cache`), un avatar à adresse stable et
  une piste traduite (clé sans UUID, réécrite à la retraduction) gardent le leur.

### Rétrocompatibilité
Aucune forme de réponse ne change pour un client qui n'envoie ni `Range` ni
validateur. Un ancien client reçoit les mêmes octets ; un client qui sait lire
les plages démarre plus tôt.
