/**
 * Miroir exact des cas de `ForwardTargetMergeTests` iOS
 * (apps/ios/MeeshyTests/Unit/Components/ForwardTargetMergeTests.swift).
 */

import { mergeForwardTargets, type ForwardTarget } from '@/lib/forward-target-merge';

function conv(id: string, opts: { userId?: string; title?: string } = {}): ForwardTarget {
  return {
    id: `conv:${id}`,
    kind: 'conversation',
    conversationId: id,
    userId: opts.userId,
    title: opts.title ?? 'C',
  };
}

function contact(userId: string, title = 'P'): ForwardTarget {
  return {
    id: `user:${userId}`,
    kind: 'contact',
    userId,
    title,
  };
}

describe('mergeForwardTargets', () => {
  it('garde les conversations en premier', () => {
    const out = mergeForwardTargets([conv('c1'), conv('c2')], [contact('u9')]);
    expect(out.map((t) => t.id)).toEqual(['conv:c1', 'conv:c2', 'user:u9']);
  });

  it('absorbe un contact déjà joint par une conversation directe', () => {
    const out = mergeForwardTargets([conv('c1', { userId: 'u1' })], [contact('u1'), contact('u2')]);
    expect(out.map((t) => t.id)).toEqual(['conv:c1', 'user:u2']);
  });

  it('déduplique une conversation répétée', () => {
    const out = mergeForwardTargets([conv('c1'), conv('c1')], []);
    expect(out.map((t) => t.id)).toEqual(['conv:c1']);
  });

  it("un groupe n'absorbe personne", () => {
    const out = mergeForwardTargets([conv('g1')], [contact('u1')]);
    expect(out.map((t) => t.id)).toEqual(['conv:g1', 'user:u1']);
  });
});
