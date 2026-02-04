/**
 * User profile types
 */

export type EnglishLevel = "A1" | "A2" | "B1" | "B2" | "C1" | "C2";
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
  nativeLanguage: string; // 'es' for Spanish
  goals: LearningGoal[];
  weakAreas: WeakArea[];
  createdAt: string; // ISO timestamp
  lastActiveAt: string; // ISO timestamp
  streakDays: number;
}

export interface UserStats {
  totalExercises: number;
  correctAnswers: number;
  totalAnswers: number;
  accuracyByCategory: Record<WeakArea, { correct: number; total: number }>;
}

export const LEVELS: Record<EnglishLevel, string> = {
  A1: "Beginner",
  A2: "Elementary",
  B1: "Intermediate",
  B2: "Upper Intermediate",
  C1: "Advanced",
  C2: "Proficient",
};

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
