export type UsageFeature =
  | "tutor"
  | "quickChat"
  | "lessonChat"
  | "lessonExplanation"
  | "tutorQuestion"
  | "speaking";

export const FREE_LIMITS: Record<UsageFeature, number> = {
  tutor: 20,
  quickChat: 12,
  lessonChat: 20,
  lessonExplanation: 8,
  tutorQuestion: 5,
  speaking: 10,
};

export const FEATURE_HEADER = "X-Anglicus-Feature";

export function parseUsageFeature(value: string | null): UsageFeature | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (
    trimmed === "tutor" ||
    trimmed === "quickChat" ||
    trimmed === "lessonChat" ||
    trimmed === "lessonExplanation" ||
    trimmed === "tutorQuestion" ||
    trimmed === "speaking"
  ) {
    return trimmed;
  }
  return null;
}
