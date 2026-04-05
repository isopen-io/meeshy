import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import type { RedisDeliveryQueue } from '../delivery/redis-delivery-queue';

const editBodySchema = z.object({
  content: z.string().min(1).max(5000),
});

export async function deliveryRoutes(fastify: FastifyInstance, deliveryQueue: RedisDeliveryQueue) {
  fastify.get('/api/agent/delivery-queue', async (req: FastifyRequest) => {
    const { conversationId } = req.query as { conversationId?: string };

    const items = conversationId
      ? await deliveryQueue.getByConversation(conversationId)
      : await deliveryQueue.getAll();

    return { success: true, data: items };
  });

  fastify.delete('/api/agent/delivery-queue/:id', async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string };

    const deleted = await deliveryQueue.deleteById(id);
    if (!deleted) {
      return reply.status(404).send({
        success: false,
        message: 'Item not found or already delivered',
      });
    }

    return { success: true, data: { deleted: true } };
  });

  fastify.patch('/api/agent/delivery-queue/:id', async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string };

    const parsed = editBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({
        success: false,
        message: parsed.error.issues.map((i) => i.message).join(', '),
      });
    }

    const updated = await deliveryQueue.editMessageById(id, parsed.data.content);
    if (!updated) {
      return reply.status(404).send({
        success: false,
        message: 'Item not found, already delivered, or is a reaction (not editable)',
      });
    }

    return { success: true, data: updated };
  });
}
