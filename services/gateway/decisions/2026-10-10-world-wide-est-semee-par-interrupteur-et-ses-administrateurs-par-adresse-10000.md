## World Wide est semée par interrupteur, ses administrateurs sont désignés par adresse, et ses invités ne joignent rien tant que la garde décodante n'est pas livrée (2026-10-10, #10000)

**Décision porteur (milestone « Le monde entier entre dans World Wide depuis meeshy.me »).** La conversation `world` (type `global`, titre « World Wide ») et son lien de partage `mshy_world` existent à chaque déploiement. `meeshy` (« Meeshy Global ») ne change pas.

### Ce qui est retenu

- **Le seed n'écrit que sur `WORLD_SEED_ENABLED=true`** (`InitService.ensureWorldConversation`, dernière étape de `bootstrapDatabase`, hors de la porte `shouldInitialize()`). Toute autre valeur, y compris l'absence, laisse la base intacte. `docker-compose.prod.yml` le transmet à `false` ; staging, dev et local à `true`. Un témoin de composition le garde (`config/world-seed-off-in-production.test.ts`). Écrire en production reste une migration de données : feu vert porteur et sauvegarde vérifiée.
- **Idempotent et convergent.** Une ligne existante n'est jamais réécrite (ni renommage, ni lien rouvert, ni participation réveillée) ; deux démarrages simultanés convergent par relecture sur P2002. Un échec est journalisé et n'arrête pas le démarrage.
- **Les administrateurs sont désignés par ADRESSE, jamais par pseudo** (`services/world/worldReservedMembers.ts`) : `meeshy` par `MEESHY_EMAIL` (BIGBOSS exigé), `admin` par `ADMIN_EMAIL` (ADMIN ou BIGBOSS), le porteur et tout autre par `WORLD_ADMIN_EMAILS`. Un compte inactif, supprimé ou non vérifié est écarté. Le rang ne se pose qu'à la création de la participation : aucune re-promotion. `jcnm` n'est jamais créé par le seed.
- **Les invités de World Wide ne joignent rien**, audio compris, tant que #10001 n'a pas livré la garde décodante (#10029) : `classifyAnonymousAttachment` refuse toute pièce jointe d'un invité dont le lien ouvre `world`, sur REST et sur tus, sans s'appuyer sur les drapeaux du lien ni sur les droits gravés à l'entrée. Le lien est semé `allowAnonymousFiles: false`, `allowAnonymousImages: false`.
- **Pré-vol et retrait.** `scripts/world-seed-preflight.ts` (lecture seule) bloque si `world` ou `mshy_world` existent déjà, si un administrateur désigné est absent ou illégitime, ou si la garde déployée laisse passer l'un de six contenus déguisés. `scripts/world-seed-remove.ts` est à blanc par défaut ; `--close` est réversible ; `--purge` est refusé dès qu'un message existe.

### Ce qui est servi

`GET /api/v1/world` (publique) : `{ identifier, title, shareLinkIdentifier, memberCount, memberCountCapped? }`, contrat `worldEntrySchema` (`@meeshy/shared/types/world`), aucun id, effectif présenté « 199+ » à un lecteur anonyme, 404 `WORLD_UNAVAILABLE` si l'entrée n'est pas ouverte, cache serveur 30 s, `Cache-Control: public, max-age=30, stale-while-revalidate=60`, ETag et 304. La landing lit la clé du lien ici : elle n'est pas écrite en dur dans un client.
