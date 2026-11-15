## Leçon 51 — un fanout « écran liste » ajouté sur le chemin d'envoi doit l'être AUSSI sur edit/delete/recall — chercher les mutations siblings du même agrégat de liste (routine messaging, iter 158, 2026-07-09)

Le chemin d'envoi (`broadcastNewMessage`) fanne `CONVERSATION_UPDATED` (aperçu `lastMessageId`/
`lastMessagePreview`) vers **chaque salle `user:<id>`** des participants, avec un commentaire explicite :
sinon un membre posé sur la **liste de conversations** (qui a quitté `conversation:<id>` mais reste dans
`user:<id>`) ne reçoit jamais le signal et sa ligne reste figée. Mais **édition et suppression** — qui
changent aussi l'aperçu de la liste quand elles touchent le dernier message — n'émettaient que
`MESSAGE_EDITED`/`MESSAGE_DELETED` vers `conversation:<id>`, jamais `CONVERSATION_UPDATED` vers les salles
user. Le handler delete recalculait pourtant déjà `lastMessageAt` : le serveur *savait* que l'aperçu avait
changé, mais ne le disait qu'aux sockets dans la salle conversation. Faille auto-réparée par SWR à la
réouverture → fenêtre invisible = « rester sur la liste sans rouvrir la conversation », donc facile à rater
en test manuel.

**Signature du bug** : un agrégat affiché sur un écran de LISTE (aperçu de dernier message, compteur non-lus,
badge, ordre de tri) est rafraîchi en temps réel par UN chemin de mutation (create) via un fanout vers les
salles `user:` — mais les AUTRES mutations du même agrégat (edit, delete, recall, réaction qui change le
preview, pin/unpin) n'émettent que vers la salle `conversation:`, que l'observateur liste-seule ne rejoint
pas.

**Règle réutilisable** : quand un fanout vers les salles `user:` est ajouté sur une mutation « parce que
l'écran liste doit se rafraîchir même sans la conversation ouverte », énumérer IMMÉDIATEMENT **toutes** les
mutations qui touchent le même agrégat de liste et vérifier qu'elles fannent pareil. Extraire un **helper
partagé** (ici `emitConversationPreviewUpdate`) plutôt que dupliquer l'emit inline sur N sites (ici 7 : WS +
2 routes REST) — la duplication inline est exactement ce qui laisse un transport dériver (cf. Leçon 50). Le
helper recalcule l'agrégat depuis la source de vérité (dernier message non supprimé) pour rester
auto-cohérent : appliqué à une mutation d'un élément **non-dernier**, il ré-émet l'aperçu inchangé (no-op
idempotent client) plutôt que d'exiger une détection « est-ce le dernier ? » fragile. Best-effort strict :
un fanout side-channel ne doit JAMAIS faire échouer la mutation primaire déjà réussie (try/catch interne,
`onError` optionnel pour la traçabilité).

---
