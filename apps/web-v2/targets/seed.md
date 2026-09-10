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
