# Hashtags et rendu riche (mentions/liens/hashtags) dans les posts et reels

Date : 2026-08-03
Statut : design validé, prêt pour plan d'implémentation

## Problème

Deux manques distincts, regroupés dans le même chantier car ils convergent sur
le même objectif produit — une caption de post/reel lisible et navigable :

1. **Hashtags** : jamais implémentés. Le design d'origine des posts
   (`docs/plans/2026-03-06-posts-feature-complete-design.md:174`) les notait
   comme `// TODO: Hashtag/mention parsing in content`, jamais repris depuis.
   Aucun modèle, aucune extraction, aucun affichage, nulle part.
2. **Rendu riche existant incomplet** : les mentions (`@username`) sont déjà
   extraites et persistées côté serveur (`MentionService.extractMentions`,
   câblé dans `routes/posts/core.ts:157-166` pour la création ET l'édition —
   `PostMention` fonctionne de bout en bout), et un traçage de lien
   (`/l/<token>`) existe (commit `62b2c803e`). Mais l'affichage côté client
   est incohérent :

   | Surface | État constaté |
   |---|---|
   | iOS — post feed (`FeedPostCard.swift:298`) | `MessageTextRenderer` appelé, mais `mentionColor` jamais passé → mentions en gras+souligné, **sans couleur distincte** |
   | iOS — post détail (`PostDetailView.swift:1174`) | Même défaut que ci-dessus |
   | iOS — reel feed (`ReelFeedCard.swift:250`) | `Text(displayCaption)` **brut** — aucun rendu riche |
   | iOS — reel repost embarqué (`ReelRepostEmbedCell.swift:122`) | `Text(repost.content)` **brut** — aucun rendu riche |
   | Web — post détail (`PostDetail.tsx:193`) | `<p>{post.content}</p>` **brut** — aucun rendu riche |
   | Web — carte post du feed (`PostCard.tsx:231`) | `<p>{content}</p>` **brut** — aucun rendu riche (chemin sans traduction) |
   | Web — reel (`ReelPlayer.tsx:328`) | `<p>{caption}</p>` **brut** — aucun rendu riche |
   | Web — rendu partagé traduction (`TranslationToggle.tsx:127,171`) | `<p>{content}</p>` **brut** — point de passage commun post/commentaire/statut/story, utilisé par `PostDetail.tsx` ET `PostCard.tsx` quand des traductions existent |

   Un renderer riche existe déjà côté web pour les messages de conversation
   (`MarkdownMessage.tsx`) et pour les mentions en commentaire (#2021), mais
   n'est jamais branché sur la caption d'un post.

## Décisions

| Sujet | Décision |
|---|---|
| Scope contenu | POST et REEL uniquement — pas STORY, STATUS, ni les commentaires (qui ont déjà leur propre rendu #2021) |
| Modèle de données hashtag | `Hashtag` + `PostHashtag`, même forme relationnelle que `Mention`/`PostMention` (Approche A retenue sur 3 options) — mais PAS le même comportement à l'édition, voir §2 |
| Rendu | Un seul composant/segment partagé mentions+liens+hashtags par plateforme, pas trois mécanismes séparés |
| Plateformes | Web + iOS. Android hors scope (chantier séparé si besoin) |
| Tendances | Oui — `Hashtag.usageCount`, recompté (jamais incrémenté à l'aveugle) après chaque mutation, même philosophie que `SoundCaptureService.recountSound` |
| Visibilité recherche hashtag | Mêmes règles que le feed existant — jamais d'extension d'audience |
| Rétro-traitement | Aucun — seules les publications futures sont indexées (comme le précédent géo du 2026-08-02) |

## 1. Modèle de données

Dans `packages/shared/prisma/schema.prisma`, à ajouter près de `Mention`
(`:1236`)/`PostMention` (référencé depuis `Post:3011-3012`) :

```prisma
model Hashtag {
  id          String   @id @default(auto()) @map("_id") @db.ObjectId
  /// Normalisé minuscule — clé de correspondance. La casse d'affichage
  /// d'origine vit sur PostHashtag, pas ici (un même tag peut être tapé
  /// "#Paris" et "#paris" par deux auteurs différents).
  tag         String   @unique
  usageCount  Int      @default(0)
  createdAt   DateTime @default(now())
  lastUsedAt  DateTime @default(now())
  postHashtags PostHashtag[]

  @@index([usageCount(sort: Desc)])
}

model PostHashtag {
  id         String   @id @default(auto()) @map("_id") @db.ObjectId
  postId     String   @db.ObjectId
  hashtagId  String   @db.ObjectId
  /// Casse telle que tapée par l'auteur — affichage uniquement.
  display    String
  createdAt  DateTime @default(now())

  post       Post     @relation("PostHashtags", fields: [postId], references: [id], onDelete: Cascade)
  hashtag    Hashtag  @relation(fields: [hashtagId], references: [id], onDelete: Cascade)

  @@unique([postId, hashtagId], name: "post_hashtag_unique")
  @@index([hashtagId])
  @@index([postId])
}
```

Contrainte nommée explicitement (`post_hashtag_unique`), même convention que
`PostMention.@@unique([postId, mentionedUserId], name: "post_user_mention_unique")`
(`:3973`) — ce nom est la clé `where` de l'upsert côté service, pas le nom
auto-généré `postId_hashtagId`.

Sur `Post`, ajouter `postHashtags PostHashtag[] @relation("PostHashtags")`
juste après `postMentions` (`:3012`).

## 2. Extraction serveur (`HashtagService`)

Nouveau service, calqué sur `MentionService` (`services/gateway/src/services/MentionService.ts`) :

- `extractHashtags(content: string): string[]` — regex `#` + 1 à 50
  caractères `[\p{L}\p{N}_]` (Unicode, pas de tiret — convention hashtag,
  différente du tiret autorisé pour les mentions). Frontière gauche : non
  précédé d'un caractère de mot **ni d'un `/`** (évite de capturer un
  fragment d'URL type `exemple.com/#section` comme hashtag — risque absent
  du parseur de mentions, propre aux hashtags).
- Même garde-fous que `MentionService` : `MAX_CONTENT_LENGTH` partagée,
  plafond `MAX_HASHTAGS_PER_POST = 30`, normalisation minuscule pour la
  correspondance, déduplication (`Set`).
- `createPostHashtags(postId, hashtags: {tag, display}[])` — upsert
  `Hashtag` (créer si absent, sinon réutiliser), puis `PostHashtag.upsert`
  par `(postId, hashtagId)` (même raison que l'`upsert` de `SoundUsage` cette
  session : une édition qui republie ne doit jamais être avalée en silence).
  Après écriture, recompte `Hashtag.usageCount` depuis
  `PostHashtag.count({where:{hashtagId}})` — jamais d'incrément relatif.

Câblage dans `routes/posts/core.ts`, aux DEUX points où
`mentionService.extractMentions`/`createPostMentions` sont déjà appelés
(création `:157-166`, édition `:303-309`) : extraction hashtag en parallèle de
l'extraction mention, sur le même `postContent`.

**Divergence assumée vs le pattern mention** : `MentionService.createPostMentions`
(`:980-996`) ne fait qu'ajouter — un `create` avec doublon `P2002` avalé, et
le commentaire de `core.ts:298` l'assume explicitement (« re-fires all;
idempotent via P2002 swallow ») : un mention retirée à l'édition laisse sa
ligne `PostMention` orpheline pour toujours. C'est acceptable pour les
mentions (aucun compteur n'en dépend). **Ce n'est PAS acceptable pour les
hashtags** puisque `Hashtag.usageCount` alimente les tendances — une ligne
`PostHashtag` orpheline gonflerait un compteur qui ne redescend jamais. À
l'édition, diff donc explicitement ancien/nouveau jeu de hashtags : les
hashtags retirés font l'objet d'un `deleteMany` sur `PostHashtag` puis
recompte des `Hashtag` touchés — modèle réel : `SoundCaptureService.dropRemovedUsages`
+ `recountSound` (déjà dans ce gateway), PAS le pattern mention.

## 3. Endpoints

- `GET /api/v1/posts/hashtag/:tag` — paginé, `PostType` filtré à
  `[POST, REEL]`, mêmes règles de visibilité/blocage que le feed existant
  (jamais de fuite au-delà de ce qu'un post `PUBLIC`/`COMMUNITY` autorise
  déjà). Requête : `PostHashtag.findMany({where:{hashtag:{tag: normalized}}})`
  puis enrichissement via le même chemin que le feed (`PostFeedService`).
- `GET /api/v1/hashtags/trending?limit=` — top N par `Hashtag.usageCount`
  décroissant. Pas de fenêtre temporelle en v1 (compteur global, pas
  "tendance sur 24h") — décision assumée pour rester simple, à revisiter si
  le produit le demande plus tard.

## 4. Rendu iOS

- **Fix posts** : passer un `mentionColor` explicite (couleur d'accent du
  thème) aux 2 appels existants de `MessageTextRenderer.render(...)`
  (`FeedPostCard.swift:298`, `PostDetailView.swift:1174`).
- **Nouveau segment hashtag** dans
  `packages/MeeshySDK/Sources/MeeshyUI/Utilities/MessageTextRenderer.swift` :
  même mécanique que `.mentionLink` (`buildText`, `:403-416`) — nouveau cas
  `.hashtagLink(display, url)`, regex alignée sur celle du gateway (SSOT à
  dupliquer consciemment côté Swift, comme `MENTION_HANDLE_CHARS` l'est déjà
  entre `mention-parser.ts` et son miroir Swift). URL construite en
  `https://meeshy.me/hashtag/<tag>` (même convention que `.mentionLink` →
  `https://meeshy.me/u/<username>`, `:342-344` — une vraie URL HTTPS
  universal-link, PAS un schéma custom `meeshy://`), interceptée par le même
  mécanisme de routage interne que les mentions. Nouveau paramètre
  `hashtagColor: Color? = nil`.
- **Fix reels** : remplacer `Text(displayCaption)`
  (`ReelFeedCard.swift:250`) et `Text(repost.content)`
  (`ReelRepostEmbedCell.swift:122`) par `MessageTextRenderer.render(...)`,
  mêmes paramètres que les posts (couleur, accentColor, mentionColor,
  hashtagColor, trackedLinks).
- **Nouvel écran** `HashtagResultsView` — liste/grille posts+reels mélangés
  par récence, poussé au tap sur un hashtag depuis n'importe quelle surface.

## 5. Rendu web

Nouveau composant partagé `PostContentText` (mentions+liens+hashtags,
délibérément plus léger qu'un rendu markdown complet — pas de gras/italique/
listes, juste ce que porte une caption de post).

`TranslationToggle` expose déjà `showContent?: boolean` (défaut `true`) —
« Set false for callers that render the content themselves » — utilisé
par `StoryViewer.tsx:984` exactement pour ce besoin : le contenu est rendu
par l'appelant, `TranslationToggle` ne sert alors que de puce indicateur de
langue. **Aucune modification de `TranslationToggle.tsx` nécessaire** :
`PostDetail.tsx` et `PostCard.tsx` passent `showContent={false}` et rendent
eux-mêmes `<PostContentText>{effectiveContent}</PostContentText>` à côté,
même pattern que `StoryViewer`. 4 sites à câbler :
- `PostDetail.tsx:193` (chemin sans traduction, remplace le `<p>` direct)
  + son appel `TranslationToggle` existant passe à `showContent={false}`
- `PostCard.tsx:231` (idem) + son appel `TranslationToggle` idem
- `ReelPlayer.tsx:328` (pas de `TranslationToggle` sur ce composant
  actuellement — juste remplacer le `<p>` par `PostContentText`)

Réutilise `apps/web/lib/utils/link-parser.ts` pour la détection d'URL ;
nouvelle fonction de détection hashtag/mention alignée sur la même SSOT
regex que `mention-parser.ts` et le service gateway. Nouvelle route
`/hashtag/[tag]` (Next.js) pour la page de résultats.

## 6. Navigation

- Tap `#hashtag` → écran/route de résultats (nouveau, web+iOS).
- Tap `@mention` → profil utilisateur (déjà câblé ; correction de couleur
  sur iOS ; construction complète sur web puisque le rendu web n'existe pas
  du tout aujourd'hui).
- Tap URL → comportement tracké `/l/<token>` existant (déjà bon sur iOS
  posts ; à étendre reels + web via `PostContentText`).

## 7. Erreurs, limites, sécurité

- Hashtag invalide (trop long, caractères hors classe autorisée) → ignoré
  silencieusement à l'extraction, jamais d'erreur bloquant la publication
  (même invariant que `captureSounds`/`extractMentions` : un post publie
  toujours, même si l'enrichissement échoue).
- Plafond `MAX_HASHTAGS_PER_POST = 30` anti-abus (spam de hashtags).
- Les endpoints de recherche/tendance rejettent implicitement tout post hors
  `[POST, REEL]` et hors visibilité autorisée — jamais de passthrough client
  sur `geoPoint`-style bypass.

## 8. Tests

- Gateway : `HashtagService` unitaire (extraction — limites Unicode, plafond,
  exclusion fragment d'URL ; persistance — création, édition avec retrait de
  hashtags, recompte) miroir de `MentionService.test.ts` ; tests de route
  (`posts/core.test.ts` : hashtags forwardés à la création/édition) ; tests
  des 2 nouveaux endpoints.
- iOS : tests du nouveau segment `.hashtagLink` dans `MessageTextRenderer`
  (parsing + rendu) ; non-régression du fix `mentionColor` (couleur
  effectivement appliquée) ; tests de rendu reels (`ReelFeedCard`,
  `ReelRepostEmbedCell` utilisent bien `MessageTextRenderer`).
- Web : tests unitaires `PostContentText` (mentions/liens/hashtags détectés
  et rendus cliquables) ; test de la page `/hashtag/[tag]`.

## Risques

- **Web est quasi vierge sur ce point** : contrairement à iOS qui a déjà
  `MessageTextRenderer` à étendre, `PostContentText` part de zéro (peut
  réutiliser `link-parser.ts` mais pas de composant équivalent à adapter
  directement). Risque de divergence de comportement avec `MarkdownMessage.tsx`
  si le futur composant messages évolue séparément — accepté : les deux
  composants ont des besoins différents (markdown complet vs caption simple),
  une fusion prématurée créerait un couplage inutile.
- **Regex hashtag dupliquée 3x** (gateway TS, `mention-parser.ts`-like SSOT
  partagée si possible, Swift `MessageTextRenderer`, web `PostContentText`) —
  même risque de drift que documenté pour `MENTION_HANDLE_CHARS`. Mitigation :
  commentaire croisé explicite entre les 3 implémentations, comme déjà fait
  pour les mentions.
- **Pas de fenêtre temporelle sur les tendances** (v1) : un hashtag ancien
  très utilisé restera en tête indéfiniment même sans activité récente —
  acceptable pour un premier chantier, à revisiter si besoin produit.
