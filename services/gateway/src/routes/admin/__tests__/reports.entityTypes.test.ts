import { describe, it, expect } from '@jest/globals';
import fs from 'fs';
import path from 'path';

/** iOS envoie "post" et "story" depuis de vrais boutons (ReportService.swift:43, :53) ;
 *  l'enum ne les acceptait pas — ces appels partaient en 400 systématique. */
describe('routes/admin/reports.ts — types signalables', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'reports.ts'), 'utf-8');
  const line = source.split('\n').find((l) => l.includes('reportedType: z.enum'));

  it.each(['post', 'story', 'sound'])('test_createReportSchema_accepts_%s', (type) => {
    expect(line).toBeDefined();
    expect(line).toContain(`'${type}'`);
  });
});
