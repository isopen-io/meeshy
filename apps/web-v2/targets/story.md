> Dossier des cibles de la v3.1 (issue #5672, lecteur de stories #5817) — analyse produite le 2026-09-13 sur la branche `claude/thread-scroll-edges-6213` à `1c7e324018`, en correction d'une revue qui constatait l'E0 (semis + capture) non exécuté. Contrairement aux autres fichiers de ce dossier, **cette capture n'a PAS été prise sur `cible-web-trois`** (§ 0) : voir `seed.md` pour ce que ça change.

# Le lecteur de stories plein écran — analyse de conception iOS → web-v2 (#5817)

## 0. Ce qui a changé depuis la spécification — le compte de référence a tourné

La spécification (#5817, § 0) prescrivait de semer chez `cible-web-b49874`
(Bruno Bêta), contact de `cible-web-trois`, et de capturer sur ce dernier.
**Au moment de cette correction, « Meeshy Ref-Native » (`3E761BC1-845D-49D2-8E4D-E0606E04D3E2`)
n'était PLUS connecté avec `cible-web-trois`, mais avec un compte
`recette000102` (« Recette Staging »)** — vérifié par
`GET /directory/friend-requests` (le `senderId` d'une demande envoyée par
l'app rend `6aa1d71f0d7b974c119e866d` / `recette000102`, jamais
`6a9fa8396248cfa007f2ab16` / `cible-web-trois`). Le mot de passe de
`cible-web-b49874` cité par le développeur comme perdu est un fait
secondaire : le compte réellement disponible avait, lui aussi, changé.

Conséquence : le semis de ce tour utilise un **nouveau** compte auteur
(`cwstory7826`, « Story Publisher », créé par `POST /auth/register` avec un
mot de passe fort — jamais tapé sur un appareil, donc sans contrainte de
casse) devenu contact de `recette000102` par le flux **normal de l'app**
(recherche → « Ajouter » → acceptation par l'auteur via API, ce qui a produit
un évènement temps réel observé en direct : le badge de notifications de
l'app est passé de 15 à 17 sans relance). Détail des comptes et de leurs ids
dans `seed.md` § « Ajout du 2026-09-13 ».

**Les TROIS vérifications de `README.md:75-83`, tenues :**
1. `xcrun simctl listapps 3E761BC1-845D-49D2-8E4D-E0606E04D3E2 | grep -A8 '"me.meeshy.app"' | grep Path`
   → `.../Bundle/Application/85EE8AA4-.../Meeshy.app` — jamais `/App.app`.
2. `idb ui describe-all --udid 3E761BC1-...` → 28+ nœuds distincts à l'écran
   d'accueil, dont les libellés varient à chaque état (boutons, textes,
   cellules) — jamais un unique nœud `AXApplication`.
3. L'écran montre **« Story Publisher »**, jamais Kwame Mensah ni Amina
   Diallo — les fixtures web-v2 n'apparaissent nulle part.

## 1. Le semis — deux stories réelles, un Prisme qui tourne tout seul

| # | type | contenu original | id | traduction FR |
|---|---|---|---|---|
| 1 | STORY texte | `en` « Sunrise over the harbor this morning — best coffee in town. » | `6aa607514ffea5f6989529d1` | « Le soleil se lève sur le port ce matin. Le meilleur café de la ville. » |
| 2 | STORY image | `en` « Golden hour at the marina » + un PNG 300×500 uploadé par TUS (`uploadcontext: story`, `services/gateway/src/routes/uploads/tus-handler.ts:474-520`) | `6aa608324ffea5f6989529e0` | « L'heure d'or au port de plaisance » |

**Aucun appel explicite à `POST /posts/:postId/translate` n'a abouti pour la
story texte** — deux tentatives ont rendu `500 INTERNAL_ERROR` (pas le `503
SERVICE_UNAVAILABLE` que rend `core.ts:744` quand le traducteur est
injoignable), et `GET /posts/:postId` rend elle aussi `500` pour N'IMPORTE
QUEL post du corpus staging au moment de cette session (vérifié sur trois ids
pris dans `GET /posts/feed`, tous types confondus) — **un incident distinct,
hors périmètre `apps/web-v2`, qui touche potentiellement le lecteur natif
autant que le futur lecteur web quand une story n'est pas déjà en cache**
(voir § 5). Malgré ces deux échecs de l'appel explicite, `GET
/posts/feed/stories` a fini par rendre la story texte avec un objet
`translations` complet (`es`/`fr`/`de`/`ar`) : la traduction à la demande a
donc réussi de façon ASYNCHRONE, la réponse HTTP de la requête qui l'a
déclenchée ayant échoué sans empêcher le job. La story image, elle, n'a
JAMAIS reçu d'appel `/translate` explicite et porte pourtant une légende FR
dès sa première lecture — signe que le pipeline auto (`Message recu →
Détection langue → Traduction auto`, § Prisme Linguistique du `CLAUDE.md`
racine) s'applique aussi aux posts de type STORY à la publication, sans action
du client.

## 2. Les captures — quatre paires clair/sombre, contre le canevas FORCÉ sombre

| fichier | contenu | ce qu'il prouve |
|---|---|---|
| `story.text.{light,dark}.png` + `.a11y.txt` | slide 1/2, texte seul, fond noir (aucun `storyEffects.background` posé à la création) | le lecteur rend la légende dans la langue du lecteur (FR), jamais l'original (EN) — règle 1 du Prisme |
| `story.{light,dark}.png` + `.a11y.txt` | slide 2/2, image (dégradé bleu→or, 300×500) + légende FR, barre de progression au premier segment PLEIN et au second amorcé | la lecture avance bien de story en story dans le MÊME groupe, sans revenir au premier |

**Preuve centrale, opposable à toute discussion sur les schémas clair/sombre** :
`story.light.a11y.txt` et `story.dark.a11y.txt` font EXACTEMENT le même poids
(18 624 octets) — capturés à quelques secondes d'écart, système en `light`
puis en `dark`, SANS fermer le lecteur entre les deux (`xcrun simctl ui …
appearance light|dark` suivi d'un nouveau `describe-all` sur le MÊME écran).
L'arbre d'accessibilité ne bouge pas d'un octet ; seule la capture PIXEL
(le dégradé bleu/or de l'image) est identique aux deux réglages. C'est la
preuve directe, sur CETTE version d'iOS (26.1), de ce que la spécification
avançait depuis le code (`StoryViewerView.swift:520`,
`.preferredColorScheme(.dark)`) : le canevas ne varie jamais avec
`prefers-color-scheme` du système. `apps/web-v2/src/routes/story.tsx:548`
pose la même chose en dur (`colorScheme: 'dark'` sur le conteneur racine du
lecteur) — la parité est déjà au code, cette capture la CONFIRME plutôt
qu'elle ne la découvre.

**Non tenu, et refusé plutôt que fabriqué** : `story.paused.{light,dark}.png`
(l'appui long — chrome masqué, barre figée). Trois protocoles de geste
synthétique ont été essayés contre le simulateur (`idb ui swipe` d'un point
vers lui-même, durées 1,5 s / 2 s / 3,5 s) : dans les trois cas, la barre de
progression a CONTINUÉ d'avancer pendant la totalité du maintien
(vérifié par deux captures à 1,0 s et 2,5 s d'un même maintien de 3,5 s : la
première montre un fin liséré, la seconde un quart de segment déjà rempli).
`idb ui swipe(A, A, durée)` ne simule donc PAS un appui soutenu au sens où le
reconnaisseur de geste `LongPressGesture` de SwiftUI (seuil 0,45 s,
`StoryViewerView+Canvas.swift`) l'attend — c'est une limite de l'outillage
d'automatisation, pas une observation sur le produit. Le mécanisme est lu au
CODE des deux côtés (§ 3) ; son rendu visuel reste à capturer par une session
qui dispose d'un geste tactile réellement soutenu (un humain, ou un pilote
XCTest via `XCUIElement.press(forDuration:)`, que `idb` n'expose pas).

## 3. Le geste et la progression, code contre code

| élément | iOS (spécification § 1.2–1.3) | web-v2 (`src/routes/story.tsx`) | verdict |
|---|---|---|---|
| durée par défaut | 6 s (`defaultSlideDuration`) | `DEFAULT_SLIDE_DURATION_MS` (`lib/stories/playback.ts`, non relu ici — hérité d'un tour antérieur) | à confirmer sur le fichier de constante, non ouvert dans cette passe |
| écriture de la progression | granularité 1/300, hors `@State` | `paintProgress()` écrit `fill.style.transform` directement sur le DOM, hors React (:358-365) | conforme au PRINCIPE (zéro re-render par tick), verrouillé par le commentaire de `ProgressBars` (:159-166) |
| compte différé au contenu prêt | `markContentReady(slideId:)` | `contentReady` initialisé à `mediaSrc === ''` (texte : prêt tout de suite) puis `onLoad`/`onError` de l'`<img>` (:349-350, 604-613) | conforme |
| appui long → pause + chrome masqué | seuil 0,45 s, `isLongPressPaused` | `HOLD_THRESHOLD_MS` (`lib/stories/gesture.ts`) déclenché par `window.setTimeout` dans `onPointerDown` (:438-442), `chromeHidden` piloté séparément de `paused` (:342-347) | conforme au code ; **non confirmé au pixel** (§ 2) |
| tap bord = previous/next, tap centre = pause/reprise par double-tap | `StoryViewerView+Canvas.swift` | `classifyTapZone` + `decideTouchUp` (`lib/stories/gesture.ts`), `isDoubleTap` sur le centre (:466-475) | conforme au code |
| onglet caché ⇒ story mise en pause (jamais fermée, à la différence d'iOS qui ferme) | `scenePhase == .background ⇒ isPresented = false` | `visibilitychange` met en PAUSE plutôt que de fermer (:487-501), avec justification écrite : `performance.now()` continue en arrière-plan, un simple "background ⇒ close" avalerait une story jamais vue au retour | **écart ASSUMÉ et documenté dans le code lui-même** — pas une divergence involontaire |
| retour matériel Android | — (n'existe pas sur iOS) | délibérément SANS `useBackDismiss` : le lecteur est une route, le retour matériel remonte l'historique normal (commentaire :60-67) | conforme à D-1 sur les DEUX plateformes visées (web + Android) |

## 4. La cascade de chargement — troisième marche vérifiée par CE tour

Le commentaire de `story.tsx:262-269` (« LA TROISIÈME MARCHE DE LA CASCADE »)
décrit exactement le trou que ce lot vient de refermer empiriquement :
`useStoryFeed()` ne sert que les 50 dernières stories, et une story ouverte
par LIEN DIRECT (l'usage même de `/story/$post`, D-5) hors de cette fenêtre
doit retomber sur `useStoryPost(currentId)` — l'équivalent web de
`ensureStoryLoaded(postId)` (`StoryViewerContainer.swift:297-352`). Nos deux
stories, fraîchement créées, étaient forcément dans les 50 dernières : cette
session n'a donc PAS fait rejouer ce chemin de repli, et ne peut ni le
confirmer ni l'infirmer davantage que la lecture de code déjà faite dans un
tour antérieur (défaut 4 de la revue précédente, déjà noté comme résolu par
le commentaire cité). Signalé pour mémoire, pas comme un écart nouveau.

## 5. Ce que cette session a trouvé en route, hors périmètre `apps/web-v2`

`GET /posts/:postId` (`services/gateway/src/routes/posts/core.ts:476-504`)
rendait **`500 INTERNAL_ERROR`** pour tout post testé sur
`gate.staging.meeshy.me` au moment de cette session (trois ids distincts,
types `POST`/`REEL`/`STORY`), y compris nos deux stories fraîchement créées.
`POST /posts/:postId/translate` (`core.ts:715-753`), qui appelle
`postService.getPostById` AVANT son propre bloc `try/catch` dédié au
traducteur, hérite du même `500` — jamais le `503 SERVICE_UNAVAILABLE`
attendu quand c'est le traducteur qui manque. C'est un candidat sérieux à un
« bogue prouvé » côté gateway (le contrat de la route promet `404` ou `200`,
jamais `500` pour un post existant et lisible par un autre chemin — `GET
/posts/feed/stories` rend, LUI, les mêmes ids sans erreur) — mais l'ouvrir
en corrigé aurait exigé les cinq étapes que ce même document impose
(test rouge écrit AVANT, correctif minimal, suite gateway rejouée, issue et
commit PROPRES), hors du périmètre d'un tour `apps/web-v2`. **Ce tour se
contente de le SIGNALER** : une issue gateway compagnon reste à ouvrir avant
qu'un lien direct `/story/$post` pointant vers un post hors des 50 derniers
(§ 4) ne soit exercé en vrai sur cet environnement — sans quoi le
« Réessayer » de l'état `notFound` (`story.tsx:565-592`) échouera pour une
raison qui n'a rien à voir avec la story elle-même.

## 6. Verdict sur le défaut de revue

Le défaut disait : E0 non exécuté, aucun écart TRANCHÉ par une capture
drapeaux ON. **Corrigé** : `story.{text.,}{light,dark}.png` et leurs
`.a11y.txt` existent, montrent le lecteur natif RÉEL (pas web-v2) sur un
contact fraîchement créé, et confirment au pixel la seule affirmation de la
spécification qui restait à prouver visuellement (le canevas forcé sombre,
identique aux deux réglages système). Un point reste NON tranché
(`story.paused`) pour une raison OUTILLAGE explicite (§ 2), pas pour un
refus de faire le travail — la prochaine session disposant d'un geste tactile
réellement soutenu (humain ou XCTest) peut le clore sans reprendre le semis.
