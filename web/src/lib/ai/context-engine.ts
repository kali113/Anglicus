import type { UserProfile, SkillProgress, LanguageCode } from "$lib/types/user";
import { getLanguageLabel } from "$lib/types/user";
import { SKILL_TREE_DATA } from "$lib/data/skills";

export class ContextEngine {
  private user: UserProfile;

  constructor(user: UserProfile) {
    this.user = user;
  }

  /**
   * Generates a comprehensive system prompt based on user's level and context.
   */
  public generateSystemPrompt(activityContext: string): string {
    const levelContext = this.getLevelContext();
    const vocabContext = this.getVocabularyContext();
    const pedagogicalStrategy = this.getPedagogicalStrategy();
    const targetLanguage = this.getLanguageName(this.user.targetLanguage);
    const nativeLanguage = this.getLanguageName(this.user.nativeLanguage);
    const responseLanguage =
      this.user.level === "A1"
        ? nativeLanguage
        : `${targetLanguage} (with simple ${nativeLanguage} explanations if needed)`;

    return `
You are Anglicus, an expert ${targetLanguage} tutor for a ${nativeLanguage}-speaking user.
Your goal is to help the user learn ${targetLanguage} through the activity: "${activityContext}".

${levelContext}

${vocabContext}

${pedagogicalStrategy}

IMPORTANT:
- Always be encouraging and patient.
- Correct mistakes gently.
- If the user switches to ${nativeLanguage}, respond in ${responseLanguage}.
- Output should be structured and easy to read.
`.trim();
  }

  /**
   * Analyzes user's known skills and returns a summary of their vocabulary/grammar range.
   */
  private getVocabularyContext(): string {
    const completedSkills = (this.user.skills || [])
      .filter(s => s.status === 'completed')
      .map(s => s.id);

    const knownTopics = SKILL_TREE_DATA
      .filter(node => completedSkills.includes(node.id))
      .map(node => node.name)
      .join(", ");

    if (!knownTopics) {
      return "User is a complete beginner. Assume no prior vocabulary.";
    }

    return `
KNOWN CONCEPTS:
The user has mastered the following topics: ${knownTopics}.
You can freely use vocabulary and grammar related to these topics.
Avoid advanced concepts not listed here unless you explain them first.
`.trim();
  }

  /**
   * Returns specific instructions based on CEFR level.
   */
  private getLevelContext(): string {
    const level = this.user.level || 'A1';
    
    const descriptions: Record<string, string> = {
      'A1': "USER LEVEL: A1 (Beginner). Use very simple sentences. Focus on basic vocabulary. Speak slowly (implied by text).",
      'A2': "USER LEVEL: A2 (Elementary). Use simple phrases and everyday vocabulary. Can understand sentence structure but needs clarity.",
      'B1': "USER LEVEL: B1 (Intermediate). Can understand standard inputs on familiar matters. You can use compound sentences.",
      'B2': "USER LEVEL: B2 (Upper Intermediate). Can understand complex text. You can converse naturally but avoid obscure idioms.",
      'C1': "USER LEVEL: C1 (Advanced). User is proficient. challenge them with nuanced language.",
      'C2': "USER LEVEL: C2 (Mastery). User is essentially native-level. No restrictions."
    };

    return descriptions[level] || descriptions['A1'];
  }

  private getLanguageName(language: LanguageCode): string {
    return getLanguageLabel(language, "en");
  }

  /**
   * Determines how to teach based on user's recent performance/stats.
   */
  private getPedagogicalStrategy(): string {
    // Basic logic for now - could be deeper with more stats
    if (this.user.streakDays > 7) {
      return "PEDAGOGY: The user is consistent and motivated. Challenge them slightly more to keep them engaged.";
    }
    
    if (!this.user.skills || this.user.skills.length < 3) {
      return "PEDAGOGY: The user is just starting. Focus on building confidence with easy wins.";
    }

    return "PEDAGOGY: Maintain a balanced scaffolding approach. Support new concepts with known ones.";
  }
}
