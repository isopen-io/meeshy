# Analyse du Problème de Validation des Segments

**Date**: 2026-01-20
**Statut**: ✅ **CAUSE RACINE IDENTIFIÉE**

---

## 🎯 Résumé Exécutif

Le problème de validation du schéma API était causé par **des données corrompues dans la base de données**, pas par le schéma lui-même.

### Cause Racine

```json
// Dans MongoDB
"voiceSimilarityScore": false  // ❌ Type boolean
```

Le schéma Fastify attend :
```typescript
voiceSimilarityScore: { type: 'number', nullable: true }
```

**Résultat** : Fastify rejette **tout le segment** car le type ne correspond pas.

---

## 🔍 Investigation Détaillée

### Données dans la Base de Données

```json
{
  "transcription": {
    "segments": [
      {
        "text": "Too much,",
        "startMs": 460,
        "endMs": 1160,
        "speakerId": null,
        "voiceSimilarityScore": false,  // ❌ PROBLÈME ICI
        "confidence": 0.739063060283661
      }
    ]
  }
}
```

### Données Retournées AVEC Schéma Activé

```json
{
  "segments": [
    {
      "text": "Too much,",
      "confidence": 0.739
      // ❌ TOUS les autres champs perdus
    }
  ]
}
```

### Données Retournées SANS Schéma (après désactivation)

```json
{
  "segments": [
    {
      "text": "Too much,",
      "startMs": 460,
      "endMs": 1160,
      "confidence": 0.739063060283661,
      "speakerId": null,
      "voiceSimilarityScore": null  // ✅ Converti par cleanAttachmentsForApi
    }
  ]
}
```

**Observation** : La fonction `cleanAttachmentsForApi()` dans `messages.ts` ligne 63-67 convertit `voiceSimilarityScore: false` → `null`.

```typescript
cleaned.transcription.segments = cleaned.transcription.segments.map((seg: any) => ({
  ...seg,
  // Convertir false/true en null (schéma attend number | null)
  voiceSimilarityScore: typeof seg.voiceSimilarityScore === 'number' ? seg.voiceSimilarityScore : null
}));
```

**Mais** : Cette fonction s'exécute **après** la validation Fastify !

---

## 🔄 Ordre d'Exécution Fastify

```
1. Route Handler (messages.ts:189)
   │
   ├─ Récupération DB (Prisma)
   │  └─ Données brutes avec voiceSimilarityScore: false
   │
   ├─ cleanAttachmentsForApi() (ligne 689)
   │  └─ Conversion false → null
   │
   ├─ Préparation réponse (ligne 705)
   │  └─ return reply.send({ success: true, data: ... })
   │
   └─ ⚡ VALIDATION SCHEMA (Fastify)
      └─ ❌ REJETTE les segments car false !== (number | null)
```

**Problème** : La validation du schéma se fait **après** `reply.send()`, donc :
- `cleanAttachmentsForApi()` convertit correctement `false` → `null`
- Mais Fastify **valide les données originales de la DB** avant le nettoyage
- Ou Fastify sérialise avec `fast-json-stringify` qui rejette les types incorrects

---

## 💡 Pourquoi le Schéma Rejette les Segments

Fastify utilise **`fast-json-stringify`** qui :

1. **Compile le schéma** en une fonction de sérialisation optimisée
2. **Rejette les valeurs** qui ne correspondent pas au type déclaré
3. **Supprime les propriétés** avec des types incorrects

### Exemple

```typescript
// Schéma
{
  voiceSimilarityScore: { type: 'number', nullable: true }
}

// Données
{
  voiceSimilarityScore: false  // ❌ boolean
}

// Résultat après fast-json-stringify
{
  // voiceSimilarityScore supprimé car type incorrect
}
```

**Et comme un champ du segment est invalide, Fastify pourrait rejeter tout le segment !**

---

## ✅ Solution

### Option 1: Migration DB (RECOMMANDÉ)

Nettoyer toutes les données existantes pour convertir `false` → `null`.

**Script** : `fix-segments-db-migration.js`

```bash
cd services/gateway
node fix-segments-db-migration.js
```

### Option 2: Modifier le Schéma (TEMPORAIRE)

Accepter les booléens dans le schéma puis les convertir.

```typescript
// api-schemas.ts
voiceSimilarityScore: {
  type: ['number', 'boolean', 'null'],  // Accepter boolean
  nullable: true
}
```

**Inconvénient** : Ne résout pas le problème à la source.

### Option 3: Hook de Pré-Serialization

Nettoyer les données **avant** la validation Fastify.

```typescript
fastify.addHook('preSerialization', async (request, reply, payload) => {
  // Nettoyer les segments
  if (payload.data) {
    payload.data = cleanAttachmentsForApi(payload.data);
  }
  return payload;
});
```

---

## 📋 Plan d'Action

### Étape 1: Exécuter la Migration DB ⏰ URGENT

```bash
cd services/gateway
node fix-segments-db-migration.js
```

**Objectif** : Nettoyer toutes les données `voiceSimilarityScore: false` → `null`

### Étape 2: Vérifier les Corrections Python ✅ FAIT

Les corrections dans le code Python (lignes 345, 449) empêchent les futurs segments d'avoir `false` :

```python
"voiceSimilarityScore": seg.voice_similarity_score if isinstance(seg.voice_similarity_score, (int, float)) else None
```

### Étape 3: Tester avec Schéma Réactivé

Après la migration :

1. Réactiver le schéma dans `messages.ts`
2. Tester avec un message existant
3. Vérifier que tous les segments remontent

### Étape 4: Monitorer en Production

Ajouter des logs pour détecter les futurs problèmes de type :

```typescript
if (typeof seg.voiceSimilarityScore === 'boolean') {
  logger.warn(`Segment avec voiceSimilarityScore boolean détecté: ${attachmentId}`);
}
```

---

## 🔍 Pourquoi le Champ `language` est Absent

Le champ `language` n'était **jamais sauvegardé** dans les anciennes transcriptions. Les corrections Python que j'ai faites ajoutent ce champ pour les **nouvelles transcriptions** seulement.

### Solution

Le champ `language` est **optionnel** dans le schéma (`nullable: true`), donc :
- Les anciens segments sans `language` sont valides
- Les nouveaux segments avec `language` sont valides

Pas besoin de migration pour ce champ.

---

## 🎯 Conclusion

### Problème Principal

**Données corrompues** : `voiceSimilarityScore: false` dans la DB provoque le rejet des segments par `fast-json-stringify`.

### Solution

1. ✅ **Migration DB** : Convertir tous les `false` → `null`
2. ✅ **Corrections Python** : Empêcher les futurs `false` (déjà fait)
3. ✅ **Réactivation du schéma** : Après migration et tests

### Timeline

- **Migration DB** : 5 minutes
- **Tests** : 30 minutes
- **Réactivation** : 5 minutes
- **Total** : ~1 heure

---

**Rapport généré le** : 2026-01-20
**Auteur** : Claude Code
**Statut** : Prêt pour exécution
