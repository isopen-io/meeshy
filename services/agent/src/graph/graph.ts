import { StateGraph, START, END } from '@langchain/langgraph';
import { ConversationStateAnnotation } from './state';
import { routeDecision, routeQualityGate } from './router';
import { createObserverNode } from '../agents/observer';
import { createDecideNode } from '../agents/decide';
import { createImpersonatorNode } from '../agents/impersonator';
import { createAnimatorNode } from '../agents/animator';
import { createQualityGateNode } from '../agents/quality-gate';
import type { LlmProvider } from '../llm/types';

export function buildAgentGraph(llm: LlmProvider) {
  const graph = new StateGraph(ConversationStateAnnotation)
    .addNode('observe', createObserverNode(llm))
    .addNode('decide', createDecideNode())
    .addNode('impersonate', createImpersonatorNode(llm))
    .addNode('animate', createAnimatorNode(llm))
    .addNode('qualityGate', createQualityGateNode(llm))
    .addEdge(START, 'observe')
    .addEdge('observe', 'decide')
    .addConditionalEdges('decide', routeDecision, {
      impersonate: 'impersonate',
      animate: 'animate',
      skip: END,
    })
    .addEdge('impersonate', 'qualityGate')
    .addEdge('animate', 'qualityGate')
    .addConditionalEdges('qualityGate', routeQualityGate, {
      send: END,
      regenerate: 'animate',
    });

  return graph.compile();
}
