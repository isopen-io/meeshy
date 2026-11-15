import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, test } from 'bun:test';

import { useCaptionReveals } from '@/lib/calls/call-captions-unfold-store';

type Reveals = ReturnType<typeof useCaptionReveals>;

const readReveals = (callId: string): Reveals => {
  const seen: Reveals[] = [];
  function Probe() {
    seen.push(useCaptionReveals(callId, 'band'));
    return null;
  }
  renderToStaticMarkup(<Probe />);
  const [reveals] = seen;
  if (reveals === undefined) throw new Error('la sonde ne s’est pas rendue');
  return reveals;
};

describe('les phrases révélées ne traversent pas les témoins (#18596)', () => {
  test('un témoin révèle une phrase de l’appel « call-1 »', () => {
    readReveals('call-1').toggle('w-1');
    expect(readReveals('call-1').revealed.has('w-1')).toBe(true);
  });

  test('le témoin suivant trouve la même phrase du même appel repliée', () => {
    expect(readReveals('call-1').revealed.has('w-1')).toBe(false);
  });
});
