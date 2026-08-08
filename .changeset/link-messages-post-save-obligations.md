---
"@meeshy/gateway": patch
---

Un message envoyé par lien de partage est désormais traduit, et remonte sa conversation.

`POST /links/:identifier/messages` et son jumeau authentifié `/messages/auth` appelaient
`prisma.message.create` puis diffusaient — et c'était tout. Le chemin nominal
(`MessagingService.runPostSaveSideEffects`) exécute quatre écritures après le commit ; ces
deux routes contournent la classe entière, donc elles n'en exécutaient **aucune** :

- **Le Prisme Linguistique était éteint sur ce transport.** Le message n'était jamais poussé
  au translator, et `Message.translations` n'est jamais rempli après coup (aucune
  retraduction n'est déclenchée hors édition ou demande explicite). Un participant qui lit
  français voyait donc indéfiniment en clair le message espagnol de l'anonyme assis dans la
  même conversation — sur le seul transport d'envoi dont dispose un participant anonyme, et
  celui qu'emprunte la conversation globale `meeshy`.
- **`Conversation.lastMessageAt` restait périmé.** `GET /conversations` trie dessus
  (`orderBy: { lastMessageAt: 'desc' }`) et pagine par curseur sur ce même champ : une
  conversation dont tout le trafic récent arrive par lien restait enterrée à sa position
  d'avant. Le client web remontait bien la conversation depuis `link:message:new` — et le
  prochain refetch la redescendait, le serveur n'ayant jamais enregistré le bump.
- Les statistiques de langue de la conversation n'étaient pas incrémentées.

Racine : l'obligation vivait dans une méthode `private` de `MessagingService`, donc
inatteignable par tout écrivain hors de cette classe — exactement la configuration qui avait
déjà produit les trous des cycles précédents. Correctif : une unité publique unique
`runMessagePostSaveEffects` (bump, poussée au translator, statistiques), appelée par le
chemin nominal ET par les deux routes de lien. Ce qui est poussé au translator est le
contenu **stocké** (URLs de tracking réécrites) sous la langue source **normalisée**, celle
qui est persistée. Le quatrième effet du chemin nominal — l'avancement du curseur de lecture
de l'auteur — reste délibérément hors de l'unité : il ne corrige aucun défaut observable (le
décompte de non-lus exclut déjà ses propres messages) et la route de lien authentifiée peut
porter un participant synthétique pour la conversation globale, sous lequel il créerait un
curseur orphelin.
