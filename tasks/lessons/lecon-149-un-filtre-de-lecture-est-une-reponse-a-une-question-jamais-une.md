## Leçon 149 — Un filtre de lecture est une réponse à une QUESTION, jamais une notification

**Contexte** : cycle 112. `personalHistoryFilter` est la moitié LECTURE de « supprimer pour moi »
(`UserMessageDeletion`, `clearHistoryBefore`). Sa docstring dit, à juste titre, qu'elle est le seul
endroit où ces deux faits deviennent un filtre Prisma, et le dépôt l'a câblée partout : liste,
recherche, fil, `/sync`. Elle était néanmoins insuffisante, et pas par un lecteur oublié — par
NATURE. Les trois routes qui ÉCRIVENT la table (`delete-for-me` message, son lot, `restore-for-me`)
ne diffusaient rien. Masquer un message sur son iPhone le laissait affiché sur son iPad et sur le
web, indéfiniment.

**La leçon** : les cycles 105 à 111 cherchaient des lecteurs manquants (« N lecteurs appliquent la
règle sur M ») ou un vocabulaire manquant (leçon 147, le delta qui ne sait pas dire « parti »). Ici
le filtre est complet, tous ses lecteurs sont câblés, et le défaut subsiste :
**un filtre de lecture ne peut que rétrécir ce qu'une NOUVELLE requête rend. Il n'a AUCUNE prise sur
une ligne que le client détient déjà.** Un client qui ne re-lit pas n'apprend jamais — et un client
temps réel ne re-lit, précisément, jamais.

**Le réflexe** : devant un filtre de lecture per-user, ne pas demander « tous les lecteurs
l'appliquent-ils ? ». Demander **« qui apprend ce fait, et par quel canal ? »** Compter les canaux,
pas les lecteurs. Il en faut DEUX et ils ne se subsument pas :
- une **diffusion** vers `user:{id}` pour les appareils en ligne ;
- un **stream de rattrapage** pour ceux qui étaient hors ligne au moment du geste.
Un filtre de lecture n'est ni l'un ni l'autre : c'est la réponse à une question qu'il faut d'abord
avoir posée.

**Corollaire — l'écriture per-user est per-USER, pas per-DEVICE.** Le symptôme se déguise en succès
parce que l'appareil émetteur applique le geste en optimiste : le développeur qui teste sur UN
appareil voit exactement le comportement attendu. Toute table portant `userId` en clé (et non
`deviceId`) doit son écriture à la room de l'utilisateur. C'est le contrat que
`conversationPreferencesSync` avait déjà gravé pour `UserConversationPreferences` — et que les trois
routes sœurs de `UserMessageDeletion` n'avaient jamais repris. Le remède est le même : **un écrivain
unique**, qui persiste ET rétracte ET diffuse, pour qu'un quatrième site d'écriture ne puisse pas
n'en honorer qu'une partie.

**Corollaire — une APPARITION ne s'écrit pas comme une tombstone inversée.** Le retour en vue
(`restore-for-me`) ne peut PAS voyager dans le stream de disparitions : la ligne
`UserMessageDeletion` est SUPPRIMÉE par le restore, donc rien ne reste à interroger « depuis
`since` », et le client qui avait retiré la bulle n'en détient plus le contenu. Le seul message
honnête est une ADRESSE (« cette conversation a changé, va relire »), pas une donnée. Ne pas
chercher la symétrie : les deux directions ont des formes différentes parce que l'une retire ce que
le client a et l'autre rend ce qu'il n'a plus.

**Corollaire — le stream de rattrapage interroge la table de l'ÉVÉNEMENT.** Repayé de la leçon 147
sans remise : un `delete-for-me` n'écrit QUE `UserMessageDeletion`, `Message.updatedAt` ne bouge
pas. Un stream branché sur `Message` ne verrait jamais ces disparitions, et son test passerait au
vert sur les suppressions globales, qui, elles, y sont visibles.

**Corollaire — l'id SERVI et l'id du CURSEUR peuvent être deux ids différents.** La tombstone porte
le `messageId` (le client indexe par message) ; le keyset ordonne des lignes `UserMessageDeletion`
et doit départager par l'id de CETTE table. Un lot de 100 masquages écrit 100 lignes à la même
milliseconde : départager par `messageId` marcherait par accident, départager par la ligne est
correct par construction.

**Corollaire de posture (leçons 145/147, troisième confirmation)** : un stream de disparitions qui
échoue rend « je ne peux pas affirmer l'exhaustivité » (`truncated: true`) et sert le reste du
rattrapage. Faire échouer `/sync` parce qu'on n'a pas su calculer un retrait inverserait le
compromis — servir le rattrapage est le produit, en retirer une bulle est une courtoisie.

---
