import type { UIMessage } from 'ai';

import type { AgentId } from '@/lib/agents/types';
import type { RetrievalTrace } from '@/lib/rag/retrieve';

/**
 * Metadata attached to every assistant message.
 *
 * This is what powers the Prompt Inspector: the client never has to guess
 * which provider answered, whether a fallback fired, or what the retriever
 * actually pulled — the server states it on the message itself.
 */
export type CannonMetadata = {
  agent: AgentId;
  /** Ordered provider chain, primary first. */
  chain: string[];
  simulated: boolean;
  retrieval?: RetrievalTrace;
  fallbacks?: { from: string; to: string; stage: 'connect' | 'stream' }[];
  latencyMs?: number;
};

export type CannonUIMessage = UIMessage<CannonMetadata>;

export function messageText(message: UIMessage): string {
  return message.parts
    .filter((part): part is { type: 'text'; text: string } => part.type === 'text')
    .map((part) => part.text)
    .join('\n')
    .trim();
}

export function lastUserText(messages: UIMessage[]): string {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index].role === 'user') return messageText(messages[index]);
  }
  return '';
}
