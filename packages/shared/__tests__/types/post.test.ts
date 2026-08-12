/**
 * post.ts is entirely TypeScript interfaces and type aliases — no executable
 * JavaScript is emitted. These tests verify the module loads without error
 * and that the import surface matches what consumers expect.
 */
import { describe, it, expect } from 'vitest';

describe('post types module', () => {
  it('loads without error and exports no runtime values', async () => {
    // Dynamic import to catch any circular-dependency or parse errors at run time
    const mod = await import('../../types/post.js');
    // All exports are TypeScript types/interfaces erased at compile time;
    // the module object itself should be defined but contain no enumerable keys.
    expect(mod).toBeDefined();
    const runtimeKeys = Object.keys(mod);
    expect(runtimeKeys).toHaveLength(0);
  });
});
