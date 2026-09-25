## Leçon 185 — copier la référence sans copier ce qui la décrit (cycle 34)

**Le défaut.** `copyForwardedAttachments` dupliquait une pièce jointe en
reprenant `filePath`/`fileUrl` À L'IDENTIQUE : la copie et l'original désignent
le MÊME blob sur disque. Mais la projection, écrite champ par champ à la main,
énumérait 25 colonnes sur 40 — et aucune des onze qui disent que ce blob est du
chiffré. La copie naissait sur le défaut Prisma `isEncrypted: false`.

**Pourquoi c'était grave.** Le gateway ne déchiffre rien : `download.ts` sert les
octets bruts et c'est le CLIENT qui déchiffre, d'après ce que la ligne DÉCLARE.
Une ligne qui annonce « clair » en pointant du chiffré fait rendre le chiffré TEL
QUEL comme s'il était le média — le client ne déchiffre pas, puisqu'on vient de
lui dire qu'il n'y a rien à déchiffrer. Le mensonge ne produit pas une erreur :
il produit un fichier silencieusement illisible, et `isAttachmentEncrypted()`
confirmait `false`.

**La règle.** *Quand on copie une donnée PAR RÉFÉRENCE, tout ce qui décrit cette
donnée doit voyager avec la référence.* Un chemin de fichier n'emporte pas son
mode de chiffrement, sa taille d'origine ni ses empreintes : ces faits vivent
dans les colonnes voisines. Dupliquer l'un sans les autres crée une ligne qui
ment sur ce qu'elle contient — et le mensonge est INVISIBLE, parce que le blob
existe et se lit très bien, seulement il ne veut pas dire ce que la ligne
prétend.

**Le corollaire sur les projections manuelles.** Une copie partielle ne se trahit
JAMAIS à la compilation : à la création Prisma, tout champ omis prend son défaut,
et un défaut est syntaxiquement irréprochable. Elle ne se trahit pas non plus au
test tant que le test compte les APPELS (`attCreate` appelé 1 fois) ou vérifie
une valeur DÉRIVÉE (`messageType` déduit du MIME) au lieu de regarder la ligne
écrite. Toute duplication ligne-à-ligne réénumérée à la main est une dette qui
grandit en silence à chaque colonne ajoutée au modèle : la tester, c'est diffing
l'ensemble des champs écrits contre les champs du modèle, pas compter les appels.

**Le discriminant qui interdit la sur-correction.** Copier le fait, c'est copier
son ABSENCE aussi fidèlement que sa présence : une pièce en clair ne doit surtout
pas se voir inventer un chiffrement. Le test « un transfert en clair reste en
clair » vaut autant que les cinq qui exigent la propagation.

**La limite de portée, énoncée plutôt que franchie.** Dire la vérité sur les
octets et POUVOIR les déchiffrer sont deux problèmes distincts. En `e2ee` pur,
les destinataires d'arrivée n'ont pas la clé : ils verront désormais un échec
explicite là où ils voyaient du charabia. C'est strictement mieux, et ce n'est
pas la fin — propager la clé, re-chiffrer, ou REFUSER le transfert (comme le
cycle 93 l'a fait pour la vue unique) est une décision produit, consignée en
constat latent plutôt que tranchée en douce dans un correctif de défaut.

Parente des leçons 183 (cycle 32) et 184 (cycle 33) : même famille de suites
vertes qui affirment la forme sans jamais demander le CONTENU de ce qui est écrit.
