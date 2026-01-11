/**
 * Tests for Validation Utilities
 */
import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import {
  validateSchema,
  CommonSchemas,
  ConversationSchemas,
  containsEmoji,
  zeroizeBuffer,
  copyAndZeroize,
  ApiResponseSchemas,
  UserSchemas,
} from '../utils/validation';
import { ErrorCode } from '../types/errors';
import { MeeshyError } from '../utils/errors';

describe('validateSchema', () => {
  const testSchema = z.object({
    name: z.string().min(1),
    age: z.number().positive(),
  });

  it('should return validated data for valid input', () => {
    const input = { name: 'John', age: 25 };
    const result = validateSchema(testSchema, input);
    expect(result).toEqual(input);
  });

  it('should throw MeeshyError for invalid input', () => {
    const input = { name: '', age: -5 };
    expect(() => validateSchema(testSchema, input)).toThrow(MeeshyError);
  });

  it('should include validation errors in details', () => {
    const input = { name: '', age: 25 };
    try {
      validateSchema(testSchema, input);
    } catch (error) {
      if (error instanceof MeeshyError) {
        expect(error.code).toBe(ErrorCode.VALIDATION_ERROR);
        expect(error.details?.errors).toBeDefined();
        expect(Array.isArray(error.details?.errors)).toBe(true);
      }
    }
  });

  it('should include context in error details', () => {
    const input = { name: '', age: 25 };
    try {
      validateSchema(testSchema, input, 'user-creation');
    } catch (error) {
      if (error instanceof MeeshyError) {
        expect(error.details?.context).toBe('user-creation');
      }
    }
  });
});

describe('CommonSchemas', () => {
  describe('pagination', () => {
    it('should parse with default values', () => {
      const result = CommonSchemas.pagination.parse({});
      expect(result.limit).toBe(20);
      expect(result.offset).toBe(0);
    });

    it('should parse provided values', () => {
      const result = CommonSchemas.pagination.parse({ limit: '50', offset: '100' });
      expect(result.limit).toBe(50);
      expect(result.offset).toBe(100);
    });
  });

  describe('messagePagination', () => {
    it('should parse with default values', () => {
      const result = CommonSchemas.messagePagination.parse({});
      expect(result.limit).toBe(20);
      expect(result.offset).toBe(0);
    });

    it('should accept optional before parameter', () => {
      const result = CommonSchemas.messagePagination.parse({ before: '507f1f77bcf86cd799439011' });
      expect(result.before).toBe('507f1f77bcf86cd799439011');
    });
  });

  describe('mongoId', () => {
    it('should accept valid MongoDB ObjectId', () => {
      expect(CommonSchemas.mongoId.parse('507f1f77bcf86cd799439011')).toBe('507f1f77bcf86cd799439011');
    });

    it('should reject invalid ObjectId', () => {
      expect(() => CommonSchemas.mongoId.parse('invalid')).toThrow();
      expect(() => CommonSchemas.mongoId.parse('12345')).toThrow();
      expect(() => CommonSchemas.mongoId.parse('507f1f77bcf86cd79943901g')).toThrow();
    });
  });

  describe('language', () => {
    it('should accept valid language codes', () => {
      expect(CommonSchemas.language.parse('en')).toBe('en');
      expect(CommonSchemas.language.parse('fr')).toBe('fr');
      expect(CommonSchemas.language.parse('en-US')).toBe('en-US');
    });

    it('should reject invalid language codes', () => {
      expect(() => CommonSchemas.language.parse('e')).toThrow();
      expect(() => CommonSchemas.language.parse('english')).toThrow();
    });
  });

  describe('conversationType', () => {
    it('should accept valid conversation types', () => {
      expect(CommonSchemas.conversationType.parse('direct')).toBe('direct');
      expect(CommonSchemas.conversationType.parse('group')).toBe('group');
      expect(CommonSchemas.conversationType.parse('public')).toBe('public');
      expect(CommonSchemas.conversationType.parse('global')).toBe('global');
    });

    it('should reject invalid conversation types', () => {
      expect(() => CommonSchemas.conversationType.parse('invalid')).toThrow();
    });
  });

  describe('messageType', () => {
    it('should accept valid message types', () => {
      expect(CommonSchemas.messageType.parse('text')).toBe('text');
      expect(CommonSchemas.messageType.parse('image')).toBe('image');
      expect(CommonSchemas.messageType.parse('file')).toBe('file');
      expect(CommonSchemas.messageType.parse('system')).toBe('system');
    });

    it('should reject invalid message types', () => {
      expect(() => CommonSchemas.messageType.parse('invalid')).toThrow();
    });
  });

  describe('messageContent', () => {
    it('should accept valid message content', () => {
      expect(CommonSchemas.messageContent.parse('Hello')).toBe('Hello');
    });

    it('should reject empty message', () => {
      expect(() => CommonSchemas.messageContent.parse('')).toThrow();
    });

    it('should reject too long message', () => {
      const longMessage = 'a'.repeat(10001);
      expect(() => CommonSchemas.messageContent.parse(longMessage)).toThrow();
    });
  });

  describe('conversationTitle', () => {
    it('should accept valid title', () => {
      expect(CommonSchemas.conversationTitle.parse('My Chat')).toBe('My Chat');
    });

    it('should reject empty title', () => {
      expect(() => CommonSchemas.conversationTitle.parse('')).toThrow();
    });

    it('should reject too long title', () => {
      const longTitle = 'a'.repeat(101);
      expect(() => CommonSchemas.conversationTitle.parse(longTitle)).toThrow();
    });
  });

  describe('description', () => {
    it('should accept valid description', () => {
      expect(CommonSchemas.description.parse('A group for friends')).toBe('A group for friends');
    });

    it('should accept undefined', () => {
      expect(CommonSchemas.description.parse(undefined)).toBeUndefined();
    });

    it('should reject too long description', () => {
      const longDesc = 'a'.repeat(501);
      expect(() => CommonSchemas.description.parse(longDesc)).toThrow();
    });
  });

  describe('email', () => {
    it('should accept valid email', () => {
      expect(CommonSchemas.email.parse('user@example.com')).toBe('user@example.com');
    });

    it('should reject invalid email', () => {
      expect(() => CommonSchemas.email.parse('invalid')).toThrow();
      expect(() => CommonSchemas.email.parse('user@')).toThrow();
    });
  });

  describe('username', () => {
    it('should accept valid username', () => {
      expect(CommonSchemas.username.parse('john_doe')).toBe('john_doe');
      expect(CommonSchemas.username.parse('user-123')).toBe('user-123');
    });

    it('should reject too short username', () => {
      expect(() => CommonSchemas.username.parse('ab')).toThrow();
    });

    it('should reject too long username', () => {
      const longUsername = 'a'.repeat(31);
      expect(() => CommonSchemas.username.parse(longUsername)).toThrow();
    });

    it('should reject invalid characters', () => {
      expect(() => CommonSchemas.username.parse('user@name')).toThrow();
      expect(() => CommonSchemas.username.parse('user name')).toThrow();
    });
  });

  describe('conversationIdentifier', () => {
    it('should accept valid identifier', () => {
      expect(CommonSchemas.conversationIdentifier.parse('my-chat-123')).toBe('my-chat-123');
      expect(CommonSchemas.conversationIdentifier.parse('chat_room')).toBe('chat_room');
      expect(CommonSchemas.conversationIdentifier.parse('user@chat')).toBe('user@chat');
    });

    it('should accept undefined', () => {
      expect(CommonSchemas.conversationIdentifier.parse(undefined)).toBeUndefined();
    });

    it('should reject invalid characters', () => {
      expect(() => CommonSchemas.conversationIdentifier.parse('chat room')).toThrow();
      expect(() => CommonSchemas.conversationIdentifier.parse('chat#room')).toThrow();
    });

    it('should reject too long identifier', () => {
      const longId = 'a'.repeat(51);
      expect(() => CommonSchemas.conversationIdentifier.parse(longId)).toThrow();
    });
  });
});

describe('ConversationSchemas', () => {
  describe('create', () => {
    it('should accept valid conversation creation', () => {
      const result = ConversationSchemas.create.parse({
        type: 'group',
        title: 'My Group',
        description: 'A test group',
      });
      expect(result.type).toBe('group');
      expect(result.title).toBe('My Group');
      expect(result.participantIds).toEqual([]);
    });

    it('should use default participantIds', () => {
      const result = ConversationSchemas.create.parse({ type: 'direct' });
      expect(result.participantIds).toEqual([]);
    });
  });

  describe('update', () => {
    it('should accept valid update', () => {
      const result = ConversationSchemas.update.parse({ title: 'New Title' });
      expect(result.title).toBe('New Title');
    });

    it('should reject empty update', () => {
      expect(() => ConversationSchemas.update.parse({})).toThrow();
    });
  });

  describe('sendMessage', () => {
    it('should accept valid message', () => {
      const result = ConversationSchemas.sendMessage.parse({
        content: 'Hello world',
      });
      expect(result.content).toBe('Hello world');
      expect(result.originalLanguage).toBe('fr');
      expect(result.messageType).toBe('text');
    });

    it('should accept message with all options', () => {
      const result = ConversationSchemas.sendMessage.parse({
        content: 'Hello',
        originalLanguage: 'en',
        messageType: 'text',
        replyToId: '507f1f77bcf86cd799439011',
      });
      expect(result.originalLanguage).toBe('en');
      expect(result.replyToId).toBe('507f1f77bcf86cd799439011');
    });
  });

  describe('editMessage', () => {
    it('should accept valid edit', () => {
      const result = ConversationSchemas.editMessage.parse({
        content: 'Updated message',
      });
      expect(result.content).toBe('Updated message');
    });

    it('should accept edit with language', () => {
      const result = ConversationSchemas.editMessage.parse({
        content: 'Updated',
        originalLanguage: 'en',
      });
      expect(result.originalLanguage).toBe('en');
    });
  });

  describe('addParticipant', () => {
    it('should accept valid userId', () => {
      const result = ConversationSchemas.addParticipant.parse({
        userId: '507f1f77bcf86cd799439011',
      });
      expect(result.userId).toBe('507f1f77bcf86cd799439011');
    });

    it('should reject empty userId', () => {
      expect(() => ConversationSchemas.addParticipant.parse({ userId: '' })).toThrow();
    });
  });

  describe('search', () => {
    it('should accept valid search query', () => {
      const result = ConversationSchemas.search.parse({ q: 'hello' });
      expect(result.q).toBe('hello');
    });

    it('should reject empty query', () => {
      expect(() => ConversationSchemas.search.parse({ q: '' })).toThrow();
    });
  });

  describe('participantsFilters', () => {
    it('should parse with defaults', () => {
      const result = ConversationSchemas.participantsFilters.parse({});
      expect(result.limit).toBe(50);
    });

    it('should accept all filter options', () => {
      const result = ConversationSchemas.participantsFilters.parse({
        onlineOnly: 'true',
        role: 'admin',
        search: 'john',
        limit: '100',
      });
      expect(result.onlineOnly).toBe('true');
      expect(result.role).toBe('admin');
      expect(result.search).toBe('john');
      expect(result.limit).toBe(100);
    });
  });
});

describe('containsEmoji', () => {
  it('should return true for text containing emojis', () => {
    expect(containsEmoji('Hello 😀')).toBe(true);
    expect(containsEmoji('🎉 Party!')).toBe(true);
    expect(containsEmoji('Test 👍 approved')).toBe(true);
  });

  it('should return false for text without emojis', () => {
    expect(containsEmoji('Hello World')).toBe(false);
    expect(containsEmoji('Just text')).toBe(false);
    expect(containsEmoji('')).toBe(false);
  });

  it('should detect various emoji types', () => {
    expect(containsEmoji('Flag: 🇫🇷')).toBe(true);
    expect(containsEmoji('Sun: ☀️')).toBe(true);
    expect(containsEmoji('Heart: ❤️')).toBe(true);
  });
});

describe('zeroizeBuffer', () => {
  it('should fill Buffer with zeros', () => {
    const buffer = Buffer.from([1, 2, 3, 4, 5]);
    zeroizeBuffer(buffer);
    expect(buffer.every(b => b === 0)).toBe(true);
  });

  it('should fill Uint8Array with zeros', () => {
    const array = new Uint8Array([10, 20, 30, 40]);
    zeroizeBuffer(array);
    expect(array.every(b => b === 0)).toBe(true);
  });

  it('should handle null safely', () => {
    expect(() => zeroizeBuffer(null)).not.toThrow();
  });

  it('should handle undefined safely', () => {
    expect(() => zeroizeBuffer(undefined)).not.toThrow();
  });

  it('should handle empty buffer', () => {
    const buffer = Buffer.alloc(0);
    expect(() => zeroizeBuffer(buffer)).not.toThrow();
  });
});

describe('copyAndZeroize', () => {
  it('should return a copy of the buffer', () => {
    const original = Buffer.from([1, 2, 3, 4, 5]);
    const copy = copyAndZeroize(original);

    expect(copy).toEqual(Buffer.from([1, 2, 3, 4, 5]));
  });

  it('should zeroize the original buffer', () => {
    const original = Buffer.from([1, 2, 3, 4, 5]);
    copyAndZeroize(original);

    expect(original.every(b => b === 0)).toBe(true);
  });

  it('should return independent copy', () => {
    const original = Buffer.from([10, 20, 30]);
    const copy = copyAndZeroize(original);

    // Original should be zeroed
    expect(original.every(b => b === 0)).toBe(true);
    // Copy should have the original values
    expect(copy[0]).toBe(10);
    expect(copy[1]).toBe(20);
    expect(copy[2]).toBe(30);
  });
});

describe('ApiResponseSchemas', () => {
  describe('success', () => {
    it('should create a success schema with custom data', () => {
      const userDataSchema = z.object({
        id: z.string(),
        name: z.string(),
      });

      const successSchema = ApiResponseSchemas.success(userDataSchema);

      const result = successSchema.parse({
        success: true,
        data: { id: '123', name: 'John' },
      });

      expect(result.success).toBe(true);
      expect(result.data.id).toBe('123');
      expect(result.data.name).toBe('John');
    });

    it('should reject invalid data structure', () => {
      const dataSchema = z.object({ value: z.number() });
      const successSchema = ApiResponseSchemas.success(dataSchema);

      expect(() => successSchema.parse({
        success: true,
        data: { value: 'not a number' },
      })).toThrow();
    });

    it('should reject when success is false', () => {
      const dataSchema = z.object({ value: z.number() });
      const successSchema = ApiResponseSchemas.success(dataSchema);

      expect(() => successSchema.parse({
        success: false,
        data: { value: 42 },
      })).toThrow();
    });
  });

  describe('paginatedList', () => {
    it('should create a paginated list schema with default items key', () => {
      const itemSchema = z.object({
        id: z.string(),
        title: z.string(),
      });

      const paginatedSchema = ApiResponseSchemas.paginatedList(itemSchema);

      const result = paginatedSchema.parse({
        success: true,
        data: {
          items: [
            { id: '1', title: 'First' },
            { id: '2', title: 'Second' },
          ],
          totalCount: 2,
          hasMore: false,
        },
      });

      expect(result.success).toBe(true);
      expect(result.data.items).toHaveLength(2);
      expect(result.data.totalCount).toBe(2);
    });

    it('should create a paginated list schema with custom items key', () => {
      const itemSchema = z.object({ name: z.string() });

      const paginatedSchema = ApiResponseSchemas.paginatedList(itemSchema, 'users');

      const result = paginatedSchema.parse({
        success: true,
        data: {
          users: [{ name: 'Alice' }, { name: 'Bob' }],
          totalCount: 2,
        },
      });

      expect(result.success).toBe(true);
      expect(result.data.users).toHaveLength(2);
    });

    it('should allow optional hasMore field', () => {
      const itemSchema = z.object({ id: z.string() });
      const paginatedSchema = ApiResponseSchemas.paginatedList(itemSchema);

      const result = paginatedSchema.parse({
        success: true,
        data: {
          items: [{ id: '1' }],
          totalCount: 1,
        },
      });

      expect(result.data.hasMore).toBeUndefined();
    });
  });

  describe('error', () => {
    it('should validate error response structure', () => {
      const result = ApiResponseSchemas.error.parse({
        success: false,
        error: 'Something went wrong',
        code: 'ERR_001',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Something went wrong');
      expect(result.code).toBe('ERR_001');
    });

    it('should accept error without code', () => {
      const result = ApiResponseSchemas.error.parse({
        success: false,
        error: 'Generic error',
      });

      expect(result.error).toBe('Generic error');
      expect(result.code).toBeUndefined();
    });

    it('should accept error with details', () => {
      const result = ApiResponseSchemas.error.parse({
        success: false,
        error: 'Validation failed',
        details: [
          { field: 'email', message: 'Invalid email' },
          { field: 'password', message: 'Too short' },
        ],
      });

      expect(result.details).toHaveLength(2);
      expect(result.details?.[0].field).toBe('email');
    });
  });
});
