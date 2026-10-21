## 2026-10-21 : Le chemin TUS et le multipart partagent une fabrique de rendus (#11260)

**Contexte.** Deux portes écrivent un média sur disque. Le multipart (`UploadProcessor.uploadFile`) produisait vignette, variantes WebP responsives (D4), plan de transcodage vidéo (D-video) et thumbhash ; le résumable TUS (`onUploadFinish`) ne produisait que la vignette et le thumbhash. TUS ne sert que les gros fichiers : les médias qui ont le plus besoin de variantes et de transcodage étaient justement ceux qui n'en recevaient pas. `PostMedia` ne pouvait de toute façon ni porter `imageVariants` ni le `videoCodec`.

**Décision.**
- `services/attachments/media-renditions.ts` est le SEUL endroit où ces rendus se décident (`produceMediaRenditions`), appelé par les deux portes avec la même entrée. Il rend des valeurs ; l'appelant choisit la table et persiste. Le lanceur ffmpeg vit dans `ffmpeg-run.ts`.
- `PostMedia.imageVariants` (`Json?`) et `PostMedia.videoCodec` (`String?`) sont OPTIONNELS : une ligne héritée n'en porte pas, une image déjà petite non plus, et la clé est ABSENTE de l'écriture (jamais `null`, que Prisma refuse pour `Json?`). `mediaSelect` sert `imageVariants` ; un ancien client ignore la clé.
- Les rendus s'exécutent APRÈS les gardes de chaque branche TUS (propriétaire d'un PostMedia, politique d'un invité) : un upload refusé ne laisse ni variante ni sortie de transcodage.
- Un `PostMedia` dont les variantes sont sur disque doit les rendre à la destruction : `reclaimMediaRowBytes` lit `imageVariants` (clés relues défensivement, `..` rejeté), et les cinq lecteurs de lignes à détruire le sélectionnent.
- Le transcodage vidéo en TUS garde le MÊME drapeau (`VIDEO_TRANSCODE`, éteint par défaut) et le MÊME plafond synchrone (`VIDEO_TRANSCODE_MAX_SYNC_BYTES`, 200 Mo) que le multipart. Les très gros fichiers résumables en sont donc exclus tant qu'un transcodage asynchrone n'existe pas.

**Le chemin chiffré n'est pas du E2EE.** `uploadEncryptedFile` reçoit le CLAIR et chiffre côté serveur : le serveur voit le fichier. Ce n'est PAS du chiffrement de bout en bout au sens de #9224. Il respecte néanmoins une règle de rendu : aucun rendu en clair ne survit (ni variante WebP, ni thumbhash serveur, ni transcodage sur disque) ; seule la vignette est fabriquée en tampon (`produceEncryptedThumbnail`) puis chiffrée avec le fichier.

**Conséquences / suivi.** `publishAttachment` (MessageAttachment vers PostMedia) ne recopie pas `imageVariants` : un média publié depuis une pièce jointe n'a pas de variantes tant qu'un lot ne les copie pas. Aucun client web/iOS ne lit encore `imageVariants` sur un média de post (lot client séparé).
