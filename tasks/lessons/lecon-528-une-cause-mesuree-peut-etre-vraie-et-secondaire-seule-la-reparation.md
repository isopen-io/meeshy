## Leçon 528 — Une cause MESURÉE peut être vraie et secondaire ; seule la réparation les départage

**Symptôme (porteur, 2026-09-05)** : « j'ai tapé `@meeshy` et aucune rangée de
mentions potentiel n'est apparu nulle part ». Capture jointe : dans le post
PUBLIÉ, `@meeshy` est un lien qui ouvre le profil. Le rendu marche, la
composition non.

Deux faits mesurés le même quart d'heure, tous deux solides :

1. `GET /api/v1/directory/friend-requests` rend **404 en production** (vérifié
   au `curl` ; toute la famille `/directory/*` manque à la passerelle
   déployée, alors que le dépôt a les routes et les enregistre).
   `ComposerMentionFriendsSource` avale l'échec en `catch { return [] }`.
2. Un brouillon n'avait **aucune recherche d'utilisateurs** :
   `Context.composerDraft.remoteContext == nil` → sortie anticipée. Seuls les
   amis ACCEPTÉS pouvaient être proposés.

J'ai classé (1) en premier — un 404 en production est spectaculaire, daté,
citable. C'était le mauvais ordre.

Le porteur a fait basculer le simulateur sur **staging**, où `/directory/*`
répond. Retapé `@` : **toujours aucune rangée**. Mesuré à l'API, jeton en
main : `friend-requests?status=accepted` → **0 ami** ;
`users/search?q=meeshy` → **1 : @meeshy**. La personne visée n'était l'amie de
personne, donc injoignable sur les DEUX serveurs, 404 ou pas.

> **Deux causes mesurées ne se hiérarchisent ni par leur gravité, ni par leur
> netteté, ni par l'ordre où on les a trouvées.** Le seul test qui les sépare
> est : *réparer l'une, et regarder si le symptôme survit.* Ici il a survécu —
> (1) était réelle et secondaire, (2) était la racine.

Corollaire de méthode : **quand un banc d'essai neuf devient disponible
(ici : un second serveur), il ne sert pas qu'à « reproduire » — c'est une
EXPÉRIENCE qui isole une variable.** Basculer sur staging n'était pas une
commodité de test, c'était la manipulation qui a rendu le verdict.

Et une forme à retenir sur le défaut lui-même : **l'impossibilité d'un appel
CONTEXTUEL avait été lue comme l'impossibilité de TOUTE recherche.** Le
doc-comment de `.composerDraft` le disait presque bien — « aucun id serveur
n'existe, donc aucun appel réseau n'est possible » — la première moitié étant
vraie (l'endpoint `/mentions/suggestions` exige un post ou une conversation)
et la seconde fausse : `users/search` n'a jamais eu besoin de contexte, et la
surface MOOD du MÊME composer l'employait déjà. Une jumelle divergente, dont
la pauvre était montée sur la surface la plus utilisée.
