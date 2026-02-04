/**
 * Mistake tracking types
 */

import type { WeakArea } from "./user.js";

export interface Mistake {
  id: string;
  timestamp: string; // ISO timestamp
  original: string;
  corrected: string;
  category: WeakArea;
  explanation?: string;
  exerciseId?: string;
}

export interface MistakeStats {
  category: WeakArea;
  total: number;
  correct: number;
  accuracy: number;
  lastMistakeAt?: string;
}

export interface MistakePattern {
  category: WeakArea;
  pattern: string;
  frequency: number;
  examples: string[];
}
