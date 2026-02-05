import { FastifyInstance } from 'fastify';
import { AuthService } from '../../services/AuthService';
import { PhoneTransferService } from '../../services/PhoneTransferService';
import { SmsService } from '../../services/SmsService';
import { getRedisWrapper } from '../../services/RedisWrapper';
import { AuthRouteContext } from './types';
import { registerLoginRoutes } from './login';
import { registerRegistrationRoutes } from './register';
import { registerMagicLinkRoutes } from './magic-link';
import { registerPhoneTransferRoutes } from './phone-transfer';

/**
 * Main entry point for all authentication routes
 * Initializes services and registers route modules
 */
export async function authRoutes(fastify: FastifyInstance) {
  // Initialize core authentication service
  const authService = new AuthService(
    (fastify as any).prisma,
    process.env.JWT_SECRET || 'meeshy-secret-key-dev'
  );

  // Use shared singleton instance to avoid multiple Redis connections
  const redisWrapper = getRedisWrapper();
  const smsService = new SmsService();

  // Initialize phone transfer service for registration flow
  const phoneTransferService = new PhoneTransferService(
    (fastify as any).prisma,
    redisWrapper,
    smsService
  );

  // Create shared context for all route modules
  const context: AuthRouteContext = {
    fastify,
    authService,
    phoneTransferService,
    smsService,
    redisWrapper,
    redis: (fastify as any).redis, // Keep for backward compatibility
    prisma: (fastify as any).prisma
  };

  // Register route modules
  registerLoginRoutes(context);
  registerRegistrationRoutes(context);
  registerMagicLinkRoutes(context);
  registerPhoneTransferRoutes(context);
}
