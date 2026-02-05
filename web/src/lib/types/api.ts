/**
 * API client types
 */

export type ApiTier = "auto" | "backend" | "byok" | "puter";

export interface ApiConfig {
  tier: ApiTier;
  customBaseUrl?: string; // For BYOK
  apiKeyEncrypted?: string; // For BYOK - encrypted in storage
  model?: string; // Selected AI model
  cloudUnlocked?: boolean; // Cloud key access unlocked
}

export interface ChatCompletionRequest {
  model: string;
  messages: Array<{
    role: "system" | "user" | "assistant";
    content: string;
  }>;
  temperature?: number;
  max_tokens?: number;
  stream?: boolean;
}

export interface ChatCompletionResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export interface ApiError {
  error: {
    message: string;
    type: string;
    code?: string;
  };
}

// Chat message types (merged from chat.ts)
export interface Message {
  id?: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp?: string;
}

export type ChatMessage = Message;
