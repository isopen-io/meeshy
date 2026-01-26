# Scripts de Migration Meeshy

## Vue d'ensemble

Les scripts de migration permettent de copier les données de production vers staging et de basculer staging vers production.

## Collections MongoDB

### Collections automatiquement migrées

Toutes les collections MongoDB sont automatiquement copiées via `mongodump` et `mongorestore` :

- **User** - Utilisateurs
- **Message** - Messages
- **Conversation** - Conversations
- **Community** - Communautés
- **UserConversationCategory** - Catégories de conversations définies par l'utilisateur
- **UserConversationPreferences** - Préférences utilisateur par conversation
- Et toutes les autres collections de la base `meeshy`

### Collections avec mapping Prisma

Prisma utilise automatiquement les noms de collections MongoDB suivants :

| Modèle Prisma | Collection MongoDB |
|---------------|-------------------|
| `UserConversationCategory` | `user_conversation_categories` |
| `UserConversationPreferences` | `user_conversation_preferences` |

**Note:** Les directives `@@map()` ne sont PAS nécessaires dans le schéma Prisma car MongoDB utilise automatiquement le snake_case pour les noms de collections.

## Scripts disponibles

### 1. migrate-to-staging.sh

Migre les données de production vers staging.

**Étapes :**
1. Backup production via `mongodump`
2. Restauration dans staging via `mongorestore --drop`
3. Vérification des données (incluant UserConversation*)
4. Migration Prisma (si nécessaire)
5. Validation post-migration
6. Redémarrage des services

**Usage :**
```bash
./infrastructure/scripts/migrate-to-staging.sh
```

**Vérifications incluses :**
- Users
- Messages
- Communities
- Conversations
- **User Conversation Categories**
- **User Conversation Preferences**

### 2. validate-staging.sh

Valide que l'environnement staging fonctionne correctement.

**Vérifications :**
- Services Docker en cours d'exécution
- Health endpoints (Gateway, ML, Frontend)
- Comptage des documents MongoDB via Prisma
- **Validation UserConversationCategory**
- **Validation UserConversationPreferences**

**Usage :**
```bash
./infrastructure/scripts/validate-staging.sh
```

### 3. switch-to-production.sh

Bascule staging vers production avec rollback automatique en cas d'échec.

**Précautions :**
- Backup automatique de production
- Tests de validation avant switch
- Rollback automatique si échec
- Switch DNS via docker compose

## Ajout de nouvelles collections

Si vous ajoutez une nouvelle collection MongoDB à vérifier dans les scripts :

1. **migrate-to-staging.sh** - Ajouter le comptage après restauration :
```bash
NEW_COLLECTION_COUNT=$(ssh $REMOTE_HOST "docker exec meeshy-database-staging mongosh meeshy \
  --quiet --eval 'db.new_collection.countDocuments()'")

echo "   New Collection: $NEW_COLLECTION_COUNT"
```

2. **validate-staging.sh** - Ajouter la vérification Prisma :
```bash
NEW_COUNT=$(ssh $REMOTE_HOST "cd $STAGING_DIR && docker compose exec -T gateway \
  node -e \"const { PrismaClient } = require('@prisma/client'); \
  const prisma = new PrismaClient(); \
  prisma.newModel.count().then(c => console.log(c)).finally(() => prisma.\$disconnect())\" 2>/dev/null" || echo "0")

echo "      - New Model: $NEW_COUNT"

if [ "$NEW_COUNT" -gt 0 ]; then
  test_pass "New Model > 0"
else
  test_warn "Aucun document trouvé (peut être normal)"
fi
```

## Notes importantes

- `mongodump` copie **toutes** les collections automatiquement
- Pas besoin de lister explicitement chaque collection
- Les scripts de validation servent à confirmer que les données sont bien présentes
- Les `@@map()` dans Prisma ne sont pas nécessaires pour les conventions snake_case de MongoDB
