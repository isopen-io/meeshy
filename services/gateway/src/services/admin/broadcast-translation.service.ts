import axios from 'axios';
import { enhancedLogger } from '../../utils/logger-enhanced';

const logger = enhancedLogger.child({ module: 'BroadcastTranslationService' });

interface TranslationRequest {
  text: string;
  source_language: string;
  target_language: string;
  model_type: string;
}

interface TranslationResult {
  subjects: Record<string, string>;
  bodies: Record<string, string>;
}

export class BroadcastTranslationService {
  private ML_API_URL: string;

  constructor() {
    this.ML_API_URL = process.env.ML_API_URL || 'http://translator:8000';
  }

  async translateContent(
    subject: string,
    body: string,
    sourceLanguage: string,
    targetLanguages: string[]
  ): Promise<TranslationResult> {
    const subjects: Record<string, string> = { [sourceLanguage]: subject };
    const bodies: Record<string, string> = { [sourceLanguage]: body };

    // Filter out source language
    const langsToTranslate = targetLanguages.filter(l => l !== sourceLanguage);

    if (langsToTranslate.length === 0) {
      return { subjects, bodies };
    }

    // Build batch requests (max 10 per batch = 5 languages per batch since 2 texts each)
    const BATCH_SIZE = 5;
    for (let i = 0; i < langsToTranslate.length; i += BATCH_SIZE) {
      const batch = langsToTranslate.slice(i, i + BATCH_SIZE);
      const requests: TranslationRequest[] = [];

      for (const targetLang of batch) {
        // Subject with medium model
        requests.push({
          text: subject,
          source_language: sourceLanguage,
          target_language: targetLang,
          model_type: 'medium',
        });
        // Body with premium model
        requests.push({
          text: body,
          source_language: sourceLanguage,
          target_language: targetLang,
          model_type: 'premium',
        });
      }

      try {
        const response = await axios.post(
          `${this.ML_API_URL}/translate/batch`,
          requests,
          { timeout: 30000 }
        );

        const results = response.data;
        if (Array.isArray(results)) {
          let idx = 0;
          for (const targetLang of batch) {
            if (results[idx]?.translated_text) {
              subjects[targetLang] = results[idx].translated_text;
            }
            idx++;
            if (results[idx]?.translated_text) {
              bodies[targetLang] = results[idx].translated_text;
            }
            idx++;
          }
        }
      } catch (error) {
        logger.warn(`Batch translation failed, retrying individually for batch starting at ${i}`);
        // Retry individually
        for (const targetLang of batch) {
          try {
            const [subjectRes, bodyRes] = await Promise.all([
              axios.post(`${this.ML_API_URL}/translate`, {
                text: subject,
                source_language: sourceLanguage,
                target_language: targetLang,
                model_type: 'medium',
              }, { timeout: 30000 }),
              axios.post(`${this.ML_API_URL}/translate`, {
                text: body,
                source_language: sourceLanguage,
                target_language: targetLang,
                model_type: 'premium',
              }, { timeout: 30000 }),
            ]);
            if (subjectRes.data?.translated_text) {
              subjects[targetLang] = subjectRes.data.translated_text;
            }
            if (bodyRes.data?.translated_text) {
              bodies[targetLang] = bodyRes.data.translated_text;
            }
          } catch (retryError) {
            const msg = retryError instanceof Error ? retryError.message : 'Unknown error';
            logger.error(`Translation failed for ${targetLang}: ${msg}`);
          }
        }
      }
    }

    return { subjects, bodies };
  }
}
