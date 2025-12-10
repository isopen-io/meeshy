import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { TranslationService } from '../services/TranslationService';
import { logError } from '../utils/logger';

// Schémas de validation
const TranslateRequestSchema = z.object({
  text: z.string().min(1).max(1000).optional(), // Optional si message_id est fourni
  source_language: z.string().min(2).max(5).optional(),
  target_language: z.string().min(2).max(5),
  model_type: z.enum(['basic', 'medium', 'premium']).optional(), // Optional car on peut le prédire automatiquement
  message_id: z.string().optional(), // ID du message pour retraduction
  conversation_id: z.string().optional() // ID de conversation pour nouveaux messages
}).refine((data) => {
  // Soit text est fourni, soit message_id est fourni
  return (data.text !== undefined && data.text.length > 0) || (data.message_id !== undefined);
}, {
  message: "Either 'text' or 'message_id' must be provided"
});

interface TranslateRequest {
  text?: string;
  sourceLanguage?: string;
  targetLanguage: string;
  modelType?: 'basic' | 'medium' | 'premium';
  messageId?: string;
  conversationId?: string;
}

interface TranslationResult {
  translated_text: string;
  source_language: string;
  target_language: string;
  original_text: string;
  model_used: string;
  confidence: number;
  processing_time: number;
  from_cache: boolean;
  cache_key?: string;
}

// Fonction pour prédire le type de modèle selon la taille du texte
function getPredictedModelType(textLength: number): 'basic' | 'medium' | 'premium' {
  if (textLength < 20) return 'basic';
  if (textLength <= 100) return 'medium';
  return 'premium';
}


export async function translationRoutes(fastify: FastifyInstance) {
  // Récupérer le service de traduction depuis les options
  const translationService = (fastify as any).translationService;
  
  if (!translationService) {
    throw new Error('TranslationService not provided to translation routes');
  }
  
  // Route principale de traduction
  fastify.post<{ Body: TranslateRequest }>('/translate-blocking', async (request: FastifyRequest<{ Body: TranslateRequest }>, reply: FastifyReply) => {
    try {
      const validatedData = TranslateRequestSchema.parse(request.body);
      
      
      const startTime = Date.now();
      
      let result: any;
      let messageId: string;
      
      // Gérer les deux cas : nouveau message vs retraduction
      if (validatedData.message_id) {
        // Cas 1: Retraduction d'un message existant
        
        // Récupérer le message depuis la base de données
        const existingMessage = await fastify.prisma.message.findUnique({
          where: { id: validatedData.message_id },
          include: {
            conversation: {
              include: {
                members: true
              }
            }
          }
        });
        
        
        if (!existingMessage) {
          return reply.status(404).send({
            success: false,
            error: 'Message not found'
          });
        }
        
        // Vérifier l'accès (optionnel, selon vos besoins)
        const userId = (request as any).user?.id;
        if (userId) {
          const hasAccess = existingMessage.conversation.members.some((member: any) => member.userId === userId);
          if (!hasAccess) {
            return reply.status(403).send({
              success: false,
              error: 'Access denied to this message'
            });
          }
        }
        
        // Utiliser le texte du message existant si pas fourni
        const messageText = validatedData.text || existingMessage.content;
        const messageSourceLanguage = validatedData.source_language || existingMessage.originalLanguage;
        
        // OPTIMISATION: Éviter la traduction si source = target (après récupération du message)
        if (messageSourceLanguage && messageSourceLanguage !== 'auto' && 
            messageSourceLanguage === validatedData.target_language) {
          return reply.send({
            success: true,
            data: {
              message_id: validatedData.message_id,
              translated_text: messageText,
              source_language: messageSourceLanguage,
              target_language: validatedData.target_language,
              confidence: 1.0,
              processing_time: 0,
              model: 'none', // Pas de traduction nécessaire
              timestamp: new Date().toISOString()
            }
          });
        }
        
        // Déterminer le type de modèle pour le texte récupéré
        const finalModelType = validatedData.model_type === 'basic'
          ? getPredictedModelType(messageText.length)
          : (validatedData.model_type || 'basic');
        
        // Créer les données du message pour retraduction
        const messageData: any = {
          id: validatedData.message_id,
          conversationId: existingMessage.conversationId,
          content: messageText,
          originalLanguage: messageSourceLanguage,
          targetLanguage: validatedData.target_language,
          modelType: finalModelType
        };
        
        // Appeler handleNewMessage qui gère la retraduction
        const handleResult = await translationService.handleNewMessage(messageData);
        messageId = handleResult.messageId;
        
        // Attendre la vraie traduction avec un timeout plus long
        let translationResult = null;
        const maxWaitTime = 10000; // 10 secondes
        const checkInterval = 500; // Vérifier toutes les 500ms
        let waitedTime = 0;
        
        while (!translationResult && waitedTime < maxWaitTime) {
          await new Promise(resolve => setTimeout(resolve, checkInterval));
          waitedTime += checkInterval;
          
          translationResult = await translationService.getTranslation(messageId, validatedData.target_language);
        }
        
        if (!translationResult) {
          // Fallback seulement si la traduction n'est pas disponible après le timeout
          result = {
            translatedText: `[${validatedData.target_language.toUpperCase()}] ${messageText}`,
            sourceLanguage: messageSourceLanguage,
            targetLanguage: validatedData.target_language,
            confidenceScore: 0.1,
            processingTime: 0.001,
            modelType: 'fallback'
          };
        } else {
          result = translationResult;
        }
        
      } else {
        // Cas 2: Nouveau message (comportement WebSocket)
        
        if (!validatedData.conversation_id) {
          return reply.status(400).send({
            success: false,
            error: 'conversation_id is required when message_id is not provided'
          });
        }
        
        // Déterminer le type de modèle pour le nouveau message
        const finalModelType = validatedData.model_type === 'basic'
          ? getPredictedModelType(validatedData.text.length)
          : (validatedData.model_type || 'basic');
        
        // Créer les données du message
        const messageData: any = {
          conversationId: validatedData.conversation_id,
          content: validatedData.text,
          originalLanguage: validatedData.source_language || 'auto',
          targetLanguage: validatedData.target_language, // Passer la langue cible
          modelType: finalModelType
        };
        
        // Appeler handleNewMessage qui gère le nouveau message
        const handleResult = await translationService.handleNewMessage(messageData);
        messageId = handleResult.messageId;
        
        // Attendre la vraie traduction avec un timeout plus long
        let translationResult2 = null;
        const maxWaitTime2 = 10000; // 10 secondes
        const checkInterval2 = 500; // Vérifier toutes les 500ms
        let waitedTime2 = 0;
        
        while (!translationResult2 && waitedTime2 < maxWaitTime2) {
          await new Promise(resolve => setTimeout(resolve, checkInterval2));
          waitedTime2 += checkInterval2;
          
          translationResult2 = await translationService.getTranslation(messageId, validatedData.target_language);
        }
        
        if (!translationResult2) {
          // Fallback seulement si la traduction n'est pas disponible après le timeout
          result = {
            translatedText: `[${validatedData.target_language.toUpperCase()}] ${validatedData.text}`,
            sourceLanguage: validatedData.source_language || 'auto',
            targetLanguage: validatedData.target_language,
            confidenceScore: 0.1,
            processingTime: 0.001,
            modelType: 'fallback'
          };
        } else {
          result = translationResult2;
        }
      }

      const processingTime = (Date.now() - startTime) / 1000;


      return {
        success: true,
        data: {
          message_id: messageId,
          translated_text: result.translatedText,
          original_text: validatedData.text,
          source_language: result.sourceLanguage,
          target_language: result.targetLanguage,
          confidence: result.confidenceScore,
          processing_time: processingTime,
          model: result.modelType || 'basic', // CORRECTION: Inclure le modèle utilisé
          timestamp: new Date().toISOString()
        }
      };

    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logError(request.log, 'Translation error:', error);
      
      // Extraction sécurisée des données de la requête
      const requestBody = request.body as Partial<{ 
        text: string; 
        source_language: string; 
        target_language: string; 
      }>;
      const fallbackTranslation = `[${requestBody.target_language?.toUpperCase() || 'XX'}] ${requestBody.text || 'Error'}`;
      
      return reply.status(200).send({
        success: true,
        data: {
          translated_text: fallbackTranslation,
          source_language: requestBody.source_language || 'auto',
          target_language: requestBody.target_language || 'en',
          original_text: requestBody.text || '',
          model: 'fallback', // CORRECTION: Utiliser 'model' au lieu de 'model_used'
          confidence: 0.1,
          processing_time: 0.001,
          from_cache: false,
          error: errorMessage,
          timestamp: new Date().toISOString()
        }
      });
    }
  });

  // Route pour obtenir les langues supportées
  fastify.get('/languages', async () => {
    return {
      success: true,
      data: {
        languages: [
          { code: 'fr', name: 'Français', flag: '🇫🇷' },
          { code: 'en', name: 'English', flag: '🇺🇸' },
          { code: 'es', name: 'Español', flag: '🇪🇸' },
          { code: 'de', name: 'Deutsch', flag: '🇩🇪' },
          { code: 'pt', name: 'Português', flag: '🇵🇹' },
          { code: 'zh', name: '中文', flag: '🇨🇳' },
          { code: 'ja', name: '日本語', flag: '🇯🇵' },
          { code: 'ar', name: 'العربية', flag: '🇸🇦' }
        ]
      }
    };
  });

  // Route pour détecter la langue
  fastify.post<{ Body: { text: string } }>('/detect-language', async (request: FastifyRequest<{ Body: { text: string } }>, reply: FastifyReply) => {
    try {
      const { text } = request.body;
      
      if (!text || text.length === 0) {
        return reply.status(400).send({
          success: false,
          error: 'Text is required'
        });
      }

      // Détection simple basée sur des patterns
      let detectedLanguage = 'en';
      let confidence = 0.5;

      // Détection basique par patterns
      if (/[àáâäçèéêëìíîïñòóôöùúûüÿ]/i.test(text)) {
        detectedLanguage = 'fr';
        confidence = 0.7;
      } else if (/[ñáéíóúü]/i.test(text)) {
        detectedLanguage = 'es';
        confidence = 0.7;
      } else if (/[äöüß]/i.test(text)) {
        detectedLanguage = 'de';
        confidence = 0.7;
      }

      return {
        success: true,
        data: {
          language: detectedLanguage,
          confidence: confidence,
          text: text
        }
      };

    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown language detection error';
      logError(request.log, 'Language detection error:', error);
      return reply.status(500).send({
        success: false,
        error: errorMessage
      });
    }
  });

  // Route de test pour le service de traduction
  fastify.get('/test', async () => {
    try {
      // Test avec un nouveau message (comportement WebSocket)
      const messageData: any = {
        conversationId: 'test-conversation',
        content: 'Hello world',
        originalLanguage: 'en'
      };
      
      const handleResult = await translationService.handleNewMessage(messageData);
      
      // Attendre un peu pour que la traduction soit traitée
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Récupérer le résultat de traduction
      const testResult = await translationService.getTranslation(handleResult.messageId, 'fr');
      
      if (!testResult) {
        return {
          success: false,
          message: 'Translation service test failed - no result available',
          message_id: handleResult.messageId
        };
      }

      return {
        success: true,
        message: 'Translation service is working',
        message_id: handleResult.messageId,
        test_result: {
          translated_text: testResult.translatedText,
          source_language: testResult.sourceLanguage,
          target_language: testResult.targetLanguage,
          model: testResult.modelType, // CORRECTION: Utiliser 'model' au lieu de 'model_used'
          confidence: testResult.confidenceScore
        }
      };

    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown translation test error';
      return {
        success: false,
        message: 'Translation service test failed',
        error: errorMessage
      };
    }
  });
}
