# 06 — Media Storage & Bandwidth Analysis

## Résumé (≤ 200 mots)

L'analyse exhaustive du pipeline média de Meeshy révèle sept problèmes de bande passante couvrant l'audio, les images, les assets statiques et la compression réseau.

Le problème le plus grave est le ré-encodage audio systématique à 128 kbps dans `UploadProcessor.ts` : les iOS envoient du AAC 64 kbps, le serveur double la taille en stockage sans gain qualitatif. Pour un utilisateur envoyant 10 messages vocaux de 30 s par jour, c'est **2,4 MB gaspillés quotidiennement**.

Côté réseau, Traefik n'a aucun middleware `compress` en production : toutes les réponses JSON (listes de conversations, messages) voyagent non compressées — gain potentiel de **2–4 MB/jour** pour un utilisateur actif.

Les sons de notification WAV dans `apps/web/public/sounds/` totalisent 384 KB non compressés téléchargés à chaque nouvelle session web, alors qu'Opus/OGG donnerait ≤50 KB.

Les avatars sont générés en un seul format 512 px JPEG. Dans les listes de conversations, une vignette 40 px est affichée depuis un fichier 512 px, soit un surcoût de **15×** en pixels décodés.

Corriger ces quatre points prioritaires économise **5–8 MB/utilisateur/jour** pour un profil mobile actif.

---

## Problèmes par sévérité

### CRITIQUE

---

#### P01 — Audio amplifié recodé à 128 kbps (doublement de taille)

| Champ | Valeur |
|-------|--------|
| **Fichier:ligne** | `services/gateway/src/services/attachments/UploadProcessor.ts:184–239` |
| **Sévérité** | CRITIQUE |
| **Bandwidth saved** | ~2,4 MB/utilisateur/jour (10 messages vocaux 30 s) |

**Description**  
`amplifyAudio()` re-encode systématiquement tout audio entrant en AAC 128 kbps (`-b:a 128k`). Or les iOS envoient déjà du M4A AAC 64 kbps (cf. `AudioRecordingSettings.standard.bitRate = 64000`). Le volume est amplifié (+9 dB) mais le codec, le bitrate et la durée sont identiques : le fichier stocké fait le double de l'original sans gain perceptible de qualité à 128 kbps vs 64 kbps pour de la voix.

Exemple concret : message vocal 30 s iOS → 240 KB à l'envoi, 480 KB stocké et retéléchargé par chaque destinataire.

**Fix**  
Passer `-b:a 128k` en `-b:a 64k` pour correspondre à la source iOS, ou détecter le bitrate d'entrée et le conserver avec `-c:a copy` quand aucune amplification n'est demandée. Séparer l'amplification de gain du bitrate de stockage.

```typescript
// AVANT
'-b:a', '128k',

// APRÈS — conserver le bitrate source (64 kbps pour iOS)
'-b:a', '64k',
```

---

### ÉLEVÉE

---

#### P02 — Sons de notification en WAV non compressés (384 KB / session web)

| Champ | Valeur |
|-------|--------|
| **Fichier:ligne** | `apps/web/public/sounds/ringtone.wav` (188 KB), `mention.wav` (124 KB), `notification.wav` (72 KB) |
| **Sévérité** | ÉLEVÉE |
| **Bandwidth saved** | ~0,33 MB/session (chaque nouvelle session web télécharge les 3 fichiers) |

**Description**  
Les trois fichiers WAV (PCM non compressé) sont chargés statiquement par le service worker PWA à chaque install/refresh. Opus/OGG à 32 kbps donne une qualité identique pour des alertes courtes, avec un ratio de compression ≈7×. Total actuel : 384 KB ; cible : ≤55 KB.

**Fix**  
Convertir en OGG Opus (32 kbps) avec fallback MP3 pour Safari :
```bash
ffmpeg -i ringtone.wav -c:a libopus -b:a 32k ringtone.ogg
ffmpeg -i ringtone.wav -c:a libmp3lame -b:a 64k ringtone.mp3
```
Mettre à jour les références dans le composant audio et le manifeste PWA. Supprimer les WAV.

---

#### P03 — Traefik production sans middleware compress (JSON non compressé)

| Champ | Valeur |
|-------|--------|
| **Fichier:ligne** | `infrastructure/docker/compose/config/dynamic.yaml` (middleware section) |
| **Sévérité** | ÉLEVÉE |
| **Bandwidth saved** | ~2–4 MB/utilisateur/jour (JSON API, réponses WebSocket non binaires) |

**Description**  
La configuration Traefik dynamique définit `secure-headers`, `cors` et `rate-limit` mais aucun middleware `compress`. En production, les réponses JSON du gateway (listes de conversations, messages, profils) transitent non compressées. gzip sur du JSON typique donne un ratio 5–8×. Une liste de 50 conversations fait ~40 KB JSON → ~6 KB gzippé.

Nginx ne couvre que les fichiers statiques (`infrastructure/docker/nginx/production.conf:67-82`) ; le trafic dynamique gateway échappe à toute compression.

**Fix**  
Ajouter le middleware `compress` Traefik et l'appliquer aux routers gateway et frontend :

```yaml
# infrastructure/docker/compose/config/dynamic.yaml
http:
  middlewares:
    compress:
      compress: {}
    # ... middlewares existants ...

  routers:
    gateway:
      middlewares:
        - compress
        - secure-headers
        # ...
```

---

#### P04 — Avatars sans variantes de taille (512 px servi pour des vignettes 40 px)

| Champ | Valeur |
|-------|--------|
| **Fichier:ligne** | `services/gateway/src/services/image/ImageProcessingService.ts:1–30` |
| **Sévérité** | ÉLEVÉE |
| **Bandwidth saved** | ~1,5–3 MB/utilisateur/jour (liste conversations + profils) |

**Description**  
`processAvatar()` génère un seul JPEG 512×512 (≈30–60 KB). Dans `ConversationList`, les avatars sont affichés à 40–80 px : le browser décode une image 512 px pour l'afficher en 40 px, soit un surcoût de décodage de 16× en pixels. Sur mobile 4G avec 30 conversations visibles, cela représente 900 KB–1,8 MB de données avatar pour afficher ce qui nécessiterait 60–120 KB en vignettes 80 px.

**Fix**  
Générer 3 variantes avec Sharp et les stocker sous des noms distincts :

```typescript
// services/gateway/src/services/image/ImageProcessingService.ts
export async function processAvatar(buffer: Buffer): Promise<AvatarVariants> {
  const base = sharp(buffer).resize(512, 512, { fit: 'cover' });
  return {
    full:  await base.clone().jpeg({ quality: 80, progressive: true }).toBuffer(),
    thumb: await base.clone().resize(80, 80).jpeg({ quality: 75 }).toBuffer(),
    micro: await base.clone().resize(40, 40).jpeg({ quality: 70 }).toBuffer(),
  };
}
```

Servir la variante appropriée via query param `?size=thumb` ou via des URLs dédiées (`/avatars/:id/thumb`).

---

### MOYENNE

---

#### P05 — Images OG dupliquées PNG + JPG (~1,8 MB de doublons)

| Champ | Valeur |
|-------|--------|
| **Fichier:ligne** | `apps/web/public/images/` (répertoire complet) |
| **Sévérité** | MOYENNE |
| **Bandwidth saved** | ~0,9 MB par déploiement (assets statiques téléchargés une fois) |

**Description**  
Environ 13 thèmes × 2 formats (PNG + JPG) = 26 fichiers OG. Les PNG sont 2–5× plus lourds que les JPG équivalents pour des images photographiques. Les JPG sont déjà présents. Les robots OG (Twitter, Facebook) ne récupèrent que le format référencé dans les meta tags — l'autre format est du deadweight dans le bundle.

**Fix**  
Supprimer les PNG dupliqués, conserver uniquement les JPG. Optionnellement convertir en WebP avec fallback JPG dans les `<meta>` tags :
```bash
find apps/web/public/images/ -name "meeshy-og-*.png" -delete
```
Vérifier que les `<meta property="og:image">` pointent tous vers les `.jpg`.

---

#### P06 — Thumbnails d'attachements générés en JPEG (pas WebP)

| Champ | Valeur |
|-------|--------|
| **Fichier:ligne** | `services/gateway/src/services/attachments/MetadataManager.ts:66–86` |
| **Sévérité** | MOYENNE |
| **Bandwidth saved** | ~0,3–0,8 MB/utilisateur/jour (preview images dans le fil de messages) |

**Description**  
`generateThumbnail()` produit des thumbnails 300 px JPEG q80. WebP à qualité équivalente est 25–34% plus léger. Les thumbnails sont affichés dans la liste des messages pour tout attachement image/vidéo — trafic répété à chaque ouverture de conversation.

**Fix**  
Basculer sur WebP et ajouter `Vary: Accept` pour la négociation de contenu :

```typescript
// MetadataManager.ts ligne ~78
// AVANT
.jpeg({ quality: 80 })

// APRÈS
.webp({ quality: 75 })
```

Mettre à jour l'extension stockée (`.webp`) et ajouter `Accept: image/webp` dans les clients.

---

#### P07 — Pas de cache TTS (re-synthèse systématique de phrases identiques)

| Champ | Valeur |
|-------|--------|
| **Fichier:ligne** | `services/translator/src/services/tts/synthesizer.py:407,440,443–445,504` |
| **Sévérité** | MOYENNE |
| **Bandwidth saved** | ~0,5–2 MB/utilisateur/jour (conversations avec traductions répétées) |

**Description**  
`Synthesizer.synthesize()` re-synthétise à chaque appel même si `(text, language, voice_profile_id)` est identique. Les WAV intermédiaires sont créés dans `/tmp` et convertis en MP3, mais aucun résultat n'est mis en cache. Dans des conversations de groupe avec traduction automatique, le même texte court peut être synthétisé des dizaines de fois par heure.

**Fix**  
Ajouter une couche de cache Redis avec hash SHA-256 comme clé :

```python
# synthesizer.py — avant l'appel au modèle
cache_key = f"tts:{hashlib.sha256(f'{text}:{language}:{voice_id}'.encode()).hexdigest()}"
cached = await redis.get(cache_key)
if cached:
    return base64.b64decode(cached)

# ... synthèse ...
await redis.setex(cache_key, 86400, base64.b64encode(mp3_bytes))  # TTL 24h
```

---

#### P08 — Seuil de compression client-side à 100 MB (inefficace pour images courantes)

| Champ | Valeur |
|-------|--------|
| **Fichier:ligne** | `apps/web/utils/media-compression.ts` (`compressMediaIfNeeded()`) |
| **Sévérité** | MOYENNE |
| **Bandwidth saved** | ~1–3 MB/utilisateur/jour (images attachées non compressées) |

**Description**  
`compressMediaIfNeeded()` ne compresse les images que si le fichier dépasse **100 MB**. Or les photos récentes d'iPhone/Android font 3–12 MB. Ces fichiers sont uploadés à pleine résolution, stockés en pleine résolution, et retéléchargés par chaque destinataire. Le seuil de 100 MB ne déclenche jamais la compression en conditions réelles.

**Fix**  
Abaisser le seuil à 2 MB avec résolution maximale 2048 px :

```typescript
// apps/web/utils/media-compression.ts
const MAX_FILE_SIZE_MB = 2;       // était 100
const MAX_WIDTH_OR_HEIGHT = 2048; // adapter selon usage

export async function compressMediaIfNeeded(file: File): Promise<File> {
  if (file.size <= MAX_FILE_SIZE_MB * 1024 * 1024) return file;
  // ... compression existante ...
}
```

---

#### P09 — Cache uploads Nginx à 30 jours au lieu de 1 an

| Champ | Valeur |
|-------|--------|
| **Fichier:ligne** | `infrastructure/docker/compose/config/nginx/static-files.conf` (bloc `/u/`) |
| **Sévérité** | MOYENNE |
| **Bandwidth saved** | ~0,2–0,5 MB/utilisateur/jour (re-téléchargements évitables d'avatars/attachements) |

**Description**  
Le bloc `/u/` (fichiers uploadés — avatars, attachements) a `expires 30d` au lieu de `1y`. Les fichiers uploadés sont immutables (UUID dans l'URL) : une mise en cache d'un an est sûre et évite les re-téléchargements après 30 jours.

**Fix**  
```nginx
# static-files.conf
location /u/ {
    expires 1y;                          # était 30d
    add_header Cache-Control "public, immutable";
    # ...
}
```

---

### FAIBLE

---

#### P10 — Format audio par défaut WAV dans voice_profile_handler.py

| Champ | Valeur |
|-------|--------|
| **Fichier:ligne** | `services/translator/src/services/voice_profile_handler.py:195,234` |
| **Sévérité** | FAIBLE |
| **Bandwidth saved** | ~0,1–0,3 MB par création de profil vocal |

**Description**  
Ligne 195 : `"audio_format": "wav"` comme valeur par défaut dans les requêtes de profil vocal. WAV PCM est non compressé. Le gateway envoie ces données via ZMQ ; un format MP3 ou OGG serait 5–10× plus léger sans impact sur la qualité d'extraction d'embedding.

**Fix**  
```python
# voice_profile_handler.py ligne 195
"audio_format": "mp3",  # était "wav"

# ligne 234
audio_format = request_data.get('audio_format', 'mp3')  # était 'wav'
```

---

#### P11 — Pas de WebP pour avatars/banners uploadés

| Champ | Valeur |
|-------|--------|
| **Fichier:ligne** | `services/gateway/src/services/image/ImageProcessingService.ts:1–50` |
| **Sévérité** | FAIBLE |
| **Bandwidth saved** | ~0,2–0,5 MB/utilisateur/jour (profils, banners) |

**Description**  
`processAvatar()` et `processBanner()` génèrent uniquement du JPEG. WebP à qualité visuelle équivalente est 25–34% plus léger. Tous les navigateurs modernes et iOS 14+ supportent WebP.

**Fix**  
Générer WebP en parallèle du JPEG (ou remplacer), stocker avec extension `.webp`, servir avec `Content-Type: image/webp`.

---

#### P12 — iOS voiceSample à 96 kbps (surdimensionné pour extraction d'embedding)

| Champ | Valeur |
|-------|--------|
| **Fichier:ligne** | `packages/MeeshySDK/Sources/MeeshySDK/Audio/AudioRecordingProviding.swift` (`AudioRecordingSettings.voiceSample`) |
| **Sévérité** | FAIBLE |
| **Bandwidth saved** | ~0,05 MB/upload de profil vocal |

**Description**  
`AudioRecordingSettings.voiceSample` encode à 96 kbps. L'extraction d'embedding vocal (OpenVoice V2) extrait des caractéristiques spectrales pour lesquelles 32–48 kbps est amplement suffisant. L'upload d'un échantillon de 10 s fait ~120 KB à 96 kbps vs ~40 KB à 32 kbps.

**Fix**  
```swift
// AudioRecordingProviding.swift
static let voiceSample = AudioRecordingSettings(
    sampleRate: 16000,  // 16 kHz suffisant pour embedding
    channels: 1,
    bitRate: 32000      // était 96000
)
```

---

## Tableau récapitulatif

| # | Fichier | Problème | Saving MB/user/jour | Sévérité |
|---|---------|----------|---------------------|----------|
| P01 | `UploadProcessor.ts:184` | Audio amplifié recodé 128 kbps (×2 taille) | 2,4 | CRITIQUE |
| P02 | `apps/web/public/sounds/*.wav` | Sons notification WAV → Opus | 0,33/session | ÉLEVÉE |
| P03 | `dynamic.yaml` middleware section | Traefik sans compress middleware | 2–4 | ÉLEVÉE |
| P04 | `ImageProcessingService.ts:1` | Avatar sans variantes de taille | 1,5–3 | ÉLEVÉE |
| P05 | `apps/web/public/images/` | OG images dupliquées PNG+JPG | 0,9/déploiement | MOYENNE |
| P06 | `MetadataManager.ts:78` | Thumbnails JPEG → WebP | 0,3–0,8 | MOYENNE |
| P07 | `synthesizer.py:407` | Pas de cache TTS Redis | 0,5–2 | MOYENNE |
| P08 | `media-compression.ts` | Seuil compression 100 MB | 1–3 | MOYENNE |
| P09 | `static-files.conf` bloc `/u/` | Cache uploads 30j → 1an | 0,2–0,5 | MOYENNE |
| P10 | `voice_profile_handler.py:195` | Format audio défaut WAV | 0,1–0,3/profil | FAIBLE |
| P11 | `ImageProcessingService.ts:1` | Pas de WebP avatar/banner | 0,2–0,5 | FAIBLE |
| P12 | `AudioRecordingProviding.swift` | voiceSample 96 kbps | 0,05/upload | FAIBLE |
