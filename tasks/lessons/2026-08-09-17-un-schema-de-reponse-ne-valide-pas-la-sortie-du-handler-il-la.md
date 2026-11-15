## 2026-08-09 (17) — Un schéma de réponse ne valide pas la sortie du handler : il la RÉÉCRIT, sans rien lever

Routine messaging, cycle 41. `GET /signal/keys/:userId` rendait chaque clé décodée en `Uint8Array`
alors que son schéma de réponse — et la colonne, et le client iOS — déclarent du base64. Fastify
sérialise un 200 **à travers** le schéma déclaré (fast-json-stringify) : un champ typé `string` ne
**rejette** pas une valeur non-string, il la **coerce** par `String(value)`. `String(Uint8Array)`
étant la liste décimale des octets, le fil portait `"97,110,45,105,…"` là où le client attendait
`"YW4tabc…="`. iOS décodait la `String` sans erreur puis `Data(base64Encoded:)` rendait `nil` :
E2EE mort pour tous les pairs, silencieusement, depuis toujours.

**Règle** — un schéma de réponse n'est pas une garde, c'est une **transformation**. TypeScript ne
relie pas l'objet rendu par un handler au schéma déclaré dans `response: { 200: … }` : aucune erreur
de compilation. Le sérialiseur ne lève pas non plus : il coerce. Entre les deux, **zéro alarme** —
et la valeur produite reste du bon *type JSON*, donc elle traverse aussi le décodeur du client. À
chaque frontière de sortie où un schéma déclare un ENCODAGE (base64, hex, ISO-8601, data-URI),
vérifier que le handler rend cet encodage-là, pas la valeur décodée « équivalente ».

**Corollaire — se demander pourquoi on décode.** Ici, la colonne, le schéma et le client étaient
d'accord sur le base64 : les vingt lignes de décodage ne servaient **aucun** consommateur. Une
conversion sans lecteur en aval n'est pas neutre — elle est exactement le site où l'encodage se perd.

**Corollaire — mocker un SCHÉMA, c'est mocker un comportement, pas isoler une frontière.** Le
fichier de tests voisin remplaçait `getPreKeyBundleResponseSchema` par
`{ type: 'object', additionalProperties: true }` « pour simplifier », ce qui retirait précisément
l'étape qui abîme les données. Ses six tests sur la route assertaient `statusCode` et `success`,
jamais la forme d'un champ, et restaient verts. Un test de route qui n'assertera jamais la VALEUR
d'un champ ne peut pas remplacer un test qui traverse le sérialiseur réel. Deuxième aveuglement
structurel trouvé dans ce même fichier en deux cycles (cycle 40 : doubles Prisma indifférents au
`where`) — quand un fichier de tests a menti une fois par construction, relire ce qu'il mocke
d'autre.

**Corollaire — consommer une ressource appartient à la route qui la DISTRIBUE.**
`POST /signal/session/establish` mettait à `null` la pré-clé à usage unique du destinataire alors
que sa réponse ne porte aucun matériel de clé : personne ne recevait ce qu'elle détruisait. Ce n'est
pas une consommation, c'est une destruction — et un vecteur d'épuisement offert à tout participant.
Avant d'écrire « marquer comme utilisé », vérifier que la même route rend bien la chose à quelqu'un.
