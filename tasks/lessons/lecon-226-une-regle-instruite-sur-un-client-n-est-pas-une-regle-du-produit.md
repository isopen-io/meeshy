## Leçon 226 — une règle instruite sur un client n'est pas une règle du produit : chercher le client qui DÉCODE le drapeau sans jamais le lire (2026-08-17, routine messagerie, cycle 60)

**Le défaut.** Les six écrivains web de `conversation.lastMessage` appliquaient
tout ce qui leur arrivait, sans jamais comparer l'horodatage du message nommé à
celui du message que la ligne décrivait déjà. Un écrivain nommant un message
plus ANCIEN faisait donc reculer la ligne — son texte, son auteur, sa carte du
Prisme, et son RANG, puisque `sortConversations` trie sur `lastMessageAt`. En
`staleTime: Infinity`, rien ne repassait corriger.

iOS tient cette règle depuis le cycle 46 bis (`ConversationStore.merging`),
`previewRecalculated` compris — le drapeau par lequel le SERVEUR déclare un
recul légitime. Le gateway l'émet. Le web le **décodait** — `previewRecalculated`
figure noir sur blanc dans `PREVIEW_GROUP_KEYS` — pour le **jeter**, faute de
garde à qui il aurait servi d'exception.

**Ce qui rend la forme difficile à voir.** Un champ qu'un client ignore laisse
une trace vide : rien ne casse, aucun test ne rougit, et la recherche par nom
rend un tableau où le client APPARAÎT (il connaît le champ, il le nomme, il le
filtre). Ce n'est pas l'absence du nom qu'il faut chercher, c'est l'absence du
LECTEUR : un `grep` du drapeau donnait quatre sites côté iOS et un côté web, et
le site web était sa mise à l'écart.

**Le corollaire qui a décidé du périmètre.** Corriger le seul chemin
`conversation:updated` n'aurait rien corrigé : `message:new` et son jumeau
`conversation:updated` pendent au MÊME geste — un message envoyé — et le second
réécrit ce que le premier vient de refuser. Le désordre naît d'ailleurs des deux
côtés, et sans aucune course exotique : `MessageHandler` await un
`prisma.participant.findMany` ENTRE les deux diffusions (deux envois concurrents
sortent donc leurs `conversation:updated` dans l'ordre de leurs requêtes), et sur
une conversation absente du cache chaque `message:new` déclenche son propre
`GET /conversations/:id` (deux messages rapides dans un DM tout neuf = deux
fetches, dont le plus ancien peut résoudre en dernier). Même classe que le cycle
59 §2.3, sur un autre couple.

**La règle pour la prochaine fois.** Quand une leçon d'un client nomme un champ
que le SERVEUR émet à tous, la question n'est pas « ce champ existe-t-il
ailleurs ? » mais « **quel client le décode sans le lire ?** ». Un champ décodé
et jeté est la signature d'une règle appliquée d'un seul côté : le décodeur a
été écrit depuis le contrat partagé, la règle depuis un seul écran.

**Le no-op qui borne le correctif.** L'ÉGALITÉ d'horodatage n'est pas un recul —
c'est le même message, donc une édition — et l'IDENTITÉ prime sur l'horodatage.
Sans ces deux bornes, la garde jetait le chemin le plus fréquenté du service
(le `conversation:updated` jumeau de chaque `message:new`, même id, même date).
C'est exactement l'erreur que le `>` strict d'iOS avait commise avant son `>=`,
et elle était réécrite en toutes lettres à côté du code à porter.
