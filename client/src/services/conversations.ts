// ===== Athena chat conversation history API =====

import { api } from "./api";
import type { AthenaMessage, AthenaToolEvent } from "./athena";

export interface ConversationSummary {
  id: string;
  title: string;
  status: "active" | "archived";
  createdAt: string;
  updatedAt: string;
  lastMessageAt: string;
}

export interface ConversationMessage extends AthenaMessage {
  tools?: AthenaToolEvent[];
  timestamp?: string;
}

export interface Conversation extends ConversationSummary {
  messages: ConversationMessage[];
}

export const conversationsApi = {
  list: () =>
    api.get<{ conversations: ConversationSummary[] }>("/api/conversations"),

  get: (id: string) =>
    api.get<{ conversation: Conversation }>(`/api/conversations/${id}`),

  create: () =>
    api.post<{ conversation: Conversation }>("/api/conversations"),

  update: (id: string, data: { messages: ConversationMessage[]; title?: string }) =>
    api.put<{ conversation: Conversation }>(`/api/conversations/${id}`, data),

  generateTitle: (id: string) =>
    api.post<{ title: string }>(`/api/conversations/${id}/generate-title`),

  delete: (id: string) =>
    api.delete<{ ok: boolean }>(`/api/conversations/${id}`),

  archiveAll: () =>
    api.post<{ ok: boolean }>("/api/conversations/archive-all"),
};
