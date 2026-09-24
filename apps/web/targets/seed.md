> Données SEMÉES sur STAGING pour les captures (issue #5672) — comptes jetables, jamais la production. Les mots de passe sont hors dépôt (`.cache/web-v2-workflow/captures/signup-creds.txt`, non versionné).

# Données semées sur STAGING — cibles v3.1 (drapeaux bêta ON)

Date : 2026-09-08 · API `https://gate.staging.meeshy.me/api/v1` · **staging uniquement, jamais la production.**

## Comptes

| rôle | username | e-mail | id |
|---|---|---|---|
| A (celui de l'app iOS) | `cible-web-trois` | `webv3.cible.1788848176@meeshy-test.example.com` | `6a9fa8396248cfa007f2ab16` |
| B (jetable, créé ce run) | `cible-web-b49874` | `webv3.cible.b.1788849874@meeshy-test.example.com` | `6a9faed26248cfa007f2b0ee` |

B créé par `POST /auth/register` (`firstName: Bruno`, `lastName: Bêta`, `systemLanguage: fr`).

## Conversations créées (toutes par A, `POST /conversations`, B en `participantIds`)

| # | titre | type | id | messages | état pour A |
|---|---|---|---|---|
| 1 | Équipe Produit | group | `6a9faee76248cfa007f2b0fb` | A×1 puis B×3 | non-lus (3) |
| 2 | Voyage Lisbonne | group | `6a9faee86248cfa007f2b0ff` | B×2 | non-lus (2) · **ÉPINGLÉE** |
| 3 | Design Système | group | `6a9faee86248cfa007f2b103` | B×1 puis A×1 | lu (A a écrit en dernier) |
| 4 | Famille Bêta | group | `6a9faee86248cfa007f2b107` | B×1 | non-lu (1) |
| 5 | Veille Tech | group | `6a9faee96248cfa007f2b10b` | B×3 | non-lus (3) · **EN SOURDINE** |
| 6 | Sport du midi | group | `6a9faee96248cfa007f2b10f` | A×1 | lu |
| 7 | (directe A↔B) | direct | `` | A×1 puis B×2 | non-lus (2) |

Préexistante, non touchée : **Meeshy Global** (199+ membres), la conversation globale que `/auth/register` rattache à tout compte.

## Préférences posées par A

- `PUT /user-preferences/conversations/6a9faee86248cfa007f2b0ff` → `{"isPinned": true}` → `success:true, isPinned:true`
- `PUT /user-preferences/conversations/6a9faee96248cfa007f2b10b` → `{"isMuted": true}` → `success:true, isMuted:true`

Ces deux préférences produisent, côté Lentille, la section **ÉPINGLÉES** (`LentilleSectionResolver` : `pinned → live → catégories → today → …`) et le marqueur de sourdine sur la rangée.

## Ce que l'API a refusé

Rien. Toutes les créations, tous les envois et les deux préférences ont rendu `success: true`.

---

## Ajout du 2026-09-08 09:00 — le salon à cinq membres (directive « Résumé et Rivière entrent au périmètre »)

La Rivière exige `activeParticipantCount >= 5` (`ReadingModeOrchestrator.riverEligibilityThreshold`), et
`ConversationView.swift:569` alimente ce compteur par `conversation.memberCount`. Aucune des sept
conversations ci-dessus n'y arrivait (2 membres) : « Rivière » était GRISÉE dans la feuille des modes.
Trois comptes de plus ont donc été créés, et un salon à cinq membres avec eux.

| rôle | username | e-mail | id |
|---|---|---|---|
| riv1 | `cible-web-riv1` | `webv3.cible.riv1@meeshy-test.example.com` | `6a9fb2c36248cfa007f2b184` |
| riv2 | `cible-web-riv2` | `webv3.cible.riv2@meeshy-test.example.com` | `6a9fb2d16248cfa007f2b18c` |
| riv3 | `cible-web-riv3` | `webv3.cible.riv3@meeshy-test.example.com` | `6a9fb2d56248cfa007f2b192` |

Même mot de passe que A (hors dépôt : `.cache/web-v2-workflow/captures/signup-creds.txt`), `systemLanguage: fr`.

| conversation | type | id | membres | messages |
|---|---|---|---|
| **Salon Rivière** | group | `6a9fb2ec6248cfa007f2b198` | A + B + riv1 + riv2 + riv3 = **5** | **40**, alternés A/B, tous `fr` |

`GET /conversations/6a9fb2ec6248cfa007f2b198` rend `memberCount: 5, participants: 5` — la Rivière y est ÉLIGIBLE et
sélectionnable, et les 40 messages donnent au fil de quoi défiler (indispensable à la scène Focal et au
révélé des heures, qui ne se déclenchent qu'au défilement soutenu).

**Effet de bord observé, et utile** : à la première ouverture, l'orchestrateur a élu **Résumé**
tout seul (`AUTO Résumé`, > 25 non-lus) — c'est la décision automatique que la consigne demandait de
noter, capturée telle quelle dans `thread.summary.dark.png`.

### Ce que l'API a refusé

- `POST /auth/register` en rafale : **`RATE_LIMIT_EXCEEDED`** au 4e compte d'affilée (riv4 jamais créé —
  inutile, 5 membres suffisent). Les inscriptions passent une par une avec ~2 s d'écart.
- `POST /auth/login` immédiatement après une inscription rend un corps sans `data.token` (même limite).
  Les ids manquants ont été récupérés par `GET /users/search?q=cible-web-riv`, qui les sert sans souci.

---

## Ajout du 2026-09-13 — le compte réellement connecté à « Meeshy Ref-Native » a changé (#5817, E0 stories)

**Constat, mesuré avant tout semis** : `3E761BC1-845D-49D2-8E4D-E0606E04D3E2` n'était PLUS connecté
avec `cible-web-trois` mais avec un compte `recette000102` (« Recette Staging ») — le simulateur
partagé a servi d'autres sessions entre-temps et sa session a tourné. Détail complet, verdict et
preuve dans `story.md` § 0. **Ce fichier note les comptes créés pour ce tour ; `story.md` porte le
raisonnement.**

| rôle | username | e-mail | id |
|---|---|---|---|
| auteur (jetable, créé ce run) | `cwstory7826` | `webv3.story.7826@meeshy-test.example.com` | `6aa607414ffea5f6989529bf` |

Mot de passe fort généré pour cette session, **jamais tapé sur un appareil** (créé et utilisé
uniquement par API — `curl`) : hors dépôt, non nécessaire à retrouver puisqu'aucune capture future
n'a besoin de se reconnecter EN TANT QUE lui (il n'est que l'AUTEUR des stories, jamais le compte
depuis lequel on capture).

### Devenu contact de `recette000102` (le compte réellement connecté sur Ref-Native)

Amitié établie en DEUX étapes délibérément asymétriques :
1. `cwstory7826` → `recette000102` par `POST /directory/friend-requests` (API), acceptée par
   `recette000102` via son propre jeton (API) — un premier aller-retour purement serveur, qui n'a
   PRODUIT AUCUN effet visible côté app (l'app avait déjà mis en cache son état « aucun contact »
   avant cette écriture).
2. `recette000102` → `cwstory7826`, cette fois **depuis l'app elle-même** (recherche
   `@cwstory7826` dans Découvrir → bouton « Ajouter », `idb ui tap`), acceptée par `cwstory7826` via
   API. Cette seconde acceptation a produit un événement temps réel VISIBLE dans l'app déjà ouverte :
   le badge de notifications de l'icône de profil est passé de **15 à 17** sans aucune relance, et
   le rail de stories du Feed a fait apparaître l'anneau « Story Publisher » à la volée.

**Leçon opérationnelle** : une amitié pour une capture de simulateur doit naître d'un geste posé
DANS l'app connectée (au moins pour son moitié réceptrice), pas seulement d'un appel API — sans
quoi le cache local de l'app ne le sait jamais et rien ne s'affiche, quel que soit l'état réel du
serveur (vérifié : `GET /posts/feed/stories` rendait déjà la story visible à `recette000102` bien
AVANT que l'app ne montre quoi que ce soit).

### Stories publiées par `cwstory7826` (visibilité `FRIENDS`, expiration 20 h)

| # | type | id | contenu original | traduction FR observée |
|---|---|---|---|---|
| 1 | STORY texte | `6aa607514ffea5f6989529d1` | `en` « Sunrise over the harbor this morning — best coffee in town. » | « Le soleil se lève sur le port ce matin. Le meilleur café de la ville. » |
| 2 | STORY image (PNG 300×500, dégradé bleu→or, uploadé par TUS `uploadcontext: story`) | `6aa608324ffea5f6989529e0` | `en` « Golden hour at the marina » | « L'heure d'or au port de plaisance » |

### Ce que l'API a refusé, cette fois

- `POST /posts/:postId/translate` sur la story texte : **`500 INTERNAL_ERROR`** à deux reprises
  (jamais le `503 SERVICE_UNAVAILABLE` attendu quand le traducteur manque). La traduction a
  pourtant fini par apparaître (asynchrone, job détaché de la requête HTTP qui l'a déclenchée) —
  voir `story.md` § 1 et § 5 pour le candidat de bogue gateway que ça soulève.
- `GET /posts/:postId` : **`500 INTERNAL_ERROR`** pour tout post testé sur l'environnement au
  moment de cette session, y compris nos deux stories fraîches — incident hors périmètre
  `apps/web-v2`, détaillé et laissé en l'état (aucun correctif serveur sans les cinq étapes du
  protocole « bogue prouvé ») dans `story.md` § 5.
