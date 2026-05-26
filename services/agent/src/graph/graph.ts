import { StateGraph, START, END } from '@langchain/langgraph';
import { ConversationStateAnnotation } from './state';
import { createObserverNode } from '../agents/observer';
import { createStrategistNode, type StrategistDependencies } from '../agents/strategist';
import { createGeneratorNode } from '../agents/generator';
import { createQualityGateNode } from '../agents/quality-gate';
import { traceNode, type TracerRef } from '../tracing/traced-node';
import type { LlmProvider } from '../llm/types';

export type { TracerRef } from '../tracing/traced-node';

export function buildAgentGraph(
  llm: LlmProvider,
  tracerRef: TracerRef = { current: null },
  strategistDeps?: StrategistDependencies,
) {
  const graph = new StateGraph(ConversationStateAnnotation)
    .addNode('observe', traceNode('observe', createObserverNode(llm), tracerRef))
    .addNode('strategist', traceNode('strategist', createStrategistNode(llm, strategistDeps), tracerRef))
    .addNode('generator', traceNode('generator', createGeneratorNode(llm), tracerRef))
    .addNode('qualityGate', traceNode('qualityGate', createQualityGateNode(llm), tracerRef))
    .addEdge(START, 'observe')
    .addEdge('observe', 'strategist')
    .addEdge('strategist', 'generator')
    .addEdge('generator', 'qualityGate')
    .addEdge('qualityGate', END);

  return graph.compile();
}
