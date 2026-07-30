import { describe, it, expect } from '@jest/globals';
import fs from 'fs';
import path from 'path';

describe('ExpiredStoriesCleanupService — usages de sons', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'ExpiredStoriesCleanupService.ts'), 'utf-8');
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

  it('test_cleanup_purgesSoundUsage', () => {
    expect(code).toContain('soundUsage.deleteMany');
  });

  it('test_cleanup_usesAllPostIds_notJustStories', () => {
    const i = code.indexOf('soundUsage.deleteMany');
    expect(code.slice(i, i + 200)).toContain('allPostIds');
  });
});
