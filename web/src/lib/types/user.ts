/**
 * User profile types
 */

export type EnglishLevel = "A1" | "A2" | "B1" | "B2" | "C1" | "C2";
export type LanguageCode = "en" | "es";
export type LearningGoal = "travel" | "work" | "study" | "movies" | "general";
export type WeakArea =
  | "articles"
  | "present_perfect"
  | "past_tense"
  | "prepositions"
  | "false_friends"
  | "conditionals"
  | "phrasal_verbs";

export interface UserProfile {
  name: string;
  level: EnglishLevel;
  nativeLanguage: LanguageCode; // user's native language
  targetLanguage: LanguageCode; // language being learned
  goals: LearningGoal[];
  weakAreas: WeakArea[];
  createdAt: string; // ISO timestamp
  lastActiveAt: string; // ISO timestamp
  streakDays: number;
  totalXP: number;
  wordsLearned: number;
  weeklyActivity: number[]; // 7 values for Sun-Sat
  achievements: Achievement[];
  skills: SkillProgress[];
}

export interface SkillProgress {
  id: string;
  status: 'locked' | 'unlocked' | 'current' | 'completed';
  stars: number; // 0-3
}

export interface Achievement {
  id: string;
  name: string;
  icon: string;
  unlocked: boolean;
}

export interface UserStats {
  totalExercises: number;
  correctAnswers: number;
  totalAnswers: number;
  accuracyByCategory: Record<WeakArea, { correct: number; total: number }>;
}

export const LEVELS: Record<EnglishLevel, string> = {
  A1: "Principiante",
  A2: "Elemental",
  B1: "Intermedio",
  B2: "Intermedio Alto",
  C1: "Avanzado",
  C2: "Competente",
};

export const LANGUAGE_LABELS: Record<LanguageCode, Record<LanguageCode, string>> = {
  en: { en: "English", es: "Inglés" },
  es: { en: "Spanish", es: "Español" },
};

export function getLanguageLabel(
  language: LanguageCode,
  uiLanguage: LanguageCode,
): string {
  return LANGUAGE_LABELS[language][uiLanguage];
}

export const GOALS: Record<LearningGoal, string> = {
  travel: "Viajes",
  work: "Trabajo",
  study: "Estudios",
  movies: "Películas y música",
  general: "Mejora general",
};

export const WEAK_AREAS: Record<WeakArea, string> = {
  articles: "Artículos (the/a/an)",
  present_perfect: "Present Perfect",
  past_tense: "Pasados (past simple/continuous)",
  prepositions: "Preposiciones",
  false_friends: "Falsos amigos",
  conditionals: "Condicionales",
  phrasal_verbs: "Phrasal verbs",
};

// Mistake tracking types (merged from mistake.ts)
export interface Mistake {
  id: string;
  timestamp: string;
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
