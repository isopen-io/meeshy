## 2026-08-09 (17) — Rattraper la troisième omission d'un raccourci, c'est reconnaître qu'il faut supprimer le raccourci

Le cycle 16 fermait sur une tête précise : `DELETE /admin/posts/:postId` écrit `deletedAt` sans
passer par `PostService.deletePost`, « restent la désactivation des liens de partage et la ligne
d'audit ». Les deux existaient encore. Mais l'information qui compte n'est pas *lesquelles* : c'est
que c'était la **troisième fois** — usages de sons (cycle N), diffusion temps réel (cycle 16),
audit + liens (ici) — que le même raccourci se fait rattraper **un effet à la fois**.

1. **Un compteur d'incidents sur un MÊME site est un diagnostic, pas une statistique.** Trois
   omissions successives au même endroit ne disent pas « ce site est malchanceux », elles disent
   que la liste des obligations n'existe **nulle part** : il fallait relire `deletePost` en entier
   pour la reconstituer, et personne ne le refait au moment d'écrire un `prisma.post.update`. Le
   correctif n'était donc pas d'ajouter les deux effets manquants — c'était de **nommer la liste**
   (`applyPostRemovalEffects`) pour qu'un quatrième effet ajouté demain s'applique aux deux chemins
   sans que quiconque ait à s'en souvenir. Règle : **au deuxième rattrapage sur le même
   contournement, arrêter de rattraper et dédupliquer** ; au troisième, c'est déjà tard.
2. **Le jumeau était déjà là et montrait la forme à copier.** `broadcastPostRemoval` — créé au
   cycle 16 pour la moitié VOLATILE du retrait (ce qui s'annonce) — attendait son symétrique pour
   la moitié DURABLE (ce qui s'écrit). Un helper partagé qui ne couvre qu'une moitié d'un geste est
   une invitation lisible : chercher l'autre moitié avant d'ajouter du code à côté de lui.
3. **Un schéma OpenAPI peut documenter une garantie que le code ne tient pas, et c'est indétectable
   par les tests.** La route accepte `reason` avec la description « Reason for deletion (for audit
   trail) ». La raison n'allait que dans un `fastify.log.info` — jamais dans `AdminAuditLog`, la
   table que la console interroge. Aucun test ne pouvait échouer : le champ était bien accepté, bien
   validé, bien journalisé. **Un champ dont la description nomme une DESTINATION est une assertion
   testable** — grep les champs d'API décrits par leur destinataire (« for audit trail », « for
   analytics », « for moderation ») et vérifier que la destination est atteinte.
4. **La conséquence produit de l'omission des liens n'est pas « un lien mort ».** `TrackingLink`
   n'est pas soumis au `onDelete: Cascade` (rien ne cascade sur un soft-delete). Un post retiré
   **pour motif de modération** gardait donc ses `/l/<token>` actifs : le contenu sanctionné restait
   atteignable **par le chemin même de sa diffusion**. Quand un effet manquant touche un objet de
   partage, ne pas raisonner en « donnée incohérente » — dérouler qui, dehors, tient encore une
   poignée sur le contenu.

**Reste ouvert** — `applyPostRemovalEffects` n'écrit d'audit que si l'acteur n'est pas l'auteur
(règle produit héritée : se supprimer soi-même n'est pas un acte de modération). Or
`services/gateway/CLAUDE.md` pose « Admin audit trail required for all admin actions », et la route
console exige `canModerateContent` pour être empruntée. Les deux lectures se défendent ; trancher
demande une décision produit, pas un correctif — ne pas la prendre en passant.

**Piste pour le cycle suivant, trouvée en appliquant la règle 1 à la classe entière.** Le même
défaut existe sur les MESSAGES, et à une échelle pire. `TrackingLink` porte un `messageId` : un
message qui contient un lien court en est la cible. Or la suppression d'un message a **quatre**
écrivains — `MessageHandler.ts:991`, `MaintenanceService.ts:527`, `messages-advanced.ts:554`,
`messages.ts:584` — et **aucun** ne bascule `isActive: false`. Les trois fichiers de routes/handler
connaissent pourtant `TrackingLinkService` : ils s'en servent à la CRÉATION et à l'ÉDITION, jamais à
la suppression. Un message effacé laisse donc ses `/l/<token>` actifs, et ils continuent de compter
des clics vers un contenu retiré. Quatre écrivains sans unité commune, c'est la même cause qu'ici
d'un cran plus grave : commencer par nommer la liste (le pendant de `applyPostRemovalEffects` pour
`Message`), pas par corriger les quatre sites.
