## Le non-lu se compte à UN endroit, et ce que ce choix coûte à la liste (2026-09-21, #7199)

**La décision.** `getUnreadCountsForParticipants` (une conversation, N
participants — le push `conversation:unread-updated`) et
`getUnreadCountsForUser` (un utilisateur, N conversations — le badge de la
liste) ne portent plus chacun leur algorithme. Le calcul vit dans
`services/unreadCountsCore.ts` (`unreadFloorFor` + `computeUnreadCounts`) ; les
deux méthodes n'orchestrent plus que ce qui leur est PROPRE — l'axe du batch
(participant ou conversation) et le scope du masquage personnel. Le doc-comment
qui assumait la divergence (« Fixing one alone would replace a wrong-but-stable
badge with a badge that changes value depending on which path last spoke ») a
disparu avec le code qu'il décrivait.

**Ce que le choix COÛTE, et pourquoi il est assumé.** L'implémentation retenue
est celle du chemin temps réel — UN `message.findMany` borné par le plancher le
plus ancien, puis comptage en mémoire — et non celle de la liste (N
`message.count()` agrégés côté base). Le chemin de la liste TRANSFÈRE donc
désormais une ligne (`createdAt`, `senderId`) par message non lu, là où il ne
rapatriait qu'un entier : même nombre de requêtes, plus d'octets. C'est
négligeable sur un badge ordinaire et borné par `joinedAt` (non nul,
`@default(now())`), mais cela expose la liste et l'instantané de reconnexion
(`MeeshySocketIOManager`, tous les fils d'un lecteur) au même profil que le push
— celui qu'une conversation publique à très gros volume rend coûteux. Le sens
inverse (N comptes côté base sur les DEUX chemins) aurait dégradé le chemin le
plus chaud du gateway, appelé sur CHAQUE `message:new` pour chaque
destinataire ; la direction choisie sacrifie le chemin froid, pas le chaud. Si
la mesure impose un jour de revenir dessus, elle se tranche DANS ce module — pas
en redonnant un algorithme à chaque appelant.

**Ce que la décision ne couvre PAS.** Deux sites apparentés restent dehors,
nommés dans le doc-comment du module pour qu'aucune lecture future ne croie
l'énumération close (leçon 261) : `MessageReadStatusService.getUnreadCount` —
le TROISIÈME chemin vers le même badge, celui rendu au retour d'un marquage de
lecture, qui compte encore par `message.count` (bornes équivalentes, donc aucune
divergence de valeur aujourd'hui) — et `ConversationBridgeService`, qui
reproduit le même filtre de lecture pour rendre une FENÊTRE de messages plutôt
qu'un compte. Une règle nouvelle sur le non-lu se pose dans le module ET se
relit sur ces deux sites.
