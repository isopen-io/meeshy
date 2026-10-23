# Le traitement d'un média sort de la requête HTTP (2026-10-23, #11264)

Défaut validé par le porteur dans #11249 (point 5) : BullMQ sur le Redis existant, et un conteneur worker de plus sur le serveur partagé.

## Décision

- **Une file, `media-processing`**, une tâche par (genre, table, pièce). L'identifiant `<genre>-<table>-<id>` rend la mise en file idempotente ; BullMQ refuse `:` dans un identifiant. Priorités : `thumb` = 2 (vignette, variantes WebP/AVIF, thumbhash), puis `transcode` = 3 (rendu H.264 de #11261). Trois essais à reprise exponentielle ; après le dernier, `processingState = 'failed'` et le média reste servi tel quel.
- **Ce qui sort de la requête** : la vignette et les variantes d'une image d'**au moins 2 Mo**, la vignette et le rendu H.264 d'une **vidéo**. **Ce qui reste dans la requête** :
  - la vérification et la persistance ;
  - le retrait des métadonnées et la conversion d'un HEIC (`fileUrl` doit être lisible dès la réponse) ;
  - une image de moins de 2 Mo : un ancien client attend sa vignette dans la réponse ;
  - un vocal : différée, sa normalisation changerait l'URL après la réponse, et un ancien client garderait le `.webm`.
- **`processingState`** est optionnel sur `MessageAttachment` et `PostMedia`. Absent, la ligne est prête (héritée, ou traitée pendant la requête). `pending` tant qu'un rendu est en file.
- **Notification** : le worker est un autre processus. La passerelle écoute les fins de tâches (`QueueEvents`) et émet :
  - `message:attachment-updated` aux lecteurs, l'événement qu'iOS et le web appliquent déjà, avec ses trois audiences ;
  - `attachment:ready` (nouveau) à la room personnelle de l'auteur, pour une pièce de message comme pour un média de post.
- **Allumage** : `MEDIA_QUEUE=bullmq` (staging). Éteint, aucune tâche n'existe et tout reste synchrone, comme avant : c'est l'état de la production tant que la mesure CPU de S2 n'est pas faite (#9232).
- **Worker** `media-worker-staging` : même image, `node dist/src/workers/media-worker.js`, concurrence 1, plafond de 1 CPU et 1,5 Go. Il monte le volume des envois mais ne publie aucun port et n'a aucun routeur Traefik (garde `media-uploads-never-public.test.ts`).

## Rétrocompatibilité (#9223)

Un ancien client reçoit une réponse de même forme, sans `thumbnailUrl` pour une grande image (le champ était déjà nullable), puis la ligne complète par `message:attachment-updated`, qu'il sait appliquer. Un nouveau client lit `processingState` et `attachment:ready`. Un ancien serveur n'émet ni l'un ni l'autre.

## Chemin `uploadEncryptedFile`

Il reçoit le clair et chiffre côté serveur : **ce n'est pas du E2EE au sens de #9224**. Rien n'y est différé : il ne produit qu'une vignette en tampon, chiffrée avec le fichier.
