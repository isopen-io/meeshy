---
"@meeshy/gateway": patch
---

Un post retiré depuis la console de modération coupe enfin ses liens de partage et laisse une trace d'audit.

`DELETE /admin/posts/:postId` écrit `deletedAt` en direct, sans passer par
`PostService.deletePost`. Deux effets que le service tient depuis toujours manquaient encore à ce
raccourci — les deux derniers d'une série que trois cycles successifs ont rattrapée un par un
(usages de sons, puis diffusion temps réel, puis ceci) :

**Les liens de partage restaient actifs.** Un soft-delete ne bascule que `deletedAt` : aucun
`onDelete: Cascade` ne se déclenche, et les `TrackingLink` visant le post gardaient
`isActive: true`. Un contenu retiré **pour motif de modération** restait donc atteignable par ses
`/l/<token>` déjà partagés — c'est-à-dire par le chemin même de sa diffusion. Le service coupait
ces liens ; la console, non.

**Aucune ligne `AdminAuditLog` n'était écrite.** La route accepte un champ `reason`, que son propre
schéma OpenAPI documente « Reason for deletion (for audit trail) » : la raison n'allait pourtant
que dans un `fastify.log.info`, jamais dans la table que la console interroge. Le geste de
modération le plus sensible du produit ne laissait aucune trace requêtable, là où
`DELETE /posts/:postId` en laisse une pour exactement le même geste — alors que
`services/gateway/CLAUDE.md` pose « Admin audit trail required for all admin actions ».

Correctif : les trois effets durables d'un retrait (ligne d'audit, coupure des liens de partage,
libération des usages de sons) vivent désormais dans une unité unique,
`services/posts/postRemovalEffects.ts` → `applyPostRemovalEffects`, par laquelle passent les deux
routes. C'est le symétrique de `broadcastPostRemoval`, qui tient depuis le cycle précédent la
moitié volatile du même geste. Un effet ajouté demain s'applique aux deux chemins sans que
personne ait à se souvenir du second écrivain. La raison fournie par la console est désormais
portée dans `metadata` de la ligne d'audit ; `deletePost` accepte pour cela un `reason` optionnel.

Inchangé, délibérément : un auteur qui retire son propre contenu n'ouvre pas de ligne d'audit —
se supprimer soi-même n'est pas un acte de modération.
