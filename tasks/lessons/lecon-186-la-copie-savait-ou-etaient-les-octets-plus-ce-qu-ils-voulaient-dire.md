## Leçon 186 — la copie savait où étaient les octets, plus ce qu'ils voulaient dire (cycle 35)

**Le défaut.** `repostPost` duplique VRAIMENT les fichiers d'une source éphémère
(STORY 21h, STATUS 1h) : c'est la garantie qui empêche un repost de se vider
quand l'original expire. La duplication des octets est irréprochable. La ligne
`PostMedia` écrite par-dessus, elle, était réénumérée à la main sur huit champs
quand `mediaSelect` en avait chargé dix-sept. `width`, `height`, `thumbHash`,
`duration`, `caption`, `alt`, `language`, `transcription` : tout ce qui DÉCRIT
ces pixels restait derrière, et la copie naissait sur le défaut Prisma.

**Pourquoi c'était grave, et invisible.** Aucun de ces manques ne produit
d'erreur. L'image s'affiche, la vidéo se lit. Ce qui disparaît, c'est ce que le
produit promet par ailleurs :
- sans `width`/`height`, `FeedMedia.aspectRatio` rend `nil` et le lecteur ne peut
  pas réserver le cadre — le repost SAUTE au chargement, l'original non ;
- sans `thumbHash`, plus de placeholder instantané — le champ MÊME que le cycle
  34 venait de rétablir sur les pièces jointes de message, le défaut jumeau
  vivant à un fichier de distance dans la famille post ;
- sans `alt`, **le média reposté devient muet à VoiceOver**. Une description
  qu'un auteur avait pris la peine d'écrire, effacée par une republication ;
- sans `language`/`transcription`, **le Prisme Linguistique n'a plus rien à
  résoudre** : le contenu retombe dans la langue de l'auteur d'origine.

**La règle.** *Quand on copie des octets, tout ce qui DIT CE QU'ILS VEULENT DIRE
doit voyager avec eux.* La leçon 185 l'a énoncée pour la copie PAR RÉFÉRENCE (le
même blob, deux lignes) ; elle vaut à l'identique pour la copie PAR VALEUR (deux
blobs, deux lignes). Le mode de partage des octets ne change rien : ce sont les
colonnes voisines qui portent le sens, et un `copyFile` n'en transporte aucune.
Dupliquer un fichier sans dupliquer ce qui le décrit produit une ligne qui SAIT
où sont les octets et ne sait plus ce qu'ils sont.

**Le corollaire qui distingue un FAIT d'un POINTEUR.** Copier « tout ce que la
projection a chargé » serait une sur-correction. Deux champs devaient rester
dehors, et la raison est la même pour les deux : ce ne sont pas des faits sur ces
octets. `variantOf` désigne une AUTRE ligne, que le hard-delete de la source va
effacer. `translations` porte les URL de variantes TTS qui n'ont PAS été
dupliquées : les recopier promettrait au lecteur des pistes destinées à
disparaître. **Un fait sur les octets se copie ; un pointeur vers une ligne ou
vers un blob qu'on n'a pas dupliqué se remappe, se duplique aussi, ou se laisse
tomber — jamais se recopie.** La même fonction appliquait déjà ce raisonnement
dix lignes plus bas, en remappant les ids de médias dans `storyEffects` : le
principe était présent, il n'avait simplement pas été étendu aux colonnes.

**Le signal qu'on aurait pu lire plus tôt.** Le champ manquant le plus parlant
était `thumbHash` — le cycle 34 venait de le rétablir sur `MessageAttachment`, un
correctif fraîchement mergé, pour la même raison, avec le même commentaire. *Un
défaut qu'on vient de corriger dans une famille est une requête à lancer dans
toutes les autres*, et la recherche coûte une minute. Quatre cycles de suite ont
maintenant trouvé le même mode d'échec (32 : branche sans implémentation ; 33 :
implémentation conditionnée au mauvais champ ; 34 et 35 : projection amputée), et
chaque fois la suite était VERTE parce qu'elle comptait les appels ou lisait une
valeur dérivée. Le test qui aurait vu celui-ci ne demande rien de plus que : *que
contient la ligne qu'on vient de demander à écrire ?*
