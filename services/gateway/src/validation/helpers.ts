import { z } from 'zod';

/**
 * Creates a Fastify pre-handler for validating request data
 *
 * @param schema - Zod schema to validate against
 * @param source - Where to find the data ('body' | 'query' | 'params')
 * @returns Fastify request handler
 */
export function createValidator(
  schema: z.ZodSchema,
  source: 'body' | 'query' | 'params'
) {
  return async (request: any, reply: any) => {
    try {
      const dataToValidate = request[source];
      const validated = await schema.parseAsync(dataToValidate);

      // Replace request data with validated & sanitized data
      request[source] = validated;
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({
          success: false,
          message: 'Validation failed',
          errors: error.errors.map(err => ({
            field: err.path.join('.'),
            message: err.message,
            code: err.code
          }))
        });
      }

      // Unexpected error
      return reply.status(500).send({
        success: false,
        message: 'Validation error',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  };
}

/**
 * Validates request query parameters
 */
export const validateQuery = (schema: z.ZodSchema) => createValidator(schema, 'query');

/**
 * Validates request body
 */
export const validateBody = (schema: z.ZodSchema) => createValidator(schema, 'body');

/**
 * Validates request params
 */
export const validateParams = (schema: z.ZodSchema) => createValidator(schema, 'params');
