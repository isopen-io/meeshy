## 2026-10-31 : Sans worker qui bat, la passerelle rend les grands médias APRÈS la réponse du dernier PATCH tus (#13984)

Révise un point de la décision du 2026-10-23 (#11264), « sans battement : tout reste synchrone », pour la porte tus.

### Constat

Sur le staging, le dernier PATCH tus d'une photo de 3,0 Mo (12 Mpx) attendait **p95 = 39,6 s** (n = 20, mesuré depuis l'hôte, le transfert hors de la mesure) : vignette, variantes WebP et AVIF et thumbhash rendus dans la requête. La file était prévue (`MEDIA_QUEUE=bullmq`, `media-worker-staging`) mais n'avait jamais atteint l'hôte : ni le service ni la variable dans le compose du serveur, et une copie hôte de `meeshy-deploy-staging.sh` qui refusait le worker (rc = 64, avertissement de CI ignoré). Worker déployé, le même envoi répond en **p95 = 0,14 s**.

### Décision

- **File allumée, worker vivant** : inchangé, la tâche part en file.
- **File allumée, aucun worker ne bat** : la ligne naît `pending`, la réponse part dès sa création, et la passerelle rend ensuite, en tâche de fond (`setImmediate`), par la MÊME fabrique que le worker (`processMediaJob`, mode strict) et prévient comme lui (`handleMediaReady` : `attachment:ready` à l'auteur, `message:attachment-updated` aux lecteurs, rediffusion du post). Un rendu raté passe la pièce et ses copies à `failed`. Site : `media-processing/local-render.ts` ; décision unique : `planDeferral` (`dispatch.ts`).
- **File éteinte** (`MEDIA_QUEUE` absent : la production aujourd'hui ; `drain` : le retour arrière) : inchangé, tout reste dans la requête. Le rendu de fond n'existe que là où une pièce `pending` a toujours quelqu'un pour la reprendre (le balayage de la passerelle tourne avec `bullmq`).
- **Ce qui sort de la requête ne change pas** : image d'au moins 2 Mo, vidéo. Une image plus petite garde sa vignette dans la réponse (un ancien client l'y attend), un vocal reste normalisé dans la requête.

### Aucun état en mémoire

Rien n'est gardé en mémoire : la pièce `pending` est en base. Si la passerelle s'arrête avant d'avoir rendu, son balayage (pièces de plus de 15 min, sous bail) ou celui d'un worker revenu (plus de 10 min) la reprend. Le double rendu reste exclu tant qu'un rendu de fond dure moins de 10 min (photo : environ 40 s ; vidéo : vignette seule tant que `VIDEO_COMPAT_RENDITION` est éteint sur la passerelle).

### Rétrocompatibilité (#9223)

La réponse garde sa forme : mêmes champs, `thumbnailUrl` absent et `processingState: 'pending'` pour une grande image — exactement ce que rend déjà le chemin « worker vivant » depuis #11264, que iOS, le web et Android décodent. Seule la porte tus est concernée ; la porte multipart (`UploadProcessor`) reste « worker ou synchrone » (suivi : issue dédiée).
