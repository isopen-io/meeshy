---
"@meeshy/gateway": patch
---

Le repost d'une story ou d'un statut ne perd plus les dimensions, l'accessibilité et la transcription du média qu'il duplique.

**Les octets étaient dupliqués, la ligne qui les décrit était réénumérée à la main.** Quand la source est ÉPHÉMÈRE (STORY 21h, STATUS 1h), `repostPost` copie réellement les fichiers pour que le repost survive au hard-delete de l'original — c'est la garantie qui empêche le « statut/story vide ». Mais la ligne `PostMedia` créée par-dessus n'énumérait que huit champs, alors que `mediaSelect` en avait chargé dix-sept. Tout le reste naissait sur le défaut Prisma, c'est-à-dire nul :

- `width` / `height` : sans elles, `FeedMedia.aspectRatio` rend `nil` et le lecteur ne peut pas réserver le cadre avant le téléchargement — le repost saute au chargement, là où l'original ne sautait pas ;
- `thumbHash` : le placeholder instantané est DÉRIVÉ de ces pixels-là. Le laisser derrière condamnait la copie à l'attente pleine taille pour un travail déjà fait — exactement le défaut corrigé sur les pièces jointes de message au correctif précédent, ici sur la famille post ;
- `duration` : un lecteur audio/vidéo sans durée ne sait pas dessiner sa barre de progression tant que le média entier n'est pas descendu ;
- `alt` / `caption` : le texte alternatif EST l'accessibilité du média. Un repost qui le perd rend muet à VoiceOver un contenu que son auteur avait pris la peine de décrire — et rien ne le signalait, l'image s'affichant normalement ;
- `language` / `transcription` : le Prisme Linguistique s'applique à TOUT le contenu, transcriptions comprises. Une story repostée perdait la transcription Whisper de son audio, donc ses sous-titres et toute traduction ultérieure : le prisme n'avait plus rien à résoudre et le contenu retombait dans la langue de l'auteur d'origine.

`Post.audioDuration` relevait du même oubli : `audioUrl` était remplacé par celui de la copie, `audioDuration` restait derrière, et la note vocale d'un statut reposté affichait 0:00 jusqu'au téléchargement complet du fichier.

La copie emporte désormais ces faits, et elle emporte l'ABSENCE aussi fidèlement que la présence : un média sans dimensions ni légende ne s'en voit pas inventer. Elle pose aussi son `uploaderId` — le reposteur vient d'en écrire les octets, et le schéma ne tolère ce champ nul que pour les lignes antérieures à son introduction.

Deux champs restent volontairement en dehors de la copie, et c'est un choix, pas un oubli. `variantOf` pointe vers une AUTRE ligne `PostMedia` : un pointeur n'est pas un fait sur ces octets, et recopié tel quel il désignerait la ligne source que le balayage de l'éphémère va effacer — même raisonnement que le remap d'ids déjà appliqué à `storyEffects` juste en dessous. `translations` porte les URL des variantes TTS, dont les blobs n'ont PAS été dupliqués : les recopier promettrait au lecteur des pistes audio qui disparaîtront avec la source. Dupliquer ou régénérer les TTS d'un repost est une décision produit, consignée comme telle.
