/**
 * Chat/tutor types
 */

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: string; // ISO timestamp
  corrections?: MessageCorrection[];
}

export interface MessageCorrection {
  original: string;
  corrected: string;
  explanation: string;
  category: string;
}

export interface ConversationSummary {
  topic: string;
  keyPoints: string[];
  mistakesMade: string[];
  timestamp: string; // ISO timestamp
}

export interface ConversationState {
  messages: ChatMessage[];
  currentSummary?: ConversationSummary;
}
