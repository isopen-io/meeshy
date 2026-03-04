import { StateGraph, START, END } from '@langchain/langgraph';
import { ConversationStateAnnotation } from './state';
import { routeDecision, routeQualityGate } from './router';
import type { LlmProvider } from '../llm/types';

export function buildAgentGraph(_llm: LlmProvider) {
  const observe = async (state: typeof ConversationStateAnnotation.State) => state;
  const decide = async (state: typeof ConversationStateAnnotation.State) => state;
  const impersonate = async (state: typeof ConversationStateAnnotation.State) => state;
  const animate = async (state: typeof ConversationStateAnnotation.State) => state;
  const qualityGate = async (state: typeof ConversationStateAnnotation.State) => state;

  const graph = new StateGraph(ConversationStateAnnotation)
    .addNode('observe', observe)
    .addNode('decide', decide)
    .addNode('impersonate', impersonate)
    .addNode('animate', animate)
    .addNode('qualityGate', qualityGate)
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
