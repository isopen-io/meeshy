# Désactivation Temporaire de la Validation du Schéma API

**Date**: 2026-01-20
**Statut**: ✅ **RÉSOLU - SCHÉMA RÉACTIVÉ**
**Criticité**: 🟢 **PROBLÈME RÉSOLU**

---

## ⚠️ MISE À JOUR IMPORTANTE

Ce document est **OBSOLÈTE**. Le problème a été résolu et le schéma a été réactivé avec succès.

**Voir le document de résolution** : `SCHEMA-VALIDATION-REACTIVATED.md`

**Résumé de la résolution** :
- ✅ Migration DB complétée (120 segments corrigés)
- ✅ Tous les `voiceSimilarityScore: false` → `null`
- ✅ Schéma de validation réactivé
- ✅ Tests de sérialisation réussis (100%)
- ✅ Service redémarré et opérationnel

---

## Document Historique (pour référence)

**Date de désactivation**: 2026-01-20
**Date de réactivation**: 2026-01-20
**Durée de désactivation**: ~4 heures

---

## 🚨 Situation Actuelle

La validation du schéma API dans la route `GET /conversations/:id/messages` a été **temporairement désactivée** car elle filtrait incorrectement les segments de transcription, causant la perte de données critiques.

### Fichier Modifié

**`services/gateway/src/routes/conversations/messages.ts`**
- **Ligne 150-186** : Bloc `response` commenté

```typescript
response: {
  // TEMPORAIREMENT DÉSACTIVÉ: La validation du schéma filtre incorrectement les segments
  // TODO: Réactiver après avoir résolu le problème de sérialisation des segments
  // Voir: FIX-SEGMENTS-API-SCHEMA-VALIDATION.md
  /* 200: { ... }, */
  401: errorResponseSchema,
  403: errorResponseSchema,
  500: errorResponseSchema
}
```

---

## 🐛 Problème Non Résolu

Malgré les corrections appliquées dans :
1. ✅ `packages/shared/types/api-schemas.ts` (ajout champ `language`)
2. ✅ `services/translator/src/services/audio_pipeline/transcription_stage.py` (validation type)
3. ✅ `services/translator/src/services/zmq_audio_handler.py` (sérialisation segments)

**Le problème persiste** : Fastify continue de filtrer les champs des segments lorsque le schéma de validation est activé.

### Symptômes

**Avec schéma désactivé** (ACTUEL) :
```json
{
  "transcription": {
    "segments": [
      {
        "text": "Too much,",
        "startMs": 460,
        "endMs": 1160,
        "speakerId": null,
        "voiceSimilarityScore": false,
        "confidence": 0.739,
        "language": "en"
      }
    ]
  }
}
```

**Avec schéma activé** (PROBLÉMATIQUE) :
```json
{
  "transcription": {
    "segments": [
      {
        "text": "Too much,",
        "confidence": 0.739
      }
      // ❌ Tous les autres champs perdus
    ]
  }
}
```

---

## 🔍 Causes Potentielles à Investiguer

### 1. Validation AJV Stricte

Fastify utilise `ajv` avec `fast-json-stringify`. Il se peut que :
- La configuration AJV soit trop stricte
- Le schéma ait des contraintes implicites non détectées
- Les options `removeAdditional` ou `coerceTypes` soient actives

**À vérifier** :
```typescript
// services/gateway/src/server.ts
ajv: {
  customOptions: {
    strict: 'log',
    keywords: ['example'],
    // Vérifier si d'autres options sont présentes
  }
}
```

### 2. Schéma `additionalProperties`

Le schéma pourrait avoir `additionalProperties: false` implicite qui bloque les champs non listés.

**À vérifier** :
```typescript
// api-schemas.ts - Segment schema
items: {
  type: 'object',
  additionalProperties: false,  // ← Pourrait causer le problème
  properties: { ... }
}
```

### 3. Ordre de Validation

Fastify pourrait valider avant que `cleanAttachmentsForApi()` ne nettoie les données.

**À vérifier** :
- Ordre d'exécution : validation → nettoyage → réponse
- Position de `cleanAttachmentsForApi()` dans le flux

### 4. Champs `required`

Le schéma pourrait définir des champs comme `required` qui ne sont pas toujours présents.

**À vérifier** :
```typescript
// api-schemas.ts
items: {
  type: 'object',
  required: ['text', 'startMs', 'endMs'],  // ← Peut rejeter si manquant
  properties: { ... }
}
```

### 5. Type Mismatch

Même après correction, il pourrait rester des incohérences de types :
- `voiceSimilarityScore: false` dans la DB (booléen au lieu de null)
- `speakerId: undefined` au lieu de `null`
- Types numériques stockés comme strings

---

## 📋 Plan de Résolution

### Phase 1: Investigation Approfondie (PRIORITAIRE)

1. **Activer les logs AJV détaillés**
   ```typescript
   ajv: {
     customOptions: {
       strict: 'log',
       logger: console,  // ← Ajouter pour voir les erreurs de validation
       verbose: true
     }
   }
   ```

2. **Capturer les erreurs de validation**
   ```typescript
   fastify.setErrorHandler((error, request, reply) => {
     if (error.validation) {
       console.log('VALIDATION ERROR:', JSON.stringify(error.validation, null, 2));
     }
     reply.send(error);
   });
   ```

3. **Tester avec un segment minimal**
   ```typescript
   // Test si le schéma accepte le strict minimum
   {
     "text": "test",
     "confidence": 0.9
   }
   ```

4. **Ajouter `additionalProperties: true`**
   ```typescript
   // Dans api-schemas.ts pour les segments
   items: {
     type: 'object',
     additionalProperties: true,  // ← Permettre champs supplémentaires
     properties: { ... }
   }
   ```

### Phase 2: Nettoyage des Données Existantes

1. **Script de migration DB**
   - Convertir tous les `voiceSimilarityScore: false` → `null`
   - Nettoyer les types incorrects
   - S'assurer que tous les champs sont cohérents

2. **Validation à l'écriture**
   - Ajouter validation stricte lors de la sauvegarde en DB
   - Garantir que seuls les types corrects sont stockés

### Phase 3: Tests Exhaustifs

1. **Tests unitaires pour la sérialisation**
   ```python
   def test_segment_serialization():
       seg = TranscriptionSegment(...)
       serialized = serialize_segment(seg)
       assert isinstance(serialized['voiceSimilarityScore'], (int, float, type(None)))
   ```

2. **Tests d'intégration avec schéma activé**
   ```typescript
   test('segments should pass validation', async () => {
     const response = await request(app)
       .get('/api/v1/conversations/xxx/messages')
       .expect(200);

     expect(response.body.data[0].attachments[0].transcription.segments).toBeDefined();
     expect(response.body.data[0].attachments[0].transcription.segments[0].startMs).toBeDefined();
   });
   ```

### Phase 4: Réactivation Progressive

1. **Réactiver sur un environnement de test**
2. **Monitorer les erreurs de validation**
3. **Valider avec des données réelles**
4. **Déployer en production si OK**

---

## ⚠️ Risques de la Désactivation

### Sécurité
- ❌ **Aucune validation des données** retournées par l'API
- ❌ Possibilité de retourner des champs non prévus
- ❌ Risque de leak de données sensibles si erreur de code

### Qualité
- ❌ Pas de garantie sur le format des réponses
- ❌ Le frontend pourrait recevoir des données inattendues
- ❌ Difficile de détecter les régressions

### Documentation
- ❌ Le schéma OpenAPI ne reflète plus la réalité
- ❌ La documentation auto-générée est incomplète

---

## ✅ Actions Recommandées

### Court Terme (URGENT - 1-2 jours)

1. ⏰ **Activer les logs de validation détaillés** pour comprendre ce que rejette Fastify
2. ⏰ **Tester avec `additionalProperties: true`** dans le schéma des segments
3. ⏰ **Exécuter un script de migration** pour nettoyer les `voiceSimilarityScore: false` en DB

### Moyen Terme (1 semaine)

4. 📝 **Créer des tests d'intégration** pour valider le schéma avec des données réelles
5. 📝 **Documenter le format exact** attendu par le schéma
6. 📝 **Ajouter une validation à l'écriture** côté Python pour garantir les types

### Long Terme (2-4 semaines)

7. 🔄 **Réactiver le schéma** une fois les corrections validées
8. 🔄 **Monitorer les métriques** de validation en production
9. 🔄 **Mettre en place des alertes** si la validation échoue

---

## 📊 Impact Métier

### Actuellement (Schéma Désactivé)

- ✅ **Fonctionnel** : Les segments remontent correctement
- ✅ **Multi-speaker** : Le système fonctionne de bout en bout
- ⚠️ **Sécurité** : Validation désactivée (risque modéré)
- ❌ **Documentation** : OpenAPI/Swagger incorrect

### Objectif (Schéma Réactivé)

- ✅ **Fonctionnel** : Les segments remontent correctement
- ✅ **Multi-speaker** : Le système fonctionne de bout en bout
- ✅ **Sécurité** : Validation active
- ✅ **Documentation** : OpenAPI/Swagger correct

---

## 🔗 Documents Connexes

- `FIX-SCHEMA-SEGMENTS-LANGUAGE.md` - Correction du champ language manquant
- `FIX-SEGMENTS-API-SCHEMA-VALIDATION.md` - Corrections appliquées (non suffisantes)
- `AUDIT_CHAINE_TRADUCTION_AUDIO.md` - Audit complet du système multi-speaker

---

## 📝 Notes

### Pourquoi ne pas supprimer complètement le schéma ?

La validation par schéma est importante pour :
1. **Sécurité** : Éviter le leak de données sensibles
2. **Documentation** : Génération automatique OpenAPI/Swagger
3. **Qualité** : Garantir la cohérence des réponses API
4. **Performance** : `fast-json-stringify` optimise la sérialisation

### Timeline estimée

- **Investigation** : 1-2 jours
- **Correction** : 2-3 jours
- **Tests** : 2-3 jours
- **Réactivation** : 1 jour
- **Total** : ~1-2 semaines

---

**Rapport généré le** : 2026-01-20
**Auteur** : Claude Code
**Priorité** : 🔴 HAUTE - À traiter en priorité
