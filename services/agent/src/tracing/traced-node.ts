import type { ScanTracer } from './scan-tracer';

type NodeName = 'observe' | 'strategist' | 'generator' | 'qualityGate';
type NodeFn = (state: any) => Promise<Record<string, unknown>>;

export type TracerRef = { current: ScanTracer | null };

export function traceNode(name: NodeName, nodeFn: NodeFn, tracerRef: TracerRef): NodeFn {
  return async (state: any) => {
    const tracer = tracerRef.current;
    const start = Date.now();
    const result = await nodeFn(state);

    if (tracer && result) {
      const inputTokens = (result._traceInputTokens as number) ?? 0;
      const outputTokens = (result._traceOutputTokens as number) ?? 0;
      const model = (result._traceModel as string) ?? 'unknown';
      const extra = (result._traceExtra as Record<string, unknown>) ?? {};

      tracer.recordNode(name, {
        inputTokens,
        outputTokens,
        latencyMs: Date.now() - start,
        model,
        extra,
      });

      delete result._traceInputTokens;
      delete result._traceOutputTokens;
      delete result._traceModel;
      delete result._traceExtra;
    }

    return result;
  };
}
