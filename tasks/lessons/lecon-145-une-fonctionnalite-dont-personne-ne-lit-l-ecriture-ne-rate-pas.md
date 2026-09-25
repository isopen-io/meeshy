## Leçon 145 — Une fonctionnalité dont personne ne lit l'écriture ne rate pas discrètement : elle RÉPOND SUCCÈS

Cycle 108, routine messaging. Deux fonctionnalités de masquage personnel — « supprimer pour moi »
(`UserMessageDeletion`) et « effacer l'historique » (`UserConversationPreferences.clearHistoryBefore`)
— étaient livrées de bout en bout du côté ÉCRITURE : routes REST documentées dans Swagger, écriture en
base, bump de version, diffusion Socket.IO vers les autres appareils du compte, modèles iOS qui
décodent le champ, helpers `filterDeletedMessages`/`getDeletedMessageIds` dans `@meeshy/shared`. Aucune
requête de lecture ne consultait ni l'une ni l'autre. `deletedAt: null` — la pierre tombale du
« supprimer pour TOUT LE MONDE » — était le seul filtre de toutes les surfaces.

Le résultat n'est pas « la fonctionnalité ne marche pas ». C'est que l'API **répond**
`{"success": true, "data": {"message": "Message deleted from your view"}}` à une opération qu'elle n'a
aucun moyen d'honorer. Le mensonge est dans la réponse, pas dans un silence.

**Ce qui rend ce défaut invisible à un audit ordinaire** : chaque preuve d'existence qu'on cherche
existe. La route existe. La colonne existe. La diffusion existe. Le décodeur client existe. Le helper
de filtrage existe. Sept sur huit maillons sont là, et le huitième est le seul qui produise un effet
observable. Un grep du nom de la fonctionnalité rend une dizaine de fichiers et rassure.

**Le réflexe** : devant tout champ « personnel » (masquage, préférence de visibilité, opt-out), ne pas
demander « le champ est-il écrit / transporté / décodé ? ». Demander : **quelles requêtes le LISENT
au moment de servir ?** Le grep qui tranche est celui du nom de la colonne restreint aux chemins de
lecture — et un résultat vide côté lecture, avec des résultats côté écriture, est le diagnostic
complet. Corollaire du dénombrement de la 232 : ici l'écart n'est pas 2 sur 6, c'est **0 sur N**.

**Corollaire de conception** : un filtre personnel appliqué par recopie à N sites est un filtre qu'un
N+1ᵉ site oubliera. Il doit être UNE fonction (`applyPersonalHistoryFilter`) dont la propriété
centrale est qu'elle ne peut que RÉTRÉCIR : fusionner par spread aurait écrasé la borne du curseur de
pagination et l'allowlist d'ids du mode `around` — un filtre de confidentialité qui, mal fusionné,
rend PLUS de lignes qu'avant. Deux bornes basses se fusionnent en gardant la plus stricte ; un
`id` scalaire devient une allowlist d'un élément, jamais un `notIn` (qui transformerait « ce message »
en « tous sauf les masqués »).

**Corollaire de posture d'échec** : masquer est une courtoisie, afficher la conversation est le
produit. Une recherche de masquage qui échoue doit dégrader vers « ne rien masquer » et servir, pas
faire échouer la lecture — l'inverse exact d'un contrôle d'autorisation. Écrire ce choix dans le code,
sinon le prochain lecteur le prendra pour un oubli.

---
