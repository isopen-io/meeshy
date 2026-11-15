## Sniffing MIME étendu à tout upload : rejeter le connu-faux, croire l'inconnu (2026-09-08, #5615)

**Constat** : `ContentSignature.ts` (`matchesAudioSignature`/`matchesImageSignature`)
n'était consommé que par `classifyAnonymousAttachment`, elle-même appelée
uniquement `if (isAnonymous)` sur les deux chemins d'upload
(`routes/attachments/upload.ts`, `routes/uploads/tus-handler.ts`). Un compte
INSCRIT pouvait déclarer n'importe quel `mimeType` sans qu'aucun octet ne soit
jamais regardé — `UploadProcessor.validateFile()` ne vérifiait que la taille.
Et même pour l'exemption anonyme, une signature qui ne correspondait à rien de
connu retombait silencieusement dans le seau « fichier », plus permissif —
sur un lien ouvert (`allowAnonymousFiles: true`), un mimeType usurpé passait
donc intégralement, y compris pour un anonyme.

**Décision** : deux changements distincts, tenus ensemble.

1. **Un site de vérification, appelé par TOUS les uploads** — `verifyDeclaredMimeType()`
   (`services/attachments/ContentSignature.ts`), câblé dans
   `UploadProcessor.validateFile()` (chemin REST, `AttachmentService.uploadMultiple`,
   inscrit ET anonyme) et en tête de `onUploadFinish` dans `tus-handler.ts`
   (chemin resumable, avant même de savoir s'il s'agit d'un `PostMedia` ou
   d'un `MessageAttachment`) — distinct de `classifyAnonymousAttachment`, qui
   reste la décision de PERMISSION anonyme (voix/image/fichier) et ne change
   pas.
2. **Que faire d'une famille sans signature connue ?** Liste noire implicite,
   pas allowlist stricte : les familles avec une signature FIABLE (image
   raster, audio, SVG, PDF) sont vérifiées et un mimeType déclaré qui ne
   correspond pas au contenu REJETTE l'upload (400) ; tout le reste
   (`ACCEPTED_MIME_TYPES.DOCUMENT`/`.CODE`, vidéo…) est accepté sans
   vérification. Écrire des signatures pour des dizaines de formats textuels
   indiscernables d'un texte arbitraire par leurs octets de tête aurait donné
   une fausse impression de renfort — la même réserve que la docstring du
   module assume déjà pour GIF/MP3 non renforcés.

**Alternative rejetée** : allowlist stricte (rejeter tout type sans signature
connue). Casserait l'upload de dizaines de types de documents/code légitimes
(`text/markdown`, `application/json`, scripts…) sans qu'un vrai parseur de
conteneur existe pour la plupart — coût disproportionné au gain de sécurité
pour un correctif de bug, pas un chantier de refonte de la validation d'upload.

**Preuve** : `services/attachments/ContentSignature.ts` (`verifyDeclaredMimeType`,
`matchesSvgSignature`, `matchesPdfSignature`) ; `UploadProcessor.validateFile()` ;
`routes/uploads/tus-handler.ts` (`onUploadFinish`, vérification globale avant
la branche `isPostMedia`/`isAnonymous`) ; tests : `ContentSignature.test.ts`,
`UploadProcessor.test.ts`, `tus-handler.test.ts` (dont la preuve qu'un lien
anonyme totalement OUVERT rejette désormais aussi une déclaration mensongère).

**Conséquences** : un upload REST ou resumable dont le `mimeType` déclaré est
image/audio/SVG/PDF et ne correspond pas aux octets réels échoue en 400 (REST)
ou son équivalent TUS, pour tout appelant. Aucun changement pour les familles
sans signature connue ni pour la logique de permission anonyme existante.
