# Plan itération 62wp — perf(web/admin) lazy-load vignettes

## Objectif
Optimiser le chargement des images de vignettes des listes/grilles admin :
`loading="lazy"` (différer le réseau hors-écran) + `decoding="async"` (décodage
hors thread principal). Surface **orthogonale** à la vague i18n parallèle.

## Étapes
1. [x] Recenser les `<img>` bruts sans `loading=` (comparaison `<img` vs
       `loading=` par fichier pour éviter les faux positifs de regex `=>`).
2. [x] Vérifier au cas par cas que chaque `<img>` est une **vignette de liste**
       (hors-écran par nature) et non une image focale above-the-fold/lightbox.
3. [x] Ajouter `loading="lazy" decoding="async"` aux 9 vignettes admin retenues.
4. [x] Documenter les exclusions volontaires (ImageGallery hero/lightbox,
       MediaImageCard déjà fait, feed/story/reel focal + contendu).
5. [ ] Commit + push sur `claude/practical-fermat-n1xcdq`.
6. [ ] PR → CI vert → merge dans `main`.
7. [ ] Mettre à jour `branch-tracking.md` (état + historique) et supprimer la
       branche après merge.

## Fichiers touchés
- `app/admin/communities/page.tsx`
- `components/admin/agent/ConversationPicker.tsx`
- `components/admin/ranking/ConversationRankCard.tsx`
- `components/admin/user-detail/{UserActivitySection,UserConversationsSection,UserMediaSection,UserPostsSection}.tsx`

## Risques
Aucun comportemental : `loading`/`decoding` sont des hints standards HTML, sans
effet sur le rendu visuel ni la logique. Pas de clé i18n, pas de collision avec
les PR i18n en vol (#840/#843/#835/#818/#814…).
</content>
