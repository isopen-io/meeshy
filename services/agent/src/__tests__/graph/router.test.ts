import { routeDecision, routeQualityGate } from '../../graph/router';

describe('Graph Router', () => {
  it('routes based on decision field', () => {
    expect(routeDecision({ decision: 'animate' } as any)).toBe('animate');
    expect(routeDecision({ decision: 'skip' } as any)).toBe('skip');
    expect(routeDecision({ decision: 'impersonate' } as any)).toBe('impersonate');
  });

  it('sends when quality is sufficient', () => {
    const state = {
      pendingResponse: { metadata: { roleConfidence: 0.8 } },
    } as any;
    expect(routeQualityGate(state)).toBe('send');
  });

  it('regenerates when confidence is too low', () => {
    const state = {
      pendingResponse: { metadata: { roleConfidence: 0.3 } },
    } as any;
    expect(routeQualityGate(state)).toBe('regenerate');
  });

  it('regenerates when no response', () => {
    expect(routeQualityGate({ pendingResponse: null } as any)).toBe('regenerate');
  });
});
