/**
 * Stub for @meeshy/shared/prisma/client in test environments where
 * `prisma generate` has not been run (no .prisma/client generated).
 *
 * CI generates the real client via `pnpm run generate` before tests.
 * This stub lets the TypeScript compiler and Jest runtime resolve the module
 * without requiring the generated Prisma client.
 *
 * Tests that use Prisma always mock it with jest.mock('@meeshy/shared/prisma/client', ...)
 * so this stub's runtime exports are never used directly.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export class PrismaClient {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
}

// Enum stubs that some services reference
export const Prisma = {
  PrismaClientKnownRequestError: class extends Error {
    code: string;
    constructor(message: string, opts: { code: string; clientVersion: string }) {
      super(message);
      this.code = opts.code;
    }
  },
  PrismaClientValidationError: class extends Error {},
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
} as any;
