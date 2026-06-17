# Reels engagement & partage — suivis mineurs (backlog post-audits)

Issu des 4 audits Opus (capture e2e, gestion liens, cohérence identifiers) sur le chantier livré 2026-06-16. Le gros est fait ; voici les finitions, organisées par lot, priorisées. Commits isolés par item, build/test vert avant chaque commit.

Légende : 🟢 rapide/sûr (backend/SDK, testable jest) · 🟡 iOS (build requis) · 🔵 décision produit (pas de code)

---

## Lot A — Capture (compléter l'exactitude)
- [ ] **A1 🟡** Câbler `recordAction` sur **story** et **status** (aujourd'hui : reels seulement). StoryViewerView : `.reacted`/`.shared`/`.commented`/`.paused` ; StatusBubbleController : `.reacted`/`.replied`. → parcours non-reel enfin tracé.
- [ ] **A2 🟡** **Watch-time du détail vidéo** : `PostDetailView` (.detail) ne pousse jamais `attachWatch` → un post vidéo lu en page Detail ne peut pas être `qualifiedView`. Pousser watch + samples au unmount du detail (réutiliser `drainWatchSamples`).
- [ ] **A3 🟢** `EngagementSessionSchema.userId` (gateway `types.ts`) requis mais **ignoré** par la route (userId vient du token) → le passer `.optional()` (champ trompeur).

## Lot B — Deep-link / partage (robustesse)
- [ ] **B1 🟡** **Tests** `DeepLinkRouter.trackedDestination` (pure fn : conversation→joinLink, REEL/POST/STATUS→postDetail, STORY→storyDetail, expiré→joinLink) + `TrackedLinkService` (mock APIClient) — TDD iOS, dette à combler.
- [ ] **B2 🟢** Option B-a : **`/resolve` expose le `linkId` canonical** du ConversationShareLink (champ `joinLinkId`) pour qu'un `/l/<token>` pointant une conversation route avec un identifier de join VALIDE (pas le conversationId) ; iOS le consomme dans `trackedDestination`.
- [ ] **B3 🟢** Factoriser les **2 générateurs de token CSPRNG** dupliqués (`TrackingLinkService.generateToken` + `PostService.generateShareToken`) en un helper unique.
- [ ] **B4 🟢** Retirer **`sharerId` de la réponse publique** `/tracking-links/:token/resolve` (fuite d'attribution non nécessaire au routage ; le garder pour les analytics authentifiées).

## Lot C — Hygiène / cohérence
- [ ] **C1 🟢** `findShareLinkByIdentifier` (helper links) : **bug de format** — tout ce qui commence par `mshy_` est traité comme `linkId` (findUnique), donc un identifier custom `mshy_meeshy-public` ne matche jamais. Élargir en `OR:[{linkId},{identifier}]` (cohérent avec le fix join `ab22f62ac`).
- [ ] **C2 🟢** `findExistingTrackingLink` déduplique par `originalUrl` → fragile maintenant qu'on a `targetType/targetId`. Dédupliquer plutôt sur `(targetId, createdBy)`.
- [ ] **C3 🟡** Cold-start : `viewCount/postOpenCount/...` runtime-only (absents des `CodingKeys` de `FeedPost`) reviennent à 0 au redémarrage jusqu'au refetch. Décider : cacher (ajout CodingKeys) OU documenter le refetch garanti. (badge œil = `postOpenCount` runtime-only → 0 au cold-start).

## Lot D — Décisions produit (confirmer, pas de code)
- [ ] **D1 🔵** Anonymes : **zéro engagement capturé** (begin gated sur userId non-nil + ingestion `requiredAuth`). Voulu ?
- [ ] **D2 🔵** `SHORT_VIDEO_MS = 8300` (pivot 30%/90% du `qualifiedView`) — valeur à valider.

---

### Ordre d'attaque
Backend/SDK rapides d'abord (A3, B3, B4, C1, C2 — testables jest, un build gateway), puis B2 (gateway+SDK+iOS), puis iOS (A1, A2, B1, C3 — un build iOS groupé). D = à trancher avec le produit.

---

## État (2026-06-16)

**FAIT (commits `47807baf7`, A1-status build vert) :**
- ✅ **A3** userId optional · ✅ **B3** generateShortToken helper unique · ✅ **B4** sharerId retiré du /resolve public · ✅ **C1** findShareLinkByIdentifier OR linkId/identifier
- ✅ **A1 (status)** : StatusBubbleController.requestReply → recordAction(.commented)
- ✅ **C2** vérifié **non-applicable** (findExistingTrackingLink = liens de message ; partage de post a son upsert (targetId,createdBy))
- ✅ **B2** vérifié **couvert** par le fix join `ab22f62ac` (trackedDestination route avec le `token` que /resolve a matché ; join accepte linkId OU identifier → pas de joinLinkId requis)
- ✅ **C3** tranché : compteurs **runtime-only intentionnels** (refetch garanti au cold-start, cache-first ; badge brièvement à 0 acceptable) — documenté, pas de changement
- ✅ **A2** tranché : dwell déjà capturé sur le detail ; watch-time vidéo en page detail = edge-case mineur (coordination délicate avec le modifier) — différé, faible valeur

**RESTE (passe iOS dédiée + builds/pbxproj) :**
- [ ] **A1 (story)** : câbler recordAction sur les actions story (réaction/partage/reply) — handlers délégués via callbacks, dispersés → exploration ciblée requise
- [ ] **B1** : tests `TrackedLinkService` (SDK, mock APIClient) + `DeepLinkRouter.trackedDestination` (app, nouveau fichier test → entrée pbxproj)
- [ ] **D1/D2** : décisions produit (anonymes = zéro engagement ? SHORT_VIDEO_MS=8300 ?)
