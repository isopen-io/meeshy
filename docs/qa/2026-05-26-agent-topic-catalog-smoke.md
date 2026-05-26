# QA Smoke — Agent Topic Catalog (2026-05-26)

**Spec :** `docs/superpowers/specs/2026-05-26-agent-topic-catalog-design.md`
**Plan :** `docs/superpowers/plans/2026-05-26-agent-topic-catalog-plan.md`
**Commits :** `b26a9d5f6` → `621c91769` (15 commits sur `main`)

## Pré-déploiement

- [ ] Migration Prisma déployée (`pnpm --filter=@meeshy/shared prisma migrate deploy` sur prod)
- [ ] Agent service redéployé (image rebuild avec topics/ + cron + server.ts wiring)
- [ ] Gateway service redéployé (image rebuild avec routes admin + agent-topics.ts)
- [ ] Frontend web redéployé (image rebuild avec AgentTopicsTab + AgentConfigDialog modif)

## Boot agent (post-deploy)

- [ ] Logs agent au boot mentionnent `[TopicSeed] Inserted 13 topics from initial-topics.ts` (premier deploy) ou `[TopicSeed] Catalogue non vide (13 entries), seed skipped` (re-deploy)
- [ ] MongoDB : `db.agentTopicCatalog.count() === 13` après premier deploy
- [ ] MongoDB : indexes `[isActive]` sur `agentTopicCatalog`
- [ ] MongoDB : indexes `[conversationId, topicId, usedAt]`, `[usedAt]` sur `agentTopicUsageLog`
- [ ] Logs agent : `[TopicUsageCleanup] Deleted 0 logs older than 30d` (premier run au boot)

## Admin UI : CRUD catalogue

- [ ] Login admin (BIGBOSS ou ADMIN), naviguer vers `/admin/agent`
- [ ] Onglet "Topics" visible (icône Tag) entre "Archétypes" et "Live"
- [ ] La liste affiche les 13 topics seedés (tous actifs avec ✓ vert)
- [ ] Cliquer "+ Nouveau topic", remplir :
  - slug = `astronomy`
  - label = `Astronomie`
  - patterns = `\bastronomy\b` + `\bspace\b`
  - instruction = "Lance un nouveau sujet sur {{label}} (mission spatiale, découverte récente, fusion ITER)…"
  - searchHint = `astronomy news this week`
  - cooldown = 60 min
  - actif = oui
  - Sauvegarder → le nouveau topic apparaît dans la liste
- [ ] Cliquer "Éditer" sur `astronomy`, modifier le label → save → label change dans la liste
- [ ] Cliquer "Tester regex" dans le modal édition : coller "astronomy is fascinating, space too" → matches count > 0 par pattern
- [ ] Cliquer EyeOff (désactiver) sur `politics` → ligne passe à ✗ orange, reste visible
- [ ] Cliquer Trash (supprimer) sur `astronomy` → confirm dialog → disparaît de la liste

## Admin UI : blacklist per-conv

- [ ] Ouvrir AgentConfigDialog d'une conversation depuis l'onglet Conversations
- [ ] La section "Topics éligibles sur cette conversation" affiche tous les topics actifs cochés par défaut
- [ ] Compteur : "Tous les N topics actifs sont éligibles."
- [ ] Décocher 2 topics (ex: `politics`, `gaming`) → compteur passe à "N-2 actifs sur N (2 exclus)"
- [ ] Sauvegarder → rouvrir la dialog → ces 2 topics sont toujours décochés
- [ ] MongoDB : `db.agentConfig.findOne({...}).freshTopicBlockedSlugs === ["politics", "gaming"]`

## Strategist : fonctionnement runtime

- [ ] Sur une conversation test, set `freshTopicProbability = 1.0` pour forcer la provocation
- [ ] Trigger un scan agent
- [ ] Logs agent : `[Strategist] Topic provocation TRIGGERED (slug=<X>, searchHint="...")` avec X dans le catalogue actif
- [ ] MongoDB : `db.agentTopicUsageLog.findOne({conversationId, topicId})` insert pour ce scan
- [ ] Trigger un 2e scan sur la même conv immédiatement
- [ ] Le topic X **NE PEUT PAS** être re-pioché (cooldown actif), un autre slug est utilisé OU logs disent "skip" si tous en cooldown
- [ ] Hack : `db.agentTopicUsageLog.updateOne({...}, { $set: { usedAt: new Date(Date.now() - 2 * 60 * 60 * 1000) } })` pour simuler le passage du cooldown
- [ ] Trigger un 3e scan → topic X peut être re-pioché

## Blacklist runtime

- [ ] Sur la conv ayant `politics` + `gaming` blacklistés (du test précédent)
- [ ] Trigger 10 scans avec `freshTopicProbability = 1.0`
- [ ] Aucun log ne mentionne `slug=politics` ou `slug=gaming` (vérifier via `docker logs meeshy-agent | grep "Topic provocation TRIGGERED"`)

## Invalidation cross-instance

- [ ] Avec 2+ instances agent qui tournent (`docker compose up -d --scale agent=2`)
- [ ] Admin modifie un topic via UI (ex: cooldown 60 → 120 min)
- [ ] Les 2 instances reçoivent l'invalidation en < 5s : logs `[TopicCatalog] Cache invalidated via pub/sub`
- [ ] Prochain scan utilise la valeur 120 min (`db.agentTopicUsageLog` confirme le nouveau cooldown au prochain trigger)

## Cron cleanup

- [ ] Injecter un AgentTopicUsageLog avec `usedAt = now - 31 days` :
  ```js
  db.agentTopicUsageLog.insertOne({
    topicId: <ObjectId d'un topic>, conversationId: <ObjectId d'une conv>,
    usedAt: new Date(Date.now() - 31 * 24 * 60 * 60 * 1000)
  })
  ```
- [ ] Soit attendre 24h (le cron tourne au boot puis toutes les 24h), soit redéployer pour trigger immédiat
- [ ] Logs : `[TopicUsageCleanup] Deleted 1 logs older than 30d`
- [ ] Les logs récents (< 30j) restent intacts

## Diagnostics

Si un point fail :
1. Logs agent : `docker logs meeshy-agent | grep -iE "topic|catalog|strategist"`
2. Cache Redis : `docker exec meeshy-local-redis redis-cli GET agent:topics:catalog:active | jq`
3. MongoDB count : `docker exec meeshy-database mongosh meeshy --eval "db.agentTopicCatalog.find().count()"`
4. API directe : `curl https://gate.meeshy.me/api/v1/admin/agent/topics -H "Authorization: Bearer $TOKEN"`
