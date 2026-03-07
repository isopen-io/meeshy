import { StateGraph, START, END } from '@langchain/langgraph';
import { ConversationStateAnnotation } from './state';
import { createObserverNode } from '../agents/observer';
import { createStrategistNode } from '../agents/strategist';
import { createGeneratorNode } from '../agents/generator';
import { createQualityGateNode } from '../agents/quality-gate';
import type { LlmProvider } from '../llm/types';

export function buildAgentGraph(llm: LlmProvider) {
  const graph = new StateGraph(ConversationStateAnnotation)
    .addNode('observe', createObserverNode(llm))
    .addNode('strategist', createStrategistNode(llm))
    .addNode('generator', createGeneratorNode(llm))
    .addNode('qualityGate', createQualityGateNode(llm))
    .addEdge(START, 'observe')
    .addEdge('observe', 'strategist')
    .addEdge('strategist', 'generator')
    .addEdge('generator', 'qualityGate')
    .addEdge('qualityGate', END);

  return graph.compile();
}
