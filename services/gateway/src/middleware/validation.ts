/**
 * Validation Middleware - Zod-based request validation for Fastify
 *
 * CVE-006 Fix: Provides type-safe validation middleware that returns
 * detailed error messages for invalid requests
 */

import { FastifyRequest, FastifyReply } from 'fastify';
import { z, ZodError } from 'zod';
import { logger } from '../utils/logger.js';

/**
 * Creates a validation middleware for Fastify routes
 *
 * @param schema - Zod schema with optional body, params, query, and headers fields
 * @returns Fastify preValidation handler
 */
export function createValidationMiddleware(schema: z.ZodType<any>) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      // Build validation input from request
      const validationInput: any = {};

      if (request.body) {
        validationInput.body = request.body;
      }
      if (request.params) {
        validationInput.params = request.params;
      }
      if (request.query) {
        validationInput.query = request.query;
      }
      if (request.headers) {
        validationInput.headers = request.headers;
      }

      // Validate against schema
      await schema.parseAsync(validationInput);
    } catch (error) {
      if (error instanceof ZodError) {
        // Format Zod errors into user-friendly messages
        const errors = error.errors.map((err) => ({
          field: err.path.join('.'),
          message: err.message,
          code: err.code
        }));

        logger.warn('Validation error', {
          path: request.url,
          method: request.method,
          errors
        });

        return reply.status(400).send({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Request validation failed',
            details: errors
          }
        });
      }

      // Re-throw non-Zod errors
      throw error;
    }
  };
}

/**
 * Validates Socket.IO event data against a schema
 *
 * @param schema - Zod schema for the event data
 * @param data - Event data to validate
 * @returns Validation result with parsed data or error
 */
export function validateSocketEvent<T>(
  schema: z.ZodType<T>,
  data: unknown
): { success: true; data: T } | { success: false; error: string; details?: any[] } {
  try {
    const parsed = schema.parse(data);
    return { success: true, data: parsed };
  } catch (error) {
    if (error instanceof ZodError) {
      const details = error.errors.map((err) => ({
        field: err.path.join('.'),
        message: err.message,
        code: err.code
      }));

      return {
        success: false,
        error: `Validation failed: ${error.errors[0]?.message || 'Invalid data'}`,
        details
      };
    }

    return {
      success: false,
      error: 'Validation failed: Unknown error'
    };
  }
}
