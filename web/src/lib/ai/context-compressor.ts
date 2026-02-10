/**
 * Context compression for token-efficient AI requests
 * Builds compressed user context from profile and mistake history
 */

import type {
  UserProfile,
  WeakArea,
  LearningGoal,
  LanguageCode,
} from "$lib/types/user.js";
import { getLanguageLabel } from "$lib/types/user.js";
import type { ChatMessage } from "$lib/types/api.js";
import type { Mistake, MistakeStats } from "$lib/types/user.js";
import { getRecentMistakes, getMistakeStats } from "$lib/storage/index.js";

interface CompressedContext {
  summary: string;
  tokenEstimate: number;
}

/**
 * Build compressed user context for AI requests (~100-200 tokens)
 */
export async function buildUserContext(
  profile: UserProfile,
): Promise<CompressedContext> {
  const parts: string[] = [];

  // Basic user info (~30 tokens)
  parts.push(
    `[USER]\n` +
      `Name: ${profile.name}\n` +
      `Level: ${profile.level}\n` +
      `Goal: ${formatGoals(profile.goals, profile.targetLanguage)}\n` +
      `Streak: ${profile.streakDays} days\n`,
  );

  // Weak areas with accuracy (~40 tokens)
  const stats = await getMistakeStats();
  const weakAreasList = profile.weakAreas.map((area) => {
    const stat = stats.find((s: MistakeStats) => s.category === area);
    const accuracy =
      stat && stat.total > 0
        ? Math.round((stat.correct / stat.total) * 100)
        : null;
    return `- ${formatWeakArea(area)}${accuracy ? `: ${accuracy}% accuracy` : ""}`;
  });

  if (weakAreasList.length > 0) {
    parts.push(`[WEAK AREAS]\n${weakAreasList.join("\n")}\n`);
  }

  // Recent mistakes (~50 tokens)
  const recentMistakes = await getRecentMistakes(3);
  if (recentMistakes.length > 0) {
    const mistakes = recentMistakes.map(
      (m: Mistake) => `- "${m.original}" → "${m.corrected}"`,
    );
    parts.push(`[RECENT ERRORS]\n${mistakes.join("\n")}\n`);
  }

  const summary = parts.join("\n");
  const tokenEstimate = estimateTokens(summary);

  return { summary, tokenEstimate };
}

/**
 * Build compressed conversation context
 * Keeps last 5 exchanges, summarizes older ones
 */
export function buildConversationContext(
  messages: ChatMessage[],
  maxRecent = 5,
): CompressedContext {
  if (messages.length <= maxRecent) {
    const text = messages
      .map((m) => `${m.role.toUpperCase()}: ${m.content}`)
      .join("\n");
    return {
      summary: text,
      tokenEstimate: estimateTokens(text),
    };
  }

  // Keep recent messages
  const recent = messages.slice(-maxRecent);
  const older = messages.slice(0, -maxRecent);

  let summary = "[CONVERSATION SUMMARY]\n";

  // Build brief summary of older messages
  if (older.length > 0) {
    const topics = older
      .filter((m) => m.role === "user")
      .map((m) => m.content.slice(0, 50))
      .join("; ");
    summary += `Earlier discussed: ${topics}...\n\n`;
  }

  // Add recent messages in full
  summary += "[RECENT MESSAGES]\n";
  summary += recent
    .map((m) => `${m.role.toUpperCase()}: ${m.content}`)
    .join("\n");

  return {
    summary,
    tokenEstimate: estimateTokens(summary),
  };
}

/**
 * Build system prompt for AI tutor
 */
export function buildTutorSystemPrompt(profile: UserProfile): string {
  const targetLanguage = getLanguageLabel(profile.targetLanguage, "en");
  const nativeLanguage = getLanguageLabel(profile.nativeLanguage, "en");

  return `You are Anglicus, a ${targetLanguage} tutor for ${nativeLanguage} speakers named ${profile.name} (${profile.level} level).

Your teaching style:
- Be concise. Max 2-3 sentences unless explaining a concept.
- Correct mistakes gently with brief explanations in ${nativeLanguage}.
- Focus on their weak areas: ${profile.weakAreas.map(formatWeakArea).join(", ")}.
- Ask follow-up questions to keep them practicing.

Error correction format:
When you notice a mistake, respond with:
[CORRECTION] "incorrect phrase" → "correct phrase" - Brief explanation in ${nativeLanguage}

Then continue the conversation naturally.`;
}

/**
 * Build system prompt for exercise generation
 */
export function buildExerciseSystemPrompt(profile: UserProfile): string {
  const targetLanguage = getLanguageLabel(profile.targetLanguage, "en");
  const nativeLanguage = getLanguageLabel(profile.nativeLanguage, "en");
  const goalsText = profile.goals.length > 0
    ? profile.goals
        .map((g: LearningGoal) => formatGoal(g, profile.targetLanguage))
        .join(", ")
    : `General ${targetLanguage}`;
  const weakAreasText = profile.weakAreas.length > 0
    ? profile.weakAreas.join(", ")
    : `General ${targetLanguage}`;

  return `Generate ${targetLanguage} exercises for a ${profile.level} ${nativeLanguage} speaker.

Focus areas: ${weakAreasText}

Requirements:
- Return ONLY valid JSON
- Be concise
- Make questions culturally relevant to ${goalsText}

Exercise format:
{
  "exercises": [
    {
      "type": "multiple_choice|fill_blank|translation|error_correction",
      "question": "...",
      "options": ["...", "...", "...", "..."],
      "correctAnswer": "...",
      "explanation": "...",
      "weakArea": "..."
    }
  ]
}`;
}

/**
 * Estimate token count (rough approximation: ~4 chars per token)
 */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Format a single goal for display
 */
function formatGoal(goal: LearningGoal, targetLanguage: LanguageCode): string {
  const targetLabel = getLanguageLabel(targetLanguage, "en");
  const goalMap: Record<LearningGoal, string> = {
    travel: "Travel",
    work: `Business ${targetLabel}`,
    study: "Academic",
    movies: "Media & Culture",
    general: "General",
  };
  return goalMap[goal];
}

/**
 * Format goals for display (legacy, kept for compatibility)
 */
function formatGoals(goals: LearningGoal[], targetLanguage: LanguageCode): string {
  return goals.map((g) => formatGoal(g, targetLanguage)).join(", ");
}

/**
 * Format weak area for display
 */
function formatWeakArea(area: WeakArea): string {
  const areaMap: Record<WeakArea, string> = {
    articles: "Articles",
    present_perfect: "Present Perfect",
    past_tense: "Past tenses",
    prepositions: "Prepositions",
    false_friends: "False friends",
    conditionals: "Conditionals",
    phrasal_verbs: "Phrasal verbs",
  };
  return areaMap[area];
}
