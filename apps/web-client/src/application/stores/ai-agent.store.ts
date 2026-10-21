import { create } from 'zustand';
import type { ApiErrorBody, AskRequest, AskResponseData, IngestRequest, IngestResponseData } from '../../domain/contracts';
import { toApiErrorBody } from '../api-client-error';
import type { AiAgentApiPort } from '../ports';
import type { RequestStatus } from '../request-status';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
  response?: AskResponseData;
}

export interface AiAgentState {
  messages: ChatMessage[];
  lastResponse: AskResponseData | null;
  lastIngest: IngestResponseData | null;
  status: RequestStatus;
  error: ApiErrorBody | null;
}

export interface AiAgentActions {
  ask(req: AskRequest): Promise<AskResponseData>;
  ingest(req: IngestRequest): Promise<IngestResponseData>;
  clearConversation(): void;
  reset(): void;
}

export type AiAgentStore = AiAgentState & AiAgentActions;

const initialState: AiAgentState = {
  messages: [],
  lastResponse: null,
  lastIngest: null,
  status: 'idle',
  error: null,
};

let aiAgentPort: AiAgentApiPort | null = null;

export function bindAiAgentApi(port: AiAgentApiPort): void {
  aiAgentPort = port;
}

function getAiAgentApi(): AiAgentApiPort {
  if (!aiAgentPort) {
    throw new Error('AiAgentApiPort is not bound');
  }
  return aiAgentPort;
}

function createMessageId(): string {
  const random =
    typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `msg_${random}`;
}

export const useAiAgentStore = create<AiAgentStore>()((set, get) => ({
  ...initialState,
  async ask(req) {
    const userMessage: ChatMessage = {
      id: createMessageId(),
      role: 'user',
      content: req.question,
      createdAt: new Date().toISOString(),
    };
    set({
      status: 'loading',
      error: null,
      messages: [...get().messages, userMessage],
    });
    try {
      const data = await getAiAgentApi().ask(req);
      const assistantMessage: ChatMessage = {
        id: createMessageId(),
        role: 'assistant',
        content: data.answer,
        createdAt: new Date().toISOString(),
        response: data,
      };
      set({
        status: 'success',
        error: null,
        lastResponse: data,
        messages: [...get().messages, assistantMessage],
      });
      return data;
    } catch (error) {
      set({ status: 'error', error: toApiErrorBody(error) });
      throw error;
    }
  },
  async ingest(req) {
    set({ status: 'loading', error: null });
    try {
      const data = await getAiAgentApi().ingest(req);
      set({ status: 'success', error: null, lastIngest: data });
      return data;
    } catch (error) {
      set({ status: 'error', error: toApiErrorBody(error) });
      throw error;
    }
  },
  clearConversation() {
    set({ messages: [], lastResponse: null, status: 'idle', error: null });
  },
  reset() {
    set({ ...initialState });
  },
}));
