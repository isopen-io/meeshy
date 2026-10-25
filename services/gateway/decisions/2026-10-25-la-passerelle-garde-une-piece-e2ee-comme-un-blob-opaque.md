## La passerelle garde une pièce jointe chiffrée de bout en bout comme un blob opaque, et n'admet qu'elle dans une conversation `e2ee` (#10789)

**Contexte** : l'appareil chiffre la pièce (format `client-v1`, décision SDK
`packages/MeeshySDK/decisions/2026-10-25-une-piece-jointe-e2ee-est-chiffree-sur-l-appareil-a-la-maniere-de-signal.md`).
Jusqu'ici, toute pièce était refusée en `e2ee` (#12518) parce que toute pièce reçue était un clair que la
passerelle avait lu, vignetté, transcodé, transcrit. Directive #9224 / #9229 : le serveur ne voit jamais le clair.

**Décision** :
- **Téléversement** : la porte TUS existante, contexte `uploadcontext=e2ee-attachment`
  (`E2EE_ATTACHMENT_UPLOAD_CONTEXT`, `packages/shared/types/e2ee-attachment.ts`). Liste BLANCHE de métadonnées :
  `uploadcontext`, `digest` (SHA-256 du blob, base64), `filetype` = `application/octet-stream`, `filename` =
  `blob`. Toute autre clé (`duration`, `transcription`, `alt`, `thumbhash`, `capturedinapp`, un vrai nom…) est
  refusée 400 `E2EE_ATTACHMENT_METADATA_REFUSED` à la création, avant le premier octet. Compte inscrit seul.
- **Stockage** : à la fin du transfert, le SHA-256 du fichier est comparé au `digest` déclaré (400 et fichier
  effacé sinon), puis le fichier est rangé sous `AAAA/MM/<userId>/e2ee_<uuid>.bin`. Aucune vérification de
  signature, aucun retrait de métadonnées, aucune extraction, aucune vignette, aucun transcodage, aucune
  normalisation audio, aucun ThumbHash, aucune tâche différée. La ligne `MessageAttachment` porte
  `mimeType: application/octet-stream`, `originalName: ""`, `fileSize` = taille du blob (déjà arrondie par
  l'appareil), `isEncrypted: true`, `encryptionMode: "e2ee"`, `encryptedFileHash`.
- **Envoi** (`admitSendUnderRegime`) : dans une conversation `e2ee`, chaque pièce portée doit être un blob
  `e2ee`, pas encore rattaché, déposé par l'expéditeur ; une pièce en clair garde le refus
  `E2EE_PLAINTEXT_REFUSED` (lisible par les anciens clients, #9223), un blob d'autrui ou déjà rattaché est
  refusé `E2EE_ATTACHMENT_INVALID`, une copie ou un transfert de pièces reste refusé — y compris à côté de
  blobs : l'admission juge l'UNION de ce que l'envoi porterait. Les blobs se réservent (rattachement
  conditionnel) AVANT que la moindre enveloppe parte ; un blob déjà pris fait échouer l'envoi. Hors `e2ee`,
  un blob `e2ee` est refusé `409 E2EE_REGIME_CHANGED` : personne n'y aurait de quoi le lire.
- **Droits par type** : le blob étant `application/octet-stream`, les droits de conversation par type de
  pièce (`attachmentKindAdmission`) le lisent comme un fichier. Décision produit ouverte (issue du lot).
- **Lecture** : `GET /attachments/:id` seulement (jeton, appartenance active, vie du porteur). La route par
  CHEMIN (`/attachments/file/*`), qui ne connaît pas son lecteur, refuse tout fichier porté par une ligne
  `e2ee`. La galerie (`GET /conversations/:id/attachments`) l'écarte par `differsOrUnset` — jamais un `NOT`
  nu, qui écarterait aussi toutes les pièces ordinaires, sans champ `encryptionMode` (#8309, mesuré). Transcription et traduction à la demande refusent la ligne `e2ee` elle-même, rattachée ou non.
- **Push** : aucun média, nom, taille ni durée d'une pièce `e2ee` (garde `maskedAttachment`, en plus du
  message protégé).
- **Purge** : la ligne est rattachée au message ; suppression, échéance et balayage des pièces non
  rattachées (24 h) s'appliquent sans exception.
- **Socket** : `message:send-with-attachments` déclare la session comme `message:send` (le relais libsignal
  exige l'appareil lié à la session).

**Alternatives rejetées** :
- *Route de téléversement dédiée* : une seconde porte devrait réécrire l'authentification, la reprise et les
  gardes de propriété de TUS ; un contexte sur la porte existante les garde toutes.
- *Blob non rattaché au message (modèle CDN de Signal)* : la passerelle ne saurait ni le purger avec son
  message ni le réserver aux membres. Le rattachement révèle le NOMBRE de pièces d'un message, pas leur contenu.
- *Faire confiance au type déclaré* : le type est un indice que le serveur ne doit pas avoir ; seule la forme
  `application/octet-stream` est admise.

**Conséquences** : le serveur voit qu'un message porte N blobs et leur taille arrondie (§ 9 de la spec).
Le web n'écrit pas encore en `e2ee` (#10788) : il affiche « pièce jointe chiffrée, ouvrez-la dans l'app ».
