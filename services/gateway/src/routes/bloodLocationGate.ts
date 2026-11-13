/**
 * La PORTE du drapeau de la position du Sang (#13937) : éteint, une route répond exactement
 * comme une route qui n'existe pas (404 générique, aucun code propre) — rien ne dit à un
 * compte hors liste blanche que la fonction existe.
 */
import type { FastifyReply, FastifyRequest } from 'fastify';
import { bloodLocationEnabledFor } from '../services/bloodLocation/bloodLocationFlag';
import { sendNotFound } from '../utils/response';

export async function bloodLocationGate(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const userId = request.user?.userId;
  if (userId && bloodLocationEnabledFor(userId)) return;
  sendNotFound(reply, 'Route not found');
  await reply;
}
