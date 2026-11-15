# L'administration se lit par sections — spécification

> 2026-10-04 · directive porteur : « améliorer la page d'administration pour plus de lisibilité, s'assurer que toutes les données remontent correctement, structurer par section, éviter de restituer tout en un seul coup, accès via des modales ; BIGBOSS n'a besoin de rien justifier ; compléter section par section ». Portée choisie par le porteur : **hub et fiches**.
> Application `apps/web` (kit `components/admin`, écrans `routes/admin-*.tsx`), passerelle `services/gateway/src/routes/admin`. Prolonge `2026-09-30-admin-vue-de-dieu-design.md` (règles R1–R8 inchangées).

## 1. Le patron « synthèse → modale »

- `AdminSummaryCard` (kit) : titre, glyphe, deux à quatre valeurs clés déjà formatées, une phrase d'état, un bouton « Ouvrir » de 44 px. Ses valeurs viennent de requêtes LÉGÈRES (celles déjà servies pour les chiffres) ; ses états : squelette, erreur avec « Réessayer », refus.
- `AdminDetailSheet` (kit) : modale bâtie sur `components/sheet.tsx` (dialogue natif, Échap, retour matériel, focus), titre, bouton de fermeture traduit, corps défilant. **Son contenu n'est monté qu'à l'ouverture** : aucune requête du détail ne part tant qu'elle est fermée.
- `useAdminOpen(ids)` : la modale ouverte vit dans l'adresse (`?open=<id>`, même mécanique que `useAdminTab`). Le retour ferme, un lien copié rouvre. Un `?tab=<id>` hérité d'une fiche à onglets ouvre la modale correspondante (rétrocompatibilité des liens).
- Une ligne de liste ouvre toujours sa fiche en pleine page (adresses inchangées).

## 2. Le hub `/admin`

En tête : bande « À traiter » (signalements en attente, diffusions en cours) — chaque pastille ouvre la liste filtrée. Puis une carte par zone : En ce moment, Plateforme, Santé de l'usage, Tendances, Personnes et échanges, Système. Graphiques, classements et listes passent dans la modale de leur zone. Le répertoire des sections reste en bas. Les gardes par capacité servie sont celles d'aujourd'hui.

## 3. Les fiches

Membre, anonyme, demande de contact, conversation, communauté, lien de partage, lien de suivi, publication, signalement, diffusion : l'en-tête d'identité, les gestes et le bandeau de chiffres restent visibles ; chaque bloc détaillé (onglet ou section empilée) devient une carte résumée qui ouvre sa section existante en modale. Les écrans sans fiche (Statistiques, Supervision, Langues, Agent, Réglages, Journal, Barème, Classement) gardent leur forme.

## 4. Le rang souverain agit sans motif

- Passerelle : partout où un motif écrit est exigé, il devient **facultatif pour le rang souverain** (BIGBOSS) ; les autres rôles gardent l'exigence telle quelle. Un motif fourni reste validé et consigné. Le geste reste écrit dans `AdminAuditLog` (motif absent permis). Un ancien client qui envoie un motif continue de fonctionner.
- Web : pour le rang souverain, les confirmations n'affichent plus de champ de motif, et la lecture des messages d'une conversation s'ouvre directement.
- Chaque geste d'administration qui écrit laisse une ligne au journal, y compris ceux qui n'en laissaient pas.

## 5. Données justes

Les audits de contrat du 2026-10-04 (lecture des deux côtés) ont trouvé que la FORME des données concorde partout ; les défauts sont des filtres, des calculs et des affichages. Chaque lot corrige ceux de son périmètre, chacun avec un témoin qui échoue avant la correction (jamais sur une fixture qui ne ressemble pas à la base : un champ absent n'est pas un champ nul, leçon 318). Les données servies mais jamais affichées remontent dans les modales des fiches.

## 6. Lots

1. Socle : kit synthèse/modale ; motif facultatif pour le rang souverain (passerelle et web) ; corrections de données de la passerelle.
2. Hub.
3. Personnes (membre, anonyme, demande de contact).
4. Échanges et contenus (conversation, communauté, lien de partage, publication).
5. Modération, croissance, plateforme (signalement, journal, lien de suivi, diffusion, agent, barème, réglages).

Chaque lot fusionne dans `dev` dès qu'il est prêt ; la CI entière est remise au vert avant la promotion `dev → main`.

## 7. Décisions prises en autonomie (porteur absent)

- Un e-mail ou un téléphone changé par l'administration perd son état « vérifié » : une coordonnée nouvelle n'a pas été prouvée.
- Rouvrir un signalement efface sa résolution précédente (`resolvedAt`, `actionTaken`) et le laisse sans modérateur.
- La carte « Plateforme » du hub montre ce que la passerelle sert (comptes, messages, communautés, nouveaux sur 24 h) ; aucun total de conversations n'est inventé.
- Les heures du hub sont rendues dans le fuseau du lecteur.
