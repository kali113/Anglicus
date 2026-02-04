/**
 * Exercise types
 */

export type ExerciseType =
  | "multiple_choice"
  | "fill_blank"
  | "translation"
  | "sentence_order"
  | "error_correction";

export interface Exercise {
  id: string;
  type: ExerciseType;
  level: string; // A1-C2
  question: string;
  options?: string[];
  correctAnswer: string | string[];
  explanation?: string;
  weakArea?: string;
}

export interface MultipleChoiceExercise extends Exercise {
  type: "multiple_choice";
  options: string[];
  correctAnswer: string;
}

export interface FillBlankExercise extends Exercise {
  type: "fill_blank";
  question: string; // "I want ___ apple."
  correctAnswer: string;
}

export interface TranslationExercise extends Exercise {
  type: "translation";
  from: "es" | "en";
  to: "es" | "en";
  question: string; // source text
  correctAnswer: string;
}

export interface SentenceOrderExercise extends Exercise {
  type: "sentence_order";
  words: string[];
  correctAnswer: string[]; // ordered word indices
}

export interface ErrorCorrectionExercise extends Exercise {
  type: "error_correction";
  question: string; // sentence with error
  correctAnswer: string; // corrected sentence
  hint?: string;
}

export interface ExerciseResult {
  exerciseId: string;
  correct: boolean;
  userAnswer: string;
  timeSpent: number; // milliseconds
  attemptedAt: string; // ISO timestamp
}

export interface ExerciseSession {
  id: string;
  exercises: Exercise[];
  results: ExerciseResult[];
  startedAt: string;
  completedAt?: string;
}
