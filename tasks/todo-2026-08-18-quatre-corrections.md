# 2026-08-18 — Quatre corrections (deep links, mentions, trail, appel)

## 1. `/l/<token>` → « Lien introuvable » systématique
**Cause racine** — `DeepLinkRouter.trackedDestination` retombe sur
`.joinLink(identifier: token)` pour TOUT ce qui n'est pas un post/réel/story
ACTIF. Or le token d'un `/l/` iOS est un `TrackingLink.token` (6 car.), jamais
un `ConversationShareLink.linkId` : la voie jointure appelle
`GET /anonymous/link/<trackingToken>` → 404 → toast « Lien introuvable »
(`RootView.joinViaShareLink`). Trois chemins tombent dedans :
- `targetType == EXTERNAL` (façade `/l/` d'une URL postée dans un message) ;
- `isActive == false` — TOUTE story expirée désactive ses liens
  (`deactivatePostTrackingLinks`), donc tout partage de story de plus de 24 h ;
- résolution impossible (réseau / 404).

- [ ] 1.1 `trackedDestination` : `.externalLink(url:)` + `.unresolvedTrackedLink(token:)`,
      repli sur `originalUrl` reparsé, plus de `.joinLink` hors `kind == conversation`
- [ ] 1.2 PROFILE : `targetId` est un ObjectId → `ProfileSheetUser.from(idOrUsername:)`
- [ ] 1.3 Consommateurs (`RootView`, `iPadRootView`) + toasts
- [ ] 1.4 Tests

## 2. Mentions dans une story / un post
- [ ] 2.1 `UnifiedPostComposer` : brancher `MentionComposerController` + panneau
- [ ] 2.2 Story : action « @ » (picker) → pastille de mention sur le canvas
- [ ] 2.3 Publication : `slide.content` porte les `@handle` du canvas (le gateway
      persiste/notifie déjà depuis `post.content`)
- [ ] 2.4 Tests

## 3. Trail de story bord à bord
**Cause racine** — dans `CollapsibleHeader`, `titleAccessory` est un FRÈRE de
`trailing()` dans le `HStack` : sa largeur s'arrête aux boutons.
- [ ] 3.1 Couche pleine largeur sous le chrome droit
- [ ] 3.2 Encart de fin de contenu pour dégager le dernier anneau
- [ ] 3.3 Gardes de source mises à jour (supersession de la règle 2026-08-14)

## 4. Appel plein écran + icône de conversation
**Cause racine** — `.clipShape(RoundedRectangle(...))` posé sur un ZStack dont
le cadre EXCLUT la safe area haute : le fond `.ignoresSafeArea()` est rogné,
le fond blanc du `fullScreenCover` transparaît.
- [ ] 4.1 Racine bord à bord, chrome haut ré-encarté explicitement
- [ ] 4.2 Bouton conversation → icône/avatar de la conversation
- [ ] 4.3 Tests
