# 🔧 AUDIT TTS - GUIDE DE DÉMARRAGE RAPIDE

> **Problème** : Le système TTS est bloqué pendant 120 secondes avant d'échouer.
> **Solution** : 5 correctifs CRITIQUES identifiés et documentés.
> **Temps requis** : 1-2 heures pour débloquer complètement le TTS.

---

## 🚀 DÉMARRAGE RAPIDE (5 minutes)

```bash
# 1. Exécuter le diagnostic automatique
cd /services/translator
./scripts/diagnostic_tts.sh

# 2. Si des erreurs sont détectées, suivre les recommandations affichées

# 3. Dans la plupart des cas, installer chatterbox-tts suffit :
pip install chatterbox-tts

# 4. Appliquer les correctifs (voir CORRECTIFS_TTS_A_APPLIQUER.md)

# 5. Redémarrer le service
systemctl restart translator
```

---

## 📚 DOCUMENTATION DISPONIBLE

| Document | Public | Temps | Description |
|----------|--------|-------|-------------|
| **[INDEX_AUDIT_TTS.md](./INDEX_AUDIT_TTS.md)** | Tous | 5 min | Navigation complète vers tous les documents |
| **[RESUME_EXECUTIF_AUDIT_TTS.md](./RESUME_EXECUTIF_AUDIT_TTS.md)** | Management | 5 min | Vision d'ensemble, ROI, décision requise |
| **[CORRECTIFS_TTS_A_APPLIQUER.md](./CORRECTIFS_TTS_A_APPLIQUER.md)** | DevOps | 30 min | Guide pas-à-pas des correctifs |
| **[AUDIT_COMPLET_TTS.md](./AUDIT_COMPLET_TTS.md)** | Développeurs | 30 min | Analyse technique détaillée |
| **[DIAGRAMME_FLUX_TTS_CORRIGE.md](./DIAGRAMME_FLUX_TTS_CORRIGE.md)** | Tous | 15 min | Flux visuels avant/après |
| **[scripts/diagnostic_tts.sh](./scripts/diagnostic_tts.sh)** | DevOps | 2 min | Script de diagnostic automatisé |

---

## 🎯 QUI DOIT LIRE QUOI ?

### 👔 Je suis Manager / Product Owner
→ Lire **[RESUME_EXECUTIF_AUDIT_TTS.md](./RESUME_EXECUTIF_AUDIT_TTS.md)**

**Ce que vous y trouverez** :
- Impact business du problème
- ROI de l'intervention (très élevé)
- Recommandation : Intervention immédiate
- Coût : 1-2 heures de développement

**Décision requise** : Assigner un développeur pour appliquer les correctifs aujourd'hui.

---

### 🛠️ Je suis DevOps / SRE
→ Lire **[CORRECTIFS_TTS_A_APPLIQUER.md](./CORRECTIFS_TTS_A_APPLIQUER.md)**

**Ce que vous y trouverez** :
- Checklist complète d'application
- Code exact à copier-coller
- Tests de validation
- Procédure de rollback

**Action** : Appliquer les 3 correctifs dans les fichiers indiqués.

---

### 👨‍💻 Je suis Développeur Backend
→ Lire **[AUDIT_COMPLET_TTS.md](./AUDIT_COMPLET_TTS.md)**

**Ce que vous y trouverez** :
- 5 problèmes CRITIQUES détaillés
- Code problématique identifié ligne par ligne
- Solutions complètes avec explications
- Anti-patterns à éviter

**Action** : Comprendre les problèmes et appliquer les correctifs.

---

### 🏗️ Je suis Architecte / Tech Lead
→ Lire **[AUDIT_COMPLET_TTS.md](./AUDIT_COMPLET_TTS.md)** + **[DIAGRAMME_FLUX_TTS_CORRIGE.md](./DIAGRAMME_FLUX_TTS_CORRIGE.md)**

**Ce que vous y trouverez** :
- Analyse de la conception
- Leçons apprises (anti-patterns)
- Meilleures pratiques
- Comparaison polling vs événements

**Action** : Valider l'approche et superviser l'implémentation.

---

## 🔴 PROBLÈMES CRITIQUES IDENTIFIÉS

1. **Pas de vérification des packages Python au démarrage**
   - Le système attend 120s même si chatterbox-tts n'est pas installé
   - Solution : Vérifier les packages dès l'initialisation

2. **Polling inefficace au lieu d'événements**
   - Boucle while qui vérifie toutes les 2 secondes pendant 120s
   - Solution : Utiliser asyncio.Event pour attente efficace

3. **Messages d'erreur vagues**
   - "Aucun backend disponible" ne dit pas quoi faire
   - Solution : Messages avec actions précises (pip install ...)

4. **Pas de détection d'échec de téléchargement**
   - Attend 120s même si le téléchargement échoue immédiatement
   - Solution : Signaler les échecs avec événements

5. **Pas de vérification d'espace disque**
   - Découvert uniquement après 120s d'attente
   - Solution : Vérifier l'espace disque au démarrage

---

## ✅ RÉSULTATS ATTENDUS APRÈS CORRECTIFS

| Métrique | Avant | Après | Gain |
|----------|-------|-------|------|
| Temps d'échec (package manquant) | 120s | < 1s | **99% plus rapide** |
| Temps d'échec (téléchargement) | 120s | < 5s | **96% plus rapide** |
| CPU pendant l'attente | 2-5% | 0% | **100% économisé** |
| Clarté des erreurs | Vague | Précise | **Action claire** |

---

## 🏃 PROCÉDURE D'INTERVENTION URGENTE

### Étape 1 : Diagnostic (5 minutes)
```bash
cd /services/translator
./scripts/diagnostic_tts.sh
```

### Étape 2 : Installation des packages manquants (5 minutes)
```bash
# Si le diagnostic indique que chatterbox-tts manque :
pip install chatterbox-tts torch torchaudio librosa
```

### Étape 3 : Application des correctifs (30-60 minutes)
Suivre **[CORRECTIFS_TTS_A_APPLIQUER.md](./CORRECTIFS_TTS_A_APPLIQUER.md)**

Fichiers à modifier :
- `src/services/tts/model_manager.py` (4 méthodes ajoutées, 2 modifiées)
- `src/services/tts/tts_service.py` (1 méthode réécrite)

### Étape 4 : Tests (15 minutes)
```bash
# Test 1 : Package non installé (simulation)
pip uninstall chatterbox-tts -y
# Résultat attendu : Message clair immédiat
pip install chatterbox-tts

# Test 2 : Requête réelle
curl -X POST http://localhost:8001/translate \
  -H "Content-Type: application/json" \
  -d '{"text":"Hello","source_lang":"en","target_lang":"fr","enable_tts":true}'
# Résultat attendu : Réponse en < 10s
```

### Étape 5 : Validation (5 minutes)
- [ ] Logs clairs et informatifs
- [ ] Pas d'attente de 120s
- [ ] Messages d'erreur actionnables si problème
- [ ] TTS fonctionne correctement

---

## 📊 MÉTRIQUES À SURVEILLER

Après l'intervention, vérifier dans les logs :

```bash
# Rechercher les messages de succès
grep "✅" /var/log/translator/translator.log

# Vérifier l'absence de timeouts
grep "120s" /var/log/translator/translator.log

# Vérifier les temps de réponse TTS
grep "Synthèse terminée" /var/log/translator/translator.log
```

**Indicateurs de succès** :
- ✅ "Backends TTS disponibles: ['chatterbox']"
- ✅ "Modèle chatterbox chargé et prêt"
- ✅ "Synthèse terminée: ... (dur=XXXms, time=YYYms)"

**Indicateurs de problème** :
- ❌ "AUCUN package TTS installé"
- ❌ "Attente modèle TTS... (120s)"
- ❌ "Aucun backend TTS disponible après 120s"

---

## 🆘 ROLLBACK EN CAS DE PROBLÈME

```bash
# 1. Restaurer les backups
cd /services/translator/src/services/tts
cp model_manager.py.bak model_manager.py
cp tts_service.py.bak tts_service.py

# 2. Redémarrer le service
systemctl restart translator

# 3. Vérifier les logs
tail -f /var/log/translator/translator.log
```

---

## 📞 SUPPORT ET QUESTIONS

### Problème après application des correctifs ?

1. **Exécuter le diagnostic**
   ```bash
   ./scripts/diagnostic_tts.sh
   ```

2. **Consulter les logs détaillés**
   ```bash
   tail -100 /var/log/translator/translator.log
   ```

3. **Vérifier l'installation des packages**
   ```bash
   pip list | grep -E "chatterbox|torch"
   ```

4. **Consulter la documentation complète**
   - `AUDIT_COMPLET_TTS.md` pour détails techniques
   - `INDEX_AUDIT_TTS.md` pour navigation complète

---

## 📅 HISTORIQUE DES VERSIONS

| Version | Date | Changements |
|---------|------|-------------|
| 1.0 | 2026-01-19 | Audit initial complet du système TTS |
| | | 5 problèmes CRITIQUES identifiés |
| | | Solutions détaillées pour chaque problème |
| | | Script de diagnostic automatisé créé |

---

## ✅ VALIDATION

Cet audit couvre :
- ✅ Architecture complète du système TTS
- ✅ 5 problèmes CRITIQUES bloquants
- ✅ 3 problèmes MAJEURS de performance
- ✅ 4 problèmes MINEURS d'amélioration
- ✅ Solutions détaillées avec code
- ✅ Tests de validation
- ✅ Script de diagnostic automatisé

**Statut** : ✅ Prêt pour application immédiate

---

**Pour toute question ou support, consulter [INDEX_AUDIT_TTS.md](./INDEX_AUDIT_TTS.md)**
