import { describe, it, expect } from 'vitest';
import { CommonSchemas, validateSchema, containsEmoji } from '../../utils/validation';
import { ErrorCode } from '../../types/errors';

describe('Validation Utils', () => {
  describe('containsEmoji', () => {
    it('should detect emojis', () => {
      expect(containsEmoji('Hello 🚀')).toBe(true);
      expect(containsEmoji('😀')).toBe(true);
      expect(containsEmoji('Hello')).toBe(false);
    });
  });

  describe('validateSchema', () => {
    it('should return data for valid schema', () => {
      const schema = CommonSchemas.mongoId;
      const data = '507f1f77bcf86cd799439011';
      expect(validateSchema(schema, data)).toBe(data);
    });

    it('should throw ErrorCode.VALIDATION_ERROR for invalid data', () => {
      const schema = CommonSchemas.mongoId;
      const data = 'invalid-id';
      try {
        validateSchema(schema, data);
        expect.fail('Should have thrown');
      } catch (error: any) {
        expect(error.code).toBe(ErrorCode.VALIDATION_ERROR);
        expect(error.details.errors).toBeDefined();
      }
    });
  });

  describe('CommonSchemas', () => {
    it('pagination should transform strings to numbers', () => {
      const result = CommonSchemas.pagination.parse({ limit: '10', offset: '5' });
      expect(result).toEqual({ limit: 10, offset: 5 });
    });

    it('pagination should use defaults', () => {
      const result = CommonSchemas.pagination.parse({});
      expect(result).toEqual({ limit: 20, offset: 0 });
    });

    it('mongoId should validate correct format', () => {
      expect(CommonSchemas.mongoId.safeParse('507f1f77bcf86cd799439011').success).toBe(true);
      expect(CommonSchemas.mongoId.safeParse('short').success).toBe(false);
    });

    it('language should validate correct format', () => {
      expect(CommonSchemas.language.safeParse('fr').success).toBe(true);
      expect(CommonSchemas.language.safeParse('en-US').success).toBe(true);
      expect(CommonSchemas.language.safeParse('f').success).toBe(false);
    });

    it('username should validate correct format', () => {
      expect(CommonSchemas.username.safeParse('user_123').success).toBe(true);
      expect(CommonSchemas.username.safeParse('us').success).toBe(false);
      expect(CommonSchemas.username.safeParse('invalid space').success).toBe(false);
    });
  });
});
