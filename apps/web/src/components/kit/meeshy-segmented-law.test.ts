import { describe, expect, test } from 'bun:test';
import {
  partitionSegments,
  renderableOptions,
  nextSegmentIndex,
  tapChangesSelection,
} from './meeshy-segmented-law';

const vectors = {
  renderable: [
    { count: 1, expected: false },
    { count: 2, expected: true },
    { count: 3, expected: true },
    { count: 4, expected: true },
    { count: 5, expected: false },
  ],
  changes: [
    { current: null, target: 0, expected: true },
    { current: 2, target: 2, expected: false },
    { current: 2, target: 0, expected: true },
  ],
  keyboard: [
    { key: 'right', index: 0, count: 3, rtl: false, expected: 1 },
    { key: 'right', index: 2, count: 3, rtl: false, expected: 0 },
    { key: 'left', index: 0, count: 3, rtl: false, expected: 2 },
    { key: 'left', index: 2, count: 3, rtl: false, expected: 1 },
    { key: 'right', index: 1, count: 4, rtl: true, expected: 0 },
    { key: 'left', index: 1, count: 4, rtl: true, expected: 2 },
    { key: 'left', index: 0, count: 4, rtl: true, expected: 1 },
    { key: 'right', index: 0, count: 4, rtl: true, expected: 3 },
    { key: 'home', index: 2, count: 4, rtl: false, expected: 0 },
    { key: 'end', index: 1, count: 4, rtl: true, expected: 3 },
    { key: 'space', index: 1, count: 4, rtl: false, expected: null },
  ],
  partition: [
    { widths: [80, 80], available: 200, rows: [[100, 100]] },
    { widths: [60, 140, 60], available: 300, rows: [[80, 140, 80]] },
    { widths: [50, 50, 50, 50], available: 320, rows: [[80, 80, 80, 80]] },
    { widths: [120, 120, 120], available: 300, rows: [[150, 150], [300]] },
  ],
} as const;

const optionsOf = (count: number) =>
  Array.from({ length: count }, (_, index) => ({ id: index, title: `Option ${index}` }));

describe('MeeshySegmented law', () => {
  test.each(vectors.renderable)('renders only for 2 to 4 options ($count)', ({ count, expected }) => {
    expect(renderableOptions(optionsOf(count)).length > 0).toBe(expected);
  });

  test.each(vectors.changes)('tap from $current to $target changes selection only when not current', ({ current, target, expected }) => {
    expect(tapChangesSelection({ current, target, isEnabled: true })).toBe(expected);
  });

  test.each(vectors.keyboard)('$key from $index of $count (rtl $rtl) moves to $expected', ({ key, index, count, rtl, expected }) => {
    expect(nextSegmentIndex({ key, index, count, rtl })).toBe(expected);
  });

  test.each(vectors.partition)('partitions $widths into rows within $available', ({ widths, available, rows }) => {
    expect(partitionSegments({ widths, available })).toEqual(rows);
  });
});
