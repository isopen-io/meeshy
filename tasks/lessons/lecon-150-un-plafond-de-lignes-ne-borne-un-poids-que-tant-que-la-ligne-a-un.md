## Leçon 150 — Un plafond de LIGNES ne borne un poids que tant que la ligne a un poids borné

**Contexte** : cycle 113. `GET /sync` est le canal de rattrapage des appareils qui reviennent en
ligne. Sa page était plafonnée à 1000 lignes depuis A3.1, et ce plafond suffisait : la ligne
comptait six champs scalaires, donc 1000 lignes pesaient une taille prévisible. Le cycle 111 a
étoffé le select pour que le client puisse écrire une ligne RENDABLE — `translations` (une copie du
contenu PAR langue du Prisme), `metadata`, `reactionSummary`, le bloc expéditeur, et les pièces
jointes avec leurs propres `transcription`/`translations`. Toutes ces tailles sont écrites par
l'utilisateur, aucune par le schéma. Le cap n'a pas changé d'une ligne, et il a pourtant cessé de
borner quoi que ce soit : la même page pouvait désormais peser quelques kilo-octets ou plusieurs
dizaines de mégaoctets, sur le canal appelé précisément au retour de veille, en cellulaire, par un
appareil qui vient de se reconnecter.

**La leçon** : un plafond exprimé dans une UNITÉ (des lignes) ne protège une AUTRE grandeur (des
octets) que par l'intermédiaire d'un facteur de conversion — le poids d'une ligne. Ce facteur est
une hypothèse, il n'est écrit nulle part, et **l'enrichissement qui l'invalide ne touche pas le
plafond**. Rien ne rougit : la constante est toujours là, le test de pagination passe toujours, le
diff qui a cassé la borne ne contient pas le mot « cap ». Le réflexe n'est donc pas « le plafond
est-il au bon niveau ? » mais **« ce plafond est-il exprimé dans l'unité que je cherche à borner,
et si non, qui garantit le facteur ? »**. Élargir un `select` est le geste qui invalide ce facteur
le plus souvent, et c'est un geste qu'on croit purement additif.

**Corollaire — le second critère d'arrêt s'emprunte, il ne s'invente pas.** La page savait déjà
s'arrêter à mi-parcours : `truncated: true` + `nextCursor` + watermark tenu à `since`, tout le
protocole était en place et honoré par les clients. Il ne manquait qu'un second déclencheur. Devant
une borne à ajouter, chercher d'abord le mécanisme d'arrêt EXISTANT : une seconde condition sur un
chemin déjà éprouvé coûte trois lignes, là où un nouveau mode de troncature demanderait aux clients
d'apprendre un vocabulaire de plus.

**Corollaire — une page budgétée reste un PRÉFIXE du tri.** Les lignes sont ordonnées par le keyset
`(updatedAt, id)` et le curseur reprend derrière la dernière. Écarter une ligne lourde « au milieu »
pour en faire tenir deux légères ferait un trou qu'AUCUNE position keyset ne saurait réclamer — il
n'existe pas de curseur qui dise « reprends ici, mais reviens aussi chercher celle-là ». Un budget
tronque par la fin, jamais par le tri.

**Corollaire — servir AU MOINS une ligne, toujours.** Un élément plus lourd à lui seul que le budget
rendrait une page vide accompagnée de `truncated: true` et d'un curseur inchangé : la même requête,
indéfiniment. Le rattrapage ne progresserait plus jamais, et le seul symptôme visible serait une
synchronisation qui tourne sans rien appliquer — pas une erreur, pas un log. Dépasser le budget
d'une ligne est le moindre mal ; ne plus avancer n'en est pas un. **Tout filtre placé entre une
lecture paginée et sa livraison doit se demander ce qui se passe quand il rejette TOUT.**

**Corollaire — deux retraits qui se ressemblent, des conséquences opposées sur le curseur.** Dans ce
même handler, deux mécanismes retirent des lignes de la page, et ils ne s'ancrent pas pareil :
- le **masquage personnel** livre-comme-absent — la ligne a été traitée, le curseur DOIT passer
  derrière elle, sinon une page entièrement masquée ferait boucler la synchronisation sur place ;
- le **budget** n'a pas livré du tout — le curseur ne doit SURTOUT PAS passer derrière, la borne
  serveur étant stricte, la ligne serait perdue définitivement.
Le curseur s'ancre donc sur la dernière ligne **livrée** pour l'un et sur la dernière ligne **lue**
pour l'autre. Ce qui garde la distinction vivante n'est pas un commentaire, c'est l'ORDRE :
le budget tranche AVANT que la page de référence du curseur soit figée, le masquage APRÈS.

**Corollaire — l'exemption se justifie par la NATURE, pas par la commodité.** Les streams de
tombstones ne sont pas budgétés, et la bonne raison n'est pas « ils sont petits » : c'est que leur
ligne est faite de scalaires de taille fixe, donc leur plafond de lignes EST un plafond de poids et
le restera. C'est exactement la propriété que le stream principal a perdue. Formuler l'exemption
ainsi la rend révisable : le jour où l'on ajoutera un champ variable à un tombstone, la phrase
cessera d'être vraie et se lira comme telle.

**Le coût de mesure se borne tout seul.** Mesurer en sérialisant chaque ligne semble reproduire la
dépense qu'on veut éviter — mais on s'arrête au premier dépassement, donc on ne sérialise jamais
plus que le budget plus une ligne, là où la page entière représentait un `JSON.stringify` non borné
(que l'ETag faisait d'ailleurs déjà, sur la totalité, à chaque appel).

---
