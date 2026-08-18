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

- [x] 1.1 `trackedDestination` : `.externalLink(url:)` + `.unresolvedTrackedLink(token:)`,
      repli sur `originalUrl` reparsé, plus de `.joinLink` hors `kind == conversation`
- [x] 1.2 PROFILE : `targetId` est un ObjectId → `ProfileSheetUser.from(idOrUsername:)`
- [x] 1.3 Consommateurs (`RootView`, `iPadRootView`) + toasts
- [x] 1.4 Tests

## 2. Mentions dans une story / un post
- [x] 2.1 `UnifiedPostComposer` : brancher `MentionComposerController` + panneau
- [x] 2.2 Story : action « @ » (picker) → pastille de mention sur le canvas
- [x] 2.3 Publication : `slide.content` porte les `@handle` du canvas (le gateway
      persiste/notifie déjà depuis `post.content`)
- [x] 2.4 Tests

## 3. Trail de story bord à bord
**Cause racine** — dans `CollapsibleHeader`, `titleAccessory` est un FRÈRE de
`trailing()` dans le `HStack` : sa largeur s'arrête aux boutons.
- [x] 3.1 Couche pleine largeur sous le chrome droit
- [x] 3.2 Encart de fin de contenu pour dégager le dernier anneau
- [x] 3.3 Gardes de source mises à jour (supersession de la règle 2026-08-14)

## 4. Appel plein écran + icône de conversation
**Cause racine** — `.clipShape(RoundedRectangle(...))` posé sur un ZStack dont
le cadre EXCLUT la safe area haute : le fond `.ignoresSafeArea()` est rogné,
le fond blanc du `fullScreenCover` transparaît.
- [x] 4.1 Racine bord à bord, chrome haut ré-encarté explicitement
- [x] 4.2 ~~Bouton conversation → icône/avatar~~ — **décision user 2026-08-18 : « laisser le bouton tel quel »**, aucune modification
- [x] 4.3 Tests

## Revue

### Livré
1. **`/l/<token>`** — repli `.joinLink` supprimé ; `.externalLink` / `.unresolvedTrackedLink`
   ajoutés ; `originalUrl` reparsée ; `isActive:false` ouvre quand même sa cible ;
   PROFILE via `ProfileSheetUser.from(idOrUsername:)` ; clic compté EN PARALLÈLE
   de la résolution. 12 tests.
2. **Mentions** — règle pure `ComposerMentionQuery` (SDK), partagée par le
   composeur de post/statut, l'éditeur de texte de story ET le contrôleur de
   mention de conversation (qui portait une copie buguée : elle ouvrait une
   recherche sur `exemple.com` à chaque `contact@exemple.com`). Action « @ » du
   panneau Texte → `StoryMentionPickerSheet` → pastille `@pseudo` sur le canevas.
   Récolte des handles vers `slide.content` au hand-off — seul canal de mention
   du gateway. 24 tests SDK + 16 app.
3. **Trail** — couche `.background` pleine largeur sous le chrome ; dégagement de
   fin de piste. 8 gardes réécrites (supersession de la règle 2026-08-14).
4. **Appel** — racine bord à bord ; `chromeTopInset` partagé. 6 tests.

### Vérification bout-en-bout (simulateur, liens de PRODUCTION)
- `meeshy://l/45SIKm` (réel ACTIF) → ouvre le réel « Good Sunday, family. » de
  Windie Nh, vidéo + likes + commentaires. ✅
- `meeshy://l/Wi3vGV` (story EXPIRÉE, `isActive:false` en prod) → ouvrait
  « Lien introuvable » ; ouvre maintenant l'écran de destination. Celui-ci
  rendait une PAGE BLANCHE surmontée d'un composeur de commentaire, sans
  en-tête donc sans retour — `PostDetailView` n'avait aucune branche `else`
  après `if let post` / `else if isLoading`. État vide explicite ajouté
  (titre + explication + retour), composeur masqué sans post. ✅

### Hors périmètre, corrigé au passage
`MentionComposerControllerTests` était FLAKY avant toute modification (2 à 4
échecs par exécution, vérifié sur la version HEAD non modifiée) : cinq
`Task.sleep(400 ms)` pariaient sur 100 ms de marge après un débounce de 300 ms,
sur le MÊME acteur. Remplacés par une attente de CONDITION bornée. 3 exécutions
consécutives à 16/16.

### Non fait
Aucun. Le seul point ambigu (icône du bouton conversation) a été tranché par
l'utilisateur : ne rien changer.
