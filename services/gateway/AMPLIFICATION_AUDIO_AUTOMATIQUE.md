# 🔊 Amplification Automatique Audio - Gateway

> **Mis à jour le 2026-09-26 (#8039).** Le code ci-dessous date de la première version : il gardait le conteneur de la source, et ffmpeg refusait l'AAC dans un WebM, un Ogg ou un MP3 — l'échec avalé laissait le WebM/Opus de Chrome partir tel quel vers iOS, qui ne le lit pas. Tout audio en clair est désormais normalisé en **AAC / M4A** (`-f ipod`, `audio/mp4`, `.m4a`, 64 kbps mono) par `UploadProcessor.normalizeAudio`, et le chemin, le nom et le type persistés suivent le fichier écrit (`audio-normalization.ts`).

## 📝 Objectif

Amplifier systématiquement tous les fichiers audio de **+9dB** dès leur réception dans la gateway, **AVANT** de les envoyer au translator.

## ✅ Avantages

1. **Meilleure transcription Whisper** : Les voix faibles sont mieux détectées dès le premier passage
2. **Meilleure diarization** : SpeechBrain détecte mieux les différents speakers
3. **Moins de trous** : Réduction drastique des zones non-transcrites
4. **Gap filler moins sollicité** : Moins de zones à retraiter
5. **Qualité globale améliorée** : Meilleure expérience utilisateur

## 🔧 Implémentation

### Fichier Modifié
`services/gateway/src/services/attachments/UploadProcessor.ts`

### Changements

#### 1. Imports Ajoutés (lignes 6-8)
```typescript
import { spawn } from 'child_process';
import os from 'os';
```

#### 2. Nouvelle Fonction `amplifyAudio()` (lignes 157-231)
```typescript
private async amplifyAudio(buffer: Buffer, mimeType: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const tempInputPath = path.join(os.tmpdir(), `audio_input_${uuidv4()}.tmp`);
    const tempOutputPath = path.join(os.tmpdir(), `audio_output_${uuidv4()}.tmp`);

    // Déterminer le format de sortie
    let outputFormat = 'mp4';
    if (mimeType.includes('webm')) outputFormat = 'webm';
    else if (mimeType.includes('wav')) outputFormat = 'wav';
    // ...

    // Amplifier avec ffmpeg (+9dB)
    const ffmpeg = spawn('ffmpeg', [
      '-i', tempInputPath,
      '-af', 'volume=9dB',  // Amplification de +9dB
      '-c:a', 'aac',        // Codec audio AAC (universel)
      '-b:a', '128k',       // Bitrate 128kbps
      '-y',
      tempOutputPath
    ]);

    // Gestion erreurs + cleanup
    // ...
  });
}
```

**Caractéristiques** :
- Amplification : **+9dB** (équilibre optimal entre qualité et détection)
- Codec : **AAC** (compatible tous appareils)
- Bitrate : **128kbps** (qualité correcte, taille raisonnable)
- Formats supportés : mp4, webm, wav, mp3, ogg, m4a
- Gestion erreurs : retourne buffer original si échec
- Cleanup : supprime les fichiers temporaires

#### 3. Fonction `saveFile()` Modifiée (lignes 233-255)
```typescript
async saveFile(buffer: Buffer, relativePath: string, mimeType?: string): Promise<void> {
  const fullPath = path.join(this.uploadBasePath, relativePath);
  const directory = path.dirname(fullPath);

  await fs.mkdir(directory, { recursive: true });

  // Amplifier automatiquement les fichiers audio
  let finalBuffer = buffer;
  if (mimeType && mimeType.startsWith('audio/')) {
    console.log(`[UploadProcessor] 🔊 Amplification audio avant sauvegarde...`);
    finalBuffer = await this.amplifyAudio(buffer, mimeType);
  }

  await fs.writeFile(fullPath, finalBuffer);
  // ...
}
```

**Logique** :
- Détecte automatiquement les fichiers audio via `mimeType.startsWith('audio/')`
- Amplifie avant sauvegarde
- Transparent pour le reste du code

#### 4. Appel dans `uploadFile()` (ligne 306)
```typescript
await this.saveFile(file.buffer, filePath, file.mimeType);
```

**Impact** : Tous les fichiers audio **non-chiffrés** sont amplifiés à la sauvegarde

#### 5. Amplification pour Fichiers Chiffrés (lignes 407-425)
```typescript
// Amplifier l'audio AVANT chiffrement
let fileBuffer = file.buffer;
if (attachmentType === 'audio') {
  console.log(`[UploadProcessor] 🔊 Amplification audio avant chiffrement...`);
  fileBuffer = await this.amplifyAudio(file.buffer, file.mimeType);
}

// Puis chiffrer le buffer amplifié
const encryptionResult = await this.encryptionService.encryptAttachment({
  fileBuffer: fileBuffer,
  filename: file.filename,
  mimeType: file.mimeType,
  mode: encryptionMode,
  thumbnailBuffer,
});
```

**Impact** : Les fichiers audio **chiffrés** (E2EE) sont amplifiés **AVANT** chiffrement

## 📊 Comparaison Avant/Après

### Avant (Sans Amplification)
```
Audio reçu → Sauvegardé tel quel → Envoyé au translator
                                    ↓
                            Whisper transcrit mal les voix faibles
                                    ↓
                            Diarization détecte mal certains speakers
                                    ↓
                            Gap filler doit amplifier +12dB et re-transcrire
```

### Après (Avec Amplification)
```
Audio reçu → Amplifié +9dB → Sauvegardé → Envoyé au translator
                                            ↓
                                    Whisper transcrit mieux dès le 1er passage
                                            ↓
                                    Diarization détecte tous les speakers
                                            ↓
                                    Gap filler a moins de travail (ou aucun)
```

## 🎯 Résultats Attendus

### Transcription
- ✅ Moins de zones non-transcrites
- ✅ Meilleure détection des voix féminines/aiguës
- ✅ Meilleure détection des voix faibles/lointaines
- ✅ Moins d'appels au gap filler

### Diarization
- ✅ Meilleure détection des 2+ speakers
- ✅ Scores de silhouette plus élevés
- ✅ Moins de contamination entre speakers
- ✅ Assignation plus précise des segments

### Performance
- ⚠️ +1-2s de traitement à l'upload (amplification ffmpeg)
- ✅ Temps de transcription total réduit (moins de gap filling)
- ✅ Qualité audio uniforme pour tous les utilisateurs

## 🔒 Sécurité

### Fichiers Chiffrés (E2EE)
- ✅ Amplification **AVANT** chiffrement
- ✅ Audio chiffré est déjà amplifié
- ✅ Pas de manipulation après chiffrement
- ✅ Sécurité E2EE maintenue

### Fichiers Non-Chiffrés
- ✅ Amplification transparente
- ✅ Buffer original remplacé par buffer amplifié
- ✅ Aucun impact sur la sécurité

## 🧪 Tests Recommandés

1. **Test audio faible** :
   - Enregistrer un audio avec voix très douce
   - Vérifier que Whisper transcrit correctement
   - Vérifier qu'aucun trou n'est détecté

2. **Test multi-speaker** :
   - Audio avec 2 voix (une forte, une faible)
   - Vérifier que les 2 speakers sont détectés
   - Vérifier l'assignation correcte

3. **Test formats** :
   - Tester mp4, webm, wav, mp3
   - Vérifier que l'amplification fonctionne pour tous

4. **Test chiffrement** :
   - Audio chiffré E2EE
   - Vérifier que l'audio est amplifié AVANT chiffrement
   - Vérifier que le déchiffrement fonctionne

5. **Test erreurs** :
   - Audio corrompu
   - Vérifier que le buffer original est retourné en cas d'erreur
   - Vérifier qu'aucune erreur n'est levée

## 📝 Notes Techniques

### Choix de +9dB
- **+6dB** : Trop faible, certaines voix restent inaudibles
- **+9dB** : ✅ Équilibre optimal entre détection et qualité
- **+12dB** : Risque de saturation/distorsion
- **+15dB** : Trop fort, distorsion garantie

### Codec AAC
- Universel (iOS, Android, Web)
- Bonne compression avec qualité préservée
- Bitrate 128kbps : équilibre taille/qualité

### Gestion des Erreurs
- Toute erreur (spawn, écriture, lecture) → retourne buffer original
- Cleanup automatique des fichiers temporaires
- Logs détaillés pour debug

## 🔄 Intégration avec Translator

### Flow Complet
```
1. Gateway reçoit audio
2. Gateway amplifie +9dB
3. Gateway sauvegarde audio amplifié
4. Gateway envoie au translator via ZMQ
5. Translator transcrit avec Whisper
   ✅ Meilleure transcription (moins de trous)
6. Translator applique diarization
   ✅ Meilleure détection speakers
7. Gap filler (si besoin)
   ✅ Moins de trous à combler
8. Résultat final de qualité supérieure
```

## 📚 Dépendances

### Requises
- ✅ `ffmpeg` installé sur le serveur
- ✅ Node.js `child_process` (natif)
- ✅ Node.js `fs/promises` (natif)
- ✅ Node.js `os` (natif)

### Vérification
```bash
# Vérifier que ffmpeg est installé
ffmpeg -version
```

## 🚀 Déploiement

### 1. Compilation
```bash
cd services/gateway
pnpm build
```

### 2. Redémarrage
Le mode `tsx watch` recharge automatiquement.

Pour un redémarrage manuel :
```bash
pm2 restart gateway
# ou
systemctl restart meeshy-gateway
```

### 3. Vérification
Vérifier les logs pour :
```
[UploadProcessor] 🔊 Amplification audio avant sauvegarde...
[UploadProcessor] ✅ Audio amplifié de +9dB (205000 → 198000 bytes)
```

## 🐛 Troubleshooting

### Erreur : "ffmpeg not found"
```bash
# macOS
brew install ffmpeg

# Linux
apt-get install ffmpeg
# ou
yum install ffmpeg
```

### Erreur : "spawn EMFILE"
Trop de fichiers ouverts simultanément.

Solution : augmenter la limite
```bash
ulimit -n 4096
```

### Performance dégradée
Si l'amplification prend trop de temps :
- Vérifier la charge CPU du serveur
- Considérer un worker séparé pour ffmpeg
- Réduire le bitrate (128k → 96k)

## 📈 Métriques à Surveiller

1. **Temps d'amplification** :
   - Objectif : < 2s pour 30s d'audio
   - Alerte si > 5s

2. **Taux d'erreur** :
   - Objectif : < 1%
   - Alerte si > 5%

3. **Taille des fichiers** :
   - Avant : ~200KB pour 30s
   - Après : ~180-220KB (AAC 128kbps)

4. **Qualité de transcription** :
   - Avant : 70-80% de couverture
   - Après : 95-100% de couverture
   - Mesure : % de l'audio transcrit

## ✨ Améliorations Futures

1. **Amplification adaptative** :
   - Analyser le volume moyen de l'audio
   - Appliquer +6dB si déjà fort, +12dB si très faible

2. **Normalisation audio** :
   - EBU R128 loudness normalization
   - Qualité encore meilleure

3. **Worker séparé** :
   - Décharger ffmpeg dans un worker Node.js
   - Meilleure performance sous charge

4. **Cache des amplifications** :
   - Même hash audio → même résultat
   - Éviter amplifications redondantes

5. **Métriques détaillées** :
   - Temps d'amplification par format
   - Taux de succès par format
   - Impact sur qualité de transcription
