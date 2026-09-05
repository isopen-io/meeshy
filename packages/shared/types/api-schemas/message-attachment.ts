/**
 * Schémas d’API — pièces jointes d’un message.
 *
 * Extrait de `types/api-schemas.ts` par #4635 (découpage du contrat de réponse
 * du dépôt, directive 2026-08-28). Le texte des schémas est INCHANGÉ : seule
 * leur adresse de fichier bouge. `types/api-schemas.ts` reste la FAÇADE qui les
 * ré-exporte, et aucun importeur n’a bougé.
 *
 * Le bandeau conservé ci-dessous dit « moved before messageSchema for proper
 * reference » : cette contrainte d’ORDRE, payée jadis par un déplacement de
 * lignes, est désormais portée par l’import de `./message-attachment.js` dans
 * `./message.js`. Le texte du bandeau est laissé tel quel — ce lot déplace, il
 * ne réécrit pas.
 *
 * @module @meeshy/shared/types/api-schemas/message-attachment
 */

// =============================================================================
// MESSAGE ATTACHMENT SCHEMAS (moved before messageSchema for proper reference)
// =============================================================================

/**
 * Message attachment schema for API responses
 * Aligned with schema.prisma MessageAttachment model
 */
export const messageAttachmentSchema = {
  type: 'object',
  description: 'File attachment for a message',
  properties: {
    // Identifiers
    id: { type: 'string', description: 'Attachment unique identifier' },
    messageId: { type: 'string', description: 'Parent message ID' },

    // File info
    fileName: { type: 'string', description: 'Generated unique filename' },
    originalName: { type: 'string', description: 'Original filename' },
    mimeType: { type: 'string', description: 'MIME type (image/jpeg, application/pdf, etc.)' },
    fileSize: { type: 'number', description: 'File size in bytes' },
    filePath: { type: 'string', description: 'Relative file path' },
    fileUrl: { type: 'string', description: 'Full URL for access' },

    // BUG2 A' — réactions par-image (sinon fast-json-stringify les strippe)
    reactionSummary: { type: 'object', additionalProperties: { type: 'number' }, description: 'Per-image reaction counts (emoji→count)' },
    currentUserReactions: { type: 'array', items: { type: 'string' }, description: 'Emojis the current user reacted with on this attachment' },

    // #3909 — la progression PERSONNELLE de lecture, DÉCLARÉE cette fois.
    //
    // Le gateway la calculait depuis juin 2026 (une requête bornée par page,
    // scopée au participant) et fast-json-stringify la retirait à chaque
    // réponse, faute de figurer ICI. #4177 a donc retiré le calcul — à raison :
    // c'était du travail mort. Ce qu'il faut retenir est l'ordre : **déclarer
    // le champ est le PRÉALABLE, pas la conséquence.** Réintroduire la
    // projection sans cette déclaration la referait mourir en silence, et le
    // client qui la lit resterait un contrôle non alimenté.
    currentUserConsumption: {
      type: 'object',
      nullable: true,
      description: "Current participant's playback progress on this attachment (null = never consumed)",
      properties: {
        lastPlayPositionMs: { type: 'number', nullable: true, description: 'Last audio position in ms' },
        listenedComplete: { type: 'boolean', description: 'Audio listened to completion' },
        lastWatchPositionMs: { type: 'number', nullable: true, description: 'Last video position in ms' },
        watchedComplete: { type: 'boolean', description: 'Video watched to completion' },
      },
    },

    // User-provided metadata
    title: { type: 'string', nullable: true, description: 'Human-readable title' },
    alt: { type: 'string', nullable: true, description: 'Accessibility alt text' },
    caption: { type: 'string', nullable: true, description: 'Caption/legend' },

    // Forwarding
    forwardedFromAttachmentId: { type: 'string', nullable: true, description: 'Original attachment ID if forwarded' },
    isForwarded: { type: 'boolean', description: 'Whether this is a forwarded attachment' },

    // Provenance — declared by the capturing client, read back by the share
    // sheet to decide whether publishing this media needs confirmation.
    capturedInApp: { type: 'boolean', description: "Media came from the app's own camera or microphone" },

    // View-once / Secret
    isViewOnce: { type: 'boolean', description: 'View-once attachment' },
    maxViewOnceCount: { type: 'number', nullable: true, description: 'Max unique viewers' },
    viewOnceCount: { type: 'number', description: 'Current view count' },
    isBlurred: { type: 'boolean', description: 'Content blurred until tap' },

    // Image metadata
    width: { type: 'number', nullable: true, description: 'Image width in pixels' },
    height: { type: 'number', nullable: true, description: 'Image height in pixels' },
    thumbnailPath: { type: 'string', nullable: true, description: 'Thumbnail file path' },
    thumbnailUrl: { type: 'string', nullable: true, description: 'Thumbnail URL' },
    thumbHash: { type: 'string', nullable: true, description: 'ThumbHash base64 for instant placeholder (~33 chars)' },
    imageVariants: {
      type: 'array',
      nullable: true,
      description: 'Responsive downscaled WebP variants for srcset (D4) — non-encrypted images only',
      items: {
        type: 'object',
        properties: {
          width: { type: 'number', description: 'Variant width in pixels' },
          height: { type: 'number', description: 'Variant height in pixels' },
          url: { type: 'string', description: 'Variant file URL' },
          size: { type: 'number', description: 'Variant byte size' },
          format: { type: 'string', description: 'Encoded format (webp)' },
        },
      },
    },

    // Audio/Video metadata
    duration: { type: 'number', nullable: true, description: 'Duration in milliseconds' },
    bitrate: { type: 'number', nullable: true, description: 'Bitrate in bps' },
    sampleRate: { type: 'number', nullable: true, description: 'Sample rate in Hz' },
    codec: { type: 'string', nullable: true, description: 'Audio codec (opus, aac, mp3)' },
    channels: { type: 'number', nullable: true, description: 'Audio channels (1=mono, 2=stereo)' },

    // Video-specific
    fps: { type: 'number', nullable: true, description: 'Frames per second' },
    videoCodec: { type: 'string', nullable: true, description: 'Video codec (h264, h265, vp9)' },

    // Document metadata
    pageCount: { type: 'number', nullable: true, description: 'Page count for PDFs' },
    lineCount: { type: 'number', nullable: true, description: 'Line count for text files' },

    // Upload info
    uploadedBy: { type: 'string', description: 'Uploader user ID' },
    isAnonymous: { type: 'boolean', description: 'Uploaded by anonymous user' },

    // Security/Moderation
    scanStatus: {
      type: 'string',
      enum: ['pending', 'clean', 'infected', 'error'],
      nullable: true,
      description: 'Virus scan status'
    },
    scanCompletedAt: { type: 'string', format: 'date-time', nullable: true, description: 'Scan completion time' },
    moderationStatus: {
      type: 'string',
      enum: ['pending', 'approved', 'flagged', 'rejected'],
      nullable: true,
      description: 'Content moderation status'
    },
    moderationReason: { type: 'string', nullable: true, description: 'Moderation reason' },

    // Delivery status (whole-conversation timestamps + counters)
    deliveredToAllAt: { type: 'string', format: 'date-time', nullable: true, description: 'Delivered to all timestamp' },
    viewedByAllAt: { type: 'string', format: 'date-time', nullable: true, description: 'Viewed by all timestamp' },
    downloadedByAllAt: { type: 'string', format: 'date-time', nullable: true, description: 'Downloaded by all timestamp' },
    listenedByAllAt: { type: 'string', format: 'date-time', nullable: true, description: 'Listened by all timestamp (audio only)' },
    watchedByAllAt: { type: 'string', format: 'date-time', nullable: true, description: 'Watched by all timestamp (video only)' },
    viewedCount: { type: 'number', description: 'Number of viewers' },
    downloadedCount: { type: 'number', description: 'Number of downloads' },
    consumedCount: { type: 'number', description: 'Number of users who listened (audio) or watched (video)' },

    // Effects bitfield (lifecycle / appearance / persistent flags)
    // @see packages/shared/types/message-effect-flags.ts
    effectFlags: { type: 'number', description: 'Bitfield for attachment effects' },

    // Encryption (E2EE envelope — required for clients to decrypt the file)
    isEncrypted: { type: 'boolean', description: 'Whether encrypted' },
    encryptionMode: { type: 'string', nullable: true, description: 'Encryption mode: e2ee, server, hybrid' },
    encryptionIv: { type: 'string', nullable: true, description: 'Base64-encoded AES-GCM initialization vector (12 bytes)' },
    encryptionAuthTag: { type: 'string', nullable: true, description: 'Base64-encoded AES-GCM authentication tag (16 bytes)' },

    // Timestamps
    createdAt: { type: 'string', format: 'date-time', description: 'Creation timestamp' },
    // `additionalProperties: true` — c'est une CARTE à clés ouvertes
    // (`AttachmentMetadata` : dimensions, codecs, et surtout
    // `audioEffectsTimeline`), donc la seule déclaration qui la laisse passer.
    // Sans lui, fast-json-stringify appliquait `additionalProperties: false` et
    // servait `{}` — sur TOUTE route employant ce schéma, la liste de messages
    // comprise. `apps/web/…/message-formatting.tsx` lit
    // `attachment.metadata?.audioEffectsTimeline` et ne l'a donc jamais reçu :
    // la timeline d'effets d'une note vocale n'a jamais atteint un client.
    metadata: { type: 'object', nullable: true, additionalProperties: true, description: 'Additional metadata JSON (audioEffectsTimeline, dimensions, codecs…) — carte à clés ouvertes' },

    // ===== TRANSCRIPTION & TRANSLATION V2 (JSON intégré - Générique) =====
    // V2: Champs JSON intégrés dans MessageAttachment
    // Support: audio, video, document, image
    transcription: {
      type: 'object',
      nullable: true,
      description: 'Transcription JSON intégrée (AttachmentTranscription V2) - Support audio/video/document/image',
      properties: {
        type: {
          type: 'string',
          enum: ['audio', 'video', 'document', 'image'],
          description: 'Type d\'attachment transcrit'
        },
        text: { type: 'string', description: 'Texte transcrit' },
        language: { type: 'string', description: 'Langue détectée (ISO 639-1)' },
        confidence: { type: 'number', description: 'Score de confiance (0-1)' },
        source: {
          type: 'string',
          enum: ['mobile', 'whisper', 'voice_api', 'ocr', 'vision_api'],
          description: 'Source de transcription'
        },
        model: { type: 'string', nullable: true, description: 'Modèle utilisé' },
        // Spécifique audio/video
        segments: {
          type: 'array',
          nullable: true,
          description: 'Segments avec timestamps et speakers (audio/video)',
          items: {
            type: 'object',
            properties: {
              text: { type: 'string', description: 'Texte du segment' },
              startMs: { type: 'number', description: 'Temps de début (millisecondes)' },
              endMs: { type: 'number', description: 'Temps de fin (millisecondes)' },
              speakerId: { type: 'string', nullable: true, description: 'ID du speaker (s0, s1, s2, ...)' },
              voiceSimilarityScore: { type: 'number', nullable: true, description: 'Score de similarité vocale avec l\'utilisateur (0-1)' },
              confidence: { type: 'number', nullable: true, description: 'Score de confiance (0-1)' },
              language: { type: 'string', nullable: true, description: 'Langue détectée pour ce segment (ISO 639-1)' }
            }
          }
        },
        speakerCount: { type: 'number', nullable: true, description: 'Nombre de locuteurs détectés (audio)' },
        primarySpeakerId: { type: 'string', nullable: true, description: 'ID du locuteur principal (audio)' },
        senderVoiceIdentified: { type: 'boolean', nullable: true, description: 'Utilisateur identifié parmi les locuteurs (audio)' },
        senderSpeakerId: { type: 'string', nullable: true, description: 'ID du locuteur identifié comme utilisateur (audio)' },
        speakerAnalysis: {
          type: 'object',
          nullable: true,
          description: 'Analyse détaillée des locuteurs (audio)',
          properties: {
            speakers: {
              type: 'array',
              description: 'Liste des locuteurs détectés',
              items: {
                type: 'object',
                properties: {
                  sid: { type: 'string', description: 'ID du speaker (s0, s1, s2, ...)' },
                  isPrimary: { type: 'boolean', description: 'Est le locuteur principal' },
                  speakingTimeMs: { type: 'number', description: 'Temps de parole en millisecondes' },
                  speakingRatio: { type: 'number', description: 'Ratio de temps de parole (0-1)' },
                  voiceSimilarityScore: { type: 'number', nullable: true, description: 'Score de similarité vocale avec l\'utilisateur (0-1)' },
                  segments: {
                    type: 'array',
                    description: 'Segments de temps où ce locuteur parle',
                    items: {
                      type: 'object',
                      properties: {
                        startMs: { type: 'number', description: 'Début en millisecondes' },
                        endMs: { type: 'number', description: 'Fin en millisecondes' },
                        durationMs: { type: 'number', description: 'Durée en millisecondes' }
                      }
                    }
                  }
                }
              }
            },
            totalDurationMs: { type: 'number', description: 'Durée totale de l\'audio en millisecondes' },
            method: {
              type: 'string',
              enum: ['pyannote', 'pitch_clustering', 'single_speaker'],
              description: 'Méthode de diarisation utilisée'
            }
          }
        },
        durationMs: { type: 'number', nullable: true, description: 'Durée en millisecondes (audio/video)' },
        // Carte à clés ouvertes : `VoiceAnalysisService` la produit en
        // `Record<string, unknown>`. Sans `additionalProperties`, elle sortait
        // `{}` — le champ était LISTÉ, donc l'omettre l'aurait mieux servi.
        voiceQualityAnalysis: {
          type: 'object',
          nullable: true,
          additionalProperties: true,
          description: 'Analyse qualité vocale (audio) — carte à clés ouvertes'
        },
        // Spécifique document
        pageCount: { type: 'number', nullable: true, description: 'Nombre de pages (document)' },
        // Même famille, même correctif : structure libre produite par l'OCR.
        documentLayout: { type: 'object', nullable: true, additionalProperties: true, description: 'Structure document (document) — carte à clés ouvertes' },
        // Spécifique image
        imageDescription: { type: 'string', nullable: true, description: 'Description image (image)' },
        detectedObjects: { type: 'array', nullable: true, description: 'Objets détectés (image)' },
        ocrRegions: { type: 'array', nullable: true, description: 'Régions OCR (image)' }
      }
    },
    translations: {
      type: 'object',
      nullable: true,
      description: 'Traductions JSON intégrées (AttachmentTranslations V2) - Support audio/video/text/document/image - Map: langue → traduction',
      additionalProperties: {
        type: 'object',
        required: ['type', 'transcription', 'createdAt'],
        properties: {
          type: {
            type: 'string',
            enum: ['audio', 'video', 'text', 'document', 'image'],
            description: 'Type de traduction'
          },
          transcription: { type: 'string', description: 'Texte traduit' },
          path: { type: 'string', nullable: true, description: 'Chemin fichier local' },
          url: { type: 'string', nullable: true, description: 'URL accessible' },
          // Spécifique audio/video
          durationMs: { type: 'number', nullable: true, description: 'Durée (ms) - audio/video' },
          format: { type: 'string', nullable: true, description: 'Format fichier (mp3, mp4, pdf, png...)' },
          cloned: { type: 'boolean', nullable: true, description: 'Clonage vocal activé (audio)' },
          quality: { type: 'number', nullable: true, description: 'Qualité (0-1)' },
          voiceModelId: { type: 'string', nullable: true, description: 'ID modèle vocal (audio)' },
          ttsModel: { type: 'string', nullable: true, description: 'Modèle TTS (xtts, openvoice) - audio' },
          segments: {
            type: 'array',
            nullable: true,
            description: 'Segments de transcription de l\'audio traduit (audio)',
            items: {
              type: 'object',
              properties: {
                text: { type: 'string', description: 'Texte du segment' },
                startMs: { type: 'number', description: 'Temps de début (millisecondes)' },
                endMs: { type: 'number', description: 'Temps de fin (millisecondes)' },
                speakerId: { type: 'string', nullable: true, description: 'ID du speaker (s0, s1, s2, ...)' },
                voiceSimilarityScore: { type: 'number', nullable: true, description: 'Score de similarité vocale (0-1)' },
                confidence: { type: 'number', nullable: true, description: 'Score de confiance (0-1)' },
                language: { type: 'string', nullable: true, description: 'Langue détectée pour ce segment (ISO 639-1)' }
              }
            }
          },
          // Spécifique document/image
          pageCount: { type: 'number', nullable: true, description: 'Nombre de pages (document)' },
          overlayApplied: { type: 'boolean', nullable: true, description: 'Overlay texte appliqué (image)' },
          // Métadonnées communes
          createdAt: { type: 'string', format: 'date-time', description: 'Date création' },
          updatedAt: { type: 'string', format: 'date-time', nullable: true, description: 'Date modification' },
          deletedAt: { type: 'string', format: 'date-time', nullable: true, description: 'Date suppression (soft delete)' }
        }
      }
    },
    // V2: Format Socket.IO converti depuis translations pour événements temps réel
    translatedAudios: {
      type: 'array',
      nullable: true,
      description: 'Traductions converties en format Socket.IO (SocketIOTranslation) - Support audio/video/text/document/image - Rétrocompatibilité',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'ID composite: attachmentId_langue' },
          type: {
            type: 'string',
            enum: ['audio', 'video', 'text', 'document', 'image'],
            description: 'Type de traduction'
          },
          targetLanguage: { type: 'string', description: 'Langue cible (ISO 639-1)' },
          translatedText: { type: 'string', description: 'Texte traduit' },
          url: { type: 'string', description: 'URL du fichier traduit' },
          path: { type: 'string', nullable: true, description: 'Chemin serveur' },
          // Spécifique audio/video
          durationMs: { type: 'number', nullable: true, description: 'Durée en millisecondes (audio/video)' },
          format: { type: 'string', nullable: true, description: 'Format fichier (mp3, mp4, pdf, png...)' },
          cloned: { type: 'boolean', nullable: true, description: 'Clonage vocal activé (audio)' },
          quality: { type: 'number', nullable: true, description: 'Qualité (0-1)' },
          ttsModel: { type: 'string', nullable: true, description: 'Modèle TTS utilisé (xtts, openvoice) - audio' },
          voiceModelId: { type: 'string', nullable: true, description: 'ID du modèle vocal utilisé (audio)' },
          segments: {
            type: 'array',
            nullable: true,
            description: 'Segments de transcription de l\'audio traduit (audio)',
            items: {
              type: 'object',
              properties: {
                text: { type: 'string', description: 'Texte du segment' },
                startMs: { type: 'number', description: 'Temps de début (millisecondes)' },
                endMs: { type: 'number', description: 'Temps de fin (millisecondes)' },
                speakerId: { type: 'string', nullable: true, description: 'ID du speaker (s0, s1, s2, ...)' },
                voiceSimilarityScore: { type: 'number', nullable: true, description: 'Score de similarité vocale (0-1)' },
                confidence: { type: 'number', nullable: true, description: 'Score de confiance (0-1)' },
                language: { type: 'string', nullable: true, description: 'Langue détectée pour ce segment (ISO 639-1)' }
              }
            }
          },
          // Spécifique document/image
          pageCount: { type: 'number', nullable: true, description: 'Nombre de pages (document)' },
          overlayApplied: { type: 'boolean', nullable: true, description: 'Overlay texte appliqué (image)' }
        }
      }
    }
  }
} as const;

/**
 * Minimal attachment schema for lists
 */
export const messageAttachmentMinimalSchema = {
  type: 'object',
  description: 'Minimal attachment data',
  properties: {
    id: { type: 'string', description: 'Attachment ID' },
    fileName: { type: 'string', description: 'Filename' },
    mimeType: { type: 'string', description: 'MIME type' },
    fileSize: { type: 'number', description: 'File size' },
    fileUrl: { type: 'string', description: 'File URL' },
    thumbnailUrl: { type: 'string', nullable: true, description: 'Thumbnail URL' },
    duration: { type: 'number', nullable: true, description: 'Duration (audio/video)' }
  }
} as const;

/**
 * Lieu partagé — forme de réponse UNIQUE, miroir exact de `SharedPlace`
 * (services/gateway/src/services/location/sharedPlace.ts) tel que
 * `parseSharedPlace` le produit et que le serveur seul écrit dans
 * `metadata.location`.
 *
 * Source unique parce que fast-json-stringify TRONQUE en silence tout champ
 * qu'un schéma de réponse ne déclare pas : une surface qui recopie la forme
 * de travers (ou l'omet) perd la position sans aucun signal. Toute réponse
 * hissant `location` doit épandre CE schéma, en ne surchargeant que
 * `description`.
 */
export const sharedPlaceResponseSchema = {
  type: 'object',
  nullable: true,
  description: 'Lieu partagé (position figée + POI enrichi) — hissé depuis metadata.location, validé serveur ; null si absent',
  properties: {
    latitude: { type: 'number' },
    longitude: { type: 'number' },
    name: { type: 'string', nullable: true },
    address: { type: 'string', nullable: true },
    category: { type: 'string', nullable: true }
  }
} as const;
