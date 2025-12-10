# 🔧 Implémentation Backend - Endpoint Affiliation

**Date:** 2025-11-21
**Problème:** L'endpoint `GET /api/users/:userId/affiliate-token` retourne 404
**Impact:** L'affiliation automatique via `/join` ne fonctionne pas

---

## 📋 Endpoint à implémenter

### **Route**
```
GET /api/users/:userId/affiliate-token
```

### **Description**
Récupère le token d'affiliation actif le plus récent d'un utilisateur.
Utilisé pour l'affiliation automatique lorsqu'un nouvel utilisateur s'inscrit via un lien `/join/[linkId]`.

### **Paramètres**
- `userId` (string, required) : ID de l'utilisateur dont on veut le token

### **Réponse**

**Success (200) - Token trouvé :**
```json
{
  "success": true,
  "data": {
    "token": "aff_abc123xyz456"
  }
}
```

**Success (200) - Pas de token :**
```json
{
  "success": true,
  "data": null
}
```

**Erreur (404) - Utilisateur inexistant :**
```json
{
  "success": false,
  "message": "User not found"
}
```

---

## 💻 Implémentation Backend

### **Fichier: `src/users/users.controller.ts`**

```typescript
import { Controller, Get, Param, NotFoundException } from '@nestjs/common';
import { UsersService } from './users.service';
import { AffiliateService } from '../affiliate/affiliate.service';

@Controller('users')
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly affiliateService: AffiliateService,
  ) {}

  /**
   * Récupère le token d'affiliation actif d'un utilisateur
   * Utilisé pour l'affiliation automatique via les liens /join
   *
   * @param userId - ID de l'utilisateur
   * @returns Le token d'affiliation actif ou null
   */
  @Get(':userId/affiliate-token')
  async getUserAffiliateToken(@Param('userId') userId: string) {
    try {
      // Vérifier que l'utilisateur existe
      const user = await this.usersService.findById(userId);
      if (!user) {
        throw new NotFoundException('User not found');
      }

      // Récupérer le dernier token actif de l'utilisateur
      const affiliateToken = await this.affiliateService.getActiveTokenForUser(userId);

      if (!affiliateToken) {
        return {
          success: true,
          data: null,
        };
      }

      return {
        success: true,
        data: {
          token: affiliateToken.token,
        },
      };
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new Error('Failed to fetch affiliate token');
    }
  }
}
```

---

### **Fichier: `src/affiliate/affiliate.service.ts`**

```typescript
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AffiliateToken } from './schemas/affiliate-token.schema';

@Injectable()
export class AffiliateService {
  constructor(
    @InjectModel(AffiliateToken.name)
    private affiliateTokenModel: Model<AffiliateToken>,
  ) {}

  /**
   * Récupère le token d'affiliation actif d'un utilisateur
   *
   * @param userId - ID de l'utilisateur
   * @returns Le token actif le plus récent ou null
   */
  async getActiveTokenForUser(userId: string): Promise<AffiliateToken | null> {
    try {
      const token = await this.affiliateTokenModel
        .findOne({
          userId,
          isActive: true,
          $or: [
            { expiresAt: null }, // Tokens sans expiration
            { expiresAt: { $gt: new Date() } }, // Tokens non expirés
          ],
        })
        .sort({ createdAt: -1 }) // Le plus récent en premier
        .exec();

      return token;
    } catch (error) {
      console.error('[AffiliateService] Error fetching active token:', error);
      return null;
    }
  }
}
```

---

### **Schéma Mongoose (si pas déjà créé): `src/affiliate/schemas/affiliate-token.schema.ts`**

```typescript
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

@Schema({ timestamps: true })
export class AffiliateToken extends Document {
  @Prop({ required: true, unique: true })
  token: string;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: true })
  userId: MongooseSchema.Types.ObjectId;

  @Prop({ default: true })
  isActive: boolean;

  @Prop({ type: Date, default: null })
  expiresAt: Date;

  @Prop({ default: 0 })
  usageCount: number;

  @Prop({ type: Date })
  createdAt: Date;

  @Prop({ type: Date })
  updatedAt: Date;
}

export const AffiliateTokenSchema = SchemaFactory.createForClass(AffiliateToken);
```

---

## 🔧 Configuration du module

### **Fichier: `src/users/users.module.ts`**

```typescript
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { User, UserSchema } from './schemas/user.schema';
import { AffiliateModule } from '../affiliate/affiliate.module'; // Import du module

@Module({
  imports: [
    MongooseModule.forFeature([{ name: User.name, schema: UserSchema }]),
    AffiliateModule, // Ajouter le module d'affiliation
  ],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
```

---

## ✅ Tests

### **Test manuel avec curl**

```bash
# Test avec un userId existant qui a un token d'affiliation
curl https://smpdev02.local:3000/api/users/691f1d8ce1d51a01bcee5f46/affiliate-token

# Réponse attendue (si token existe) :
# {
#   "success": true,
#   "data": {
#     "token": "aff_abc123xyz456"
#   }
# }

# Réponse attendue (si pas de token) :
# {
#   "success": true,
#   "data": null
# }

# Test avec un userId inexistant
curl https://smpdev02.local:3000/api/users/invalid_user_id/affiliate-token

# Réponse attendue :
# {
#   "success": false,
#   "message": "User not found"
# }
```

### **Test automatisé (Jest)**

```typescript
describe('UsersController', () => {
  describe('GET /users/:userId/affiliate-token', () => {
    it('should return active affiliate token', async () => {
      const response = await request(app.getHttpServer())
        .get('/users/userId123/affiliate-token')
        .expect(200);

      expect(response.body).toEqual({
        success: true,
        data: {
          token: expect.stringMatching(/^aff_/),
        },
      });
    });

    it('should return null when user has no active token', async () => {
      const response = await request(app.getHttpServer())
        .get('/users/userWithoutToken/affiliate-token')
        .expect(200);

      expect(response.body).toEqual({
        success: true,
        data: null,
      });
    });

    it('should return 404 when user does not exist', async () => {
      await request(app.getHttpServer())
        .get('/users/nonExistentUser/affiliate-token')
        .expect(404);
    });
  });
});
```

---

## 🔄 Flux complet de l'affiliation

### **Étape 1 : Visite de `/join/[linkId]`**
1. L'utilisateur visite `/join/mshy_abc123...`
2. Le frontend récupère les infos du lien (créateur, conversation, etc.)
3. Le frontend appelle `GET /api/users/{creatorId}/affiliate-token`
4. Si un token est retourné, il est stocké dans `localStorage` et cookie

### **Étape 2 : Inscription**
1. L'utilisateur clique sur "S'inscrire"
2. Le formulaire récupère le token depuis `localStorage`
3. Le token est envoyé dans la requête `POST /api/auth/register`
4. Le backend crée l'utilisateur ET l'association d'affiliation

### **Étape 3 : Association créée**
```json
{
  "affiliateId": "aff_...",
  "referrerId": "creatorUserId",
  "referredUserId": "newUserId",
  "status": "pending",
  "createdAt": "2025-11-21T..."
}
```

---

## 📊 Vérification du fonctionnement

### **Avant l'implémentation :**
```
❌ GET /api/users/:userId/affiliate-token → 404 Not Found
❌ [JOIN] Créateur sans token d'affiliation actif
❌ Pas d'affiliation lors de l'inscription
```

### **Après l'implémentation :**
```
✅ GET /api/users/:userId/affiliate-token → 200 OK { data: { token: "aff_..." } }
✅ [JOIN] Token d'affiliation du créateur stocké: aff_abc123...
✅ [REGISTER_FORM] ✅ Token d'affiliation détecté: aff_abc123...
✅ Association d'affiliation créée dans la base de données
```

---

## 🚀 Déploiement

1. ✅ Implémenter l'endpoint dans `users.controller.ts`
2. ✅ Implémenter la méthode dans `affiliate.service.ts`
3. ✅ Ajouter `AffiliateModule` dans les imports de `UsersModule`
4. ✅ Créer le schéma Mongoose si nécessaire
5. ✅ Tester avec curl
6. ✅ Tester l'inscription via `/join`
7. ✅ Vérifier que l'association est créée dans la DB

---

**Date:** 2025-11-21
**Status:** 📝 **Documentation prête - Implémentation requise côté backend**
**Priorité:** Moyenne (fonctionnalité non bloquante)
