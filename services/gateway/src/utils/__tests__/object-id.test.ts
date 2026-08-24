import { assertValidObjectId } from '../object-id';

const VALID_OBJECT_ID = '507f1f77bcf86cd799439011';

describe('assertValidObjectId', () => {
  it('does not throw on a well-formed 24-char hex ObjectId', () => {
    expect(() => assertValidObjectId(VALID_OBJECT_ID, 'message')).not.toThrow();
  });

  it('throws on an empty id', () => {
    expect(() => assertValidObjectId('', 'message')).toThrow(
      'Invalid message ID format: '
    );
  });

  it('throws on a too-short id', () => {
    expect(() => assertValidObjectId('abc123', 'post')).toThrow(
      'Invalid post ID format: abc123'
    );
  });

  it('throws on a 24-char string containing a non-hex character, truncating to 20', () => {
    expect(() => assertValidObjectId('507f1f77bcf86cd79943901z', 'comment')).toThrow(
      'Invalid comment ID format: 507f1f77bcf86cd79943'
    );
  });

  it('interpolates the domain label into the thrown message', () => {
    expect(() => assertValidObjectId('nope', 'reaction')).toThrow(
      /^Invalid reaction ID format: nope$/
    );
  });

  it('truncates the offending id to 20 characters in the message', () => {
    const longInvalid = 'g'.repeat(40);
    let message = '';
    try {
      assertValidObjectId(longInvalid, 'message');
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toBe(`Invalid message ID format: ${'g'.repeat(20)}`);
  });
});
