import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { BridgeReadingOutlet } from '../reading/bridge-reading-outlet';

/**
 * G-126 — la seule porte du débouché de lecture (contrat §5.1, C3).
 *
 * Une route, un verbe, et il est en lecture. Rien ici ne poste, ne met en file, ne planifie :
 * les verbes écrivants ne sont pas montés du tout, et une garde le vérifie. La gateway (G-127)
 * appelle cette route, intersecte la plage avec la fenêtre non lue du lecteur, et retombe sur
 * le pont déterministe quand la réponse est vide — une absence reste une absence.
 *
 * La route ne s'exécute que si on l'appelle : aucun scan, aucun abonnement, aucune horloge.
 */

// La règle ObjectId est INLINE ici, à dessein : ce chemin de lecture (G-126)
// prouve, via `non-writing-path.test.ts`, que sa clôture d'imports externes est
// EXACTEMENT `{zod, fastify}` — aucun client réseau, aucune base. Importer le
// SSOT `@meeshy/shared/utils/object-id` élargirait cette surface de confiance
// pour un dédoublonnage cosmétique ; on garde le littéral pour préserver la
// minimalité de la preuve. Le SSOT reste la source pour les routes SANS cette
// contrainte (voir `routes/config.ts`).
const paramsSchema = z.object({
  conversationId: z.string().regex(/^[0-9a-fA-F]{24}$/),
});

const querySchema = z.object({
  fromMessageId: z.string().min(1),
  toMessageId: z.string().min(1),
});

export async function readingRoutes(fastify: FastifyInstance, outlet: BridgeReadingOutlet) {
  fastify.get('/api/agent/conversations/:conversationId/range-summary', async (req, reply) => {
    const params = paramsSchema.safeParse(req.params);
    if (!params.success) {
      return reply.status(400).send({ success: false, message: 'Invalid conversationId' });
    }
    const query = querySchema.safeParse(req.query);
    if (!query.success) {
      return reply.status(400).send({ success: false, message: 'fromMessageId and toMessageId are required' });
    }

    const data = await outlet.readRangeSummary({
      conversationId: params.data.conversationId,
      fromMessageId: query.data.fromMessageId,
      toMessageId: query.data.toMessageId,
    });

    return { success: true, data };
  });
}
