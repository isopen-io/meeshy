import { describe, expect, test } from 'bun:test';

import { MAX_DIRECT_UPLOAD_FILES, SMALL_FILE_THRESHOLD } from '@meeshy/shared/types/attachment';

import { uploadBatchesOf } from './upload-batches';

const MB = 1024 * 1024;

describe('uploadBatchesOf — un partage de 100 fichiers et 5 Go part en lots que la passerelle accepte (#12974)', () => {
  test('les bornes par défaut sont celles de la passerelle : 30 fichiers et 50 Mo par requête directe', () => {
    expect(MAX_DIRECT_UPLOAD_FILES).toBe(30);
    expect(SMALL_FILE_THRESHOLD).toBe(50 * MB);
  });

  test('cent petites photos : quatre requêtes directes de 30 au plus, dans l’ordre', () => {
    const batches = uploadBatchesOf(Array.from({ length: 100 }, () => 1 * MB));
    expect(batches.map((batch) => (batch.kind === 'direct' ? batch.indexes.length : -1))).toEqual([30, 30, 30, 10]);
    expect(batches.flatMap((batch) => (batch.kind === 'direct' ? batch.indexes : [batch.index]))).toEqual(Array.from({ length: 100 }, (_, i) => i));
  });

  test('une requête directe ne porte jamais plus de 50 Mo : la passerelle la tient entière en mémoire', () => {
    const batches = uploadBatchesOf([20 * MB, 20 * MB, 20 * MB, 5 * MB]);
    expect(batches).toEqual([
      { kind: 'direct', indexes: [0, 1] },
      { kind: 'direct', indexes: [2, 3] },
    ]);
  });

  test('un fichier de plus de 50 Mo part en reprise (TUS), seul, à son rang', () => {
    const batches = uploadBatchesOf([1 * MB, 2 * 1024 * MB, 1 * MB]);
    expect(batches).toEqual([
      { kind: 'direct', indexes: [0] },
      { kind: 'resumable', index: 1 },
      { kind: 'direct', indexes: [2] },
    ]);
  });

  test('aucun fichier : aucun lot', () => {
    expect(uploadBatchesOf([])).toEqual([]);
  });

  test('les bornes se passent en options', () => {
    expect(uploadBatchesOf([1, 1, 1], { maxFiles: 2, maxBytes: 10 })).toEqual([
      { kind: 'direct', indexes: [0, 1] },
      { kind: 'direct', indexes: [2] },
    ]);
    expect(uploadBatchesOf([11], { maxFiles: 2, maxBytes: 10 })).toEqual([{ kind: 'resumable', index: 0 }]);
  });
});
