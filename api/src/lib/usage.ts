export type UsageFeature =
  | "tutor"
  | "quickChat"
  | "lessonChat"
  | "lessonExplanation"
  | "tutorQuestion";

export const FREE_LIMITS: Record<UsageFeature, number> = {
  tutor: 14,
  quickChat: 8,
  lessonChat: 14,
  lessonExplanation: 5,
  tutorQuestion: 3,
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
    trimmed === "tutorQuestion"
  ) {
    return trimmed;
  }
  return null;
}
