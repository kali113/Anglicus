/**
 * Secure user profile storage with anti-tampering measures
 * Uses encrypted localStorage + IndexedDB backup + integrity checks
 */

import type { BillingInfo, SpeakingStats, UserProfile } from "$lib/types/user.js";
import { getTodayKey } from "$lib/utils/date.js";
import { isBrowser } from "./base-store.js";
import { encrypt, decrypt } from "./crypto.js";
import { secureGet, secureSet, checkSuspiciousActivity, incrementSessionUsage } from "./secure-store.js";

const CURRENT_PROFILE_SCHEMA_VERSION = 2;
let profileMutationQueue: Promise<void> = Promise.resolve();

async function enqueueProfileMutation(
  mutator: (profile: UserProfile) => boolean | Promise<boolean>,
): Promise<void> {
  profileMutationQueue = profileMutationQueue
    .then(async () => {
      const profile = await getUserProfile();
      if (!profile) return;
      const changed = await mutator(profile);
      if (!changed) return;
      await saveUserProfile(profile);
    })
    .catch((error) => {
      console.error("Profile mutation error:", error);
    });

  await profileMutationQueue;
}

export function getDefaultBilling(): BillingInfo {
  return {
    plan: "free",
    status: "none",
    usage: {
      date: getTodayKey(),
      tutorMessages: 0,
      quickChatMessages: 0,
      lessonExplanations: 0,
      tutorQuestions: 0,
      speakingSessions: 0,
    },
    paywallImpressions: 0,
    redeemedCodeHashes: [],
  };
}

export function getDefaultSpeaking(): SpeakingStats {
  return {
    totalAttempts: 0,
    totalDurationMs: 0,
    averageScore: 0,
    lastScore: 0,
    recentSessions: [],
  };
}

function unlockAchievementIf(profile: UserProfile, id: string, condition: boolean): void {
  if (!condition) return;
  const achievement = profile.achievements.find((item) => item.id === id);
  if (achievement && !achievement.unlocked) {
    achievement.unlocked = true;
  }
}

function mergeWithDefaults(storedProfile: any): UserProfile {
  const defaultBilling = getDefaultBilling();
  const defaultSpeaking = getDefaultSpeaking();
  const defaults = {
    schemaVersion: CURRENT_PROFILE_SCHEMA_VERSION,
    nativeLanguage: "es",
    targetLanguage: "en",
    totalXP: 0,
    wordsLearned: 0,
    weeklyActivity: [0, 0, 0, 0, 0, 0, 0],
    achievements: [
      { id: 'early_bird', name: 'Primeros Pasos', icon: '🌅', unlocked: false },
      { id: 'weekender', name: 'Guerrero de Finde', icon: '📅', unlocked: false },
      { id: 'polyglot', name: 'Políglota', icon: '🗣️', unlocked: false },
      { id: 'files_on_fire', name: 'Racha de Fuego', icon: '🔥', unlocked: false },
      { id: 'unstoppable', name: 'Imparable', icon: '🚀', unlocked: false },
      { id: 'scholar', name: 'Estudioso', icon: '📚', unlocked: false },
      { id: 'word_master', name: 'Vocabulista', icon: '🧠', unlocked: false },
      { id: 'sharpshooter', name: 'Francotirador', icon: '🎯', unlocked: false }
    ],
    skills: [
      { id: 'greetings', status: 'completed', stars: 3 },
      { id: 'food', status: 'current', stars: 1 },
      { id: 'directions', status: 'locked', stars: 0 },
      { id: 'travel', status: 'locked', stars: 0 },
      { id: 'family', status: 'locked', stars: 0 },
      { id: 'hobbies', status: 'locked', stars: 0 },
      { id: 'shopping', status: 'locked', stars: 0 },
      { id: 'food2', status: 'locked', stars: 0 },
      { id: 'emotions', status: 'locked', stars: 0 },
      { id: 'weather', status: 'locked', stars: 0 },
      { id: 'nature', status: 'locked', stars: 0 }
    ],
    speaking: defaultSpeaking,
    billing: defaultBilling,
  };

  const mergedAchievements = defaults.achievements.map(def => {
    const existing = storedProfile.achievements?.find((a: any) => a.id === def.id);
    return existing ? { ...def, unlocked: existing.unlocked } : def;
  });

  const mergedBilling = {
    ...defaultBilling,
    ...(storedProfile.billing || {}),
    usage: {
      ...defaultBilling.usage,
      ...(storedProfile.billing?.usage || {}),
    },
    redeemedCodeHashes:
      storedProfile.billing?.redeemedCodeHashes || defaultBilling.redeemedCodeHashes,
  };

  const mergedSpeaking = {
    ...defaultSpeaking,
    ...(storedProfile.speaking || {}),
    recentSessions: Array.isArray(storedProfile.speaking?.recentSessions)
      ? storedProfile.speaking.recentSessions
          .filter(
            (session: any) =>
              session &&
              typeof session.timestamp === "string" &&
              typeof session.durationMs === "number" &&
              typeof session.score === "number",
          )
          .slice(-20)
      : defaultSpeaking.recentSessions,
  };

  return {
    ...defaults,
    ...storedProfile,
    schemaVersion:
      typeof storedProfile.schemaVersion === "number" &&
      storedProfile.schemaVersion >= CURRENT_PROFILE_SCHEMA_VERSION
        ? storedProfile.schemaVersion
        : CURRENT_PROFILE_SCHEMA_VERSION,
    achievements: mergedAchievements,
    skills: storedProfile.skills || defaults.skills,
    speaking: mergedSpeaking,
    billing: mergedBilling,
  };
}

export async function getUserProfile(): Promise<UserProfile | null> {
  if (!isBrowser()) return null;

  try {
    // Check for suspicious activity first
    const securityCheck = await checkSuspiciousActivity();
    if (securityCheck.action === "block") {
      console.warn("Security check failed:", securityCheck.reason);
      // Return profile with zeroed usage to prevent abuse
      const profile = await loadProfile();
      if (profile) {
        profile.billing = {
          ...profile.billing,
          usage: {
            ...getDefaultBilling().usage,
            date: getTodayKey(),
          }
        };
        await saveUserProfile(profile);
      }
      return profile;
    }

    return await loadProfile();
  } catch (error) {
    console.error("Error loading user profile:", error);
    return null;
  }
}

async function loadProfile(): Promise<UserProfile | null> {
  try {
    // Use secure storage which handles IndexedDB backup
    const data = await secureGet();
    if (!data) return null;

    let storedProfile: any;

    const decrypted = await decrypt(data);
    if (decrypted !== null) {
      storedProfile = JSON.parse(decrypted);
    } else {
      // Try parsing as plain JSON (migration from old format)
      try {
        storedProfile = JSON.parse(data);
      } catch {
        return null;
      }
      // Re-save in secure encrypted format
      await saveUserProfile(mergeWithDefaults(storedProfile));
      return mergeWithDefaults(storedProfile);
    }

    const merged = mergeWithDefaults(storedProfile);
    if (storedProfile.schemaVersion !== CURRENT_PROFILE_SCHEMA_VERSION) {
      await saveUserProfile(merged);
    }
    return merged;
  } catch (error) {
    console.error("Error loading profile:", error);
    return null;
  }
}

export async function saveUserProfile(profile: UserProfile): Promise<void> {
  if (!isBrowser()) return;

  try {
    const normalizedProfile = mergeWithDefaults({
      ...profile,
      schemaVersion: CURRENT_PROFILE_SCHEMA_VERSION,
      lastActiveAt: new Date().toISOString(),
    });
    const json = JSON.stringify(normalizedProfile);
    const encrypted = await encrypt(json);
    
    if (encrypted !== null) {
      // Use secure storage with backup
      await secureSet("primary", encrypted);
      await secureSet("backup", encrypted);
    } else {
      // Fallback to unencrypted if encryption fails
      await secureSet("primary", json);
      await secureSet("backup", json);
    }
    
    incrementSessionUsage();
  } catch (error) {
    console.error("Error saving user profile:", error);
  }
}

export function clearUserProfile(): void {
  if (!isBrowser()) return;
  
  // Note: This is intentionally less accessible now
  // Users would need to clear both localStorage AND IndexedDB
  // which requires more technical knowledge
  console.warn("Profile clear attempted - use secureClear() from secure-store instead");
}

export async function updateUserProfile(updates: Partial<UserProfile>): Promise<void> {
  await enqueueProfileMutation((profile) => {
    Object.assign(profile, updates);
    return true;
  });
}

export async function updateLastActive(): Promise<void> {
  await enqueueProfileMutation((profile) => {
    profile.lastActiveAt = new Date().toISOString();
    return true;
  });
}

export async function hasCompletedOnboarding(): Promise<boolean> {
  return (await getUserProfile()) !== null;
}

export async function updateStreakDays(): Promise<void> {
  await enqueueProfileMutation((profile) => {
    const now = new Date();
    const lastActive = new Date(profile.lastActiveAt);
    const diffDays = Math.floor(
      (now.getTime() - lastActive.getTime()) / (1000 * 60 * 60 * 24),
    );

    if (diffDays === 1) {
      profile.streakDays++;
    } else if (diffDays > 1) {
      profile.streakDays = 1;
    } else if (diffDays === 0 && profile.streakDays === 0) {
      profile.streakDays = 1;
    }

    profile.lastActiveAt = now.toISOString();
    return true;
  });
}

export async function addXp(amount: number): Promise<void> {
  await enqueueProfileMutation((profile) => {
    profile.totalXP += amount;
    return true;
  });
}

export async function updateWeeklyActivity(minutes: number): Promise<void> {
  await enqueueProfileMutation((profile) => {
    const today = new Date().getDay();
    profile.weeklyActivity[today] += minutes;
    return true;
  });
}

export async function unlockAchievement(id: string): Promise<void> {
  await enqueueProfileMutation((profile) => {
    const achievement = profile.achievements.find((a) => a.id === id);
    if (!achievement || achievement.unlocked) return false;
    achievement.unlocked = true;
    return true;
  });
}

export async function incrementWordsLearned(count: number): Promise<void> {
  await enqueueProfileMutation((profile) => {
    profile.wordsLearned += count;
    return true;
  });
}

export async function completeLesson(skillId: string): Promise<void> {
  await enqueueProfileMutation((profile) => {
    profile.totalXP = (profile.totalXP || 0) + 50;
    profile.wordsLearned = (profile.wordsLearned || 0) + 12;

    const now = new Date();
    const dayIndex = now.getDay();
    if (!profile.weeklyActivity) profile.weeklyActivity = [0, 0, 0, 0, 0, 0, 0];
    profile.weeklyActivity[dayIndex] += 15;

    if (!profile.skills) profile.skills = [];
    const skillIndex = profile.skills.findIndex((s) => s.id === skillId);

    if (skillIndex !== -1) {
      profile.skills[skillIndex].status = "completed";
      profile.skills[skillIndex].stars = 3;

      const nextSkill = profile.skills[skillIndex + 1];
      if (nextSkill && nextSkill.status === "locked") {
        nextSkill.status = "current";
      }
    }

    const lastActive = new Date(profile.lastActiveAt);
    const diffDays = Math.floor(
      (now.getTime() - lastActive.getTime()) / (1000 * 60 * 60 * 24),
    );
    if (diffDays === 1) {
      profile.streakDays++;
    } else if (diffDays > 1) {
      profile.streakDays = 1;
    } else if (diffDays === 0 && profile.streakDays === 0) {
      profile.streakDays = 1;
    }
    profile.lastActiveAt = now.toISOString();

    const isWeekend = dayIndex === 0 || dayIndex === 6;
    unlockAchievementIf(profile, "early_bird", profile.totalXP > 0);
    unlockAchievementIf(profile, "weekender", isWeekend);
    unlockAchievementIf(profile, "polyglot", profile.wordsLearned >= 50);
    unlockAchievementIf(profile, "files_on_fire", profile.streakDays >= 3);
    unlockAchievementIf(profile, "unstoppable", profile.streakDays >= 7);
    unlockAchievementIf(profile, "scholar", profile.totalXP >= 500);
    unlockAchievementIf(profile, "word_master", profile.wordsLearned >= 50);
    unlockAchievementIf(
      profile,
      "sharpshooter",
      skillIndex !== -1 && profile.skills[skillIndex].stars === 3,
    );

    return true;
  });
}

export async function recordSpeakingPractice(
  durationMs: number,
  score: number,
  transcript?: string,
): Promise<void> {
  await enqueueProfileMutation((profile) => {
    const boundedDuration = Math.max(0, Math.round(durationMs));
    const boundedScore = Math.max(0, Math.min(100, Math.round(score)));
    const now = new Date().toISOString();
    const previousStats = profile.speaking || getDefaultSpeaking();
    const previousAttempts = previousStats.totalAttempts;
    const previousTotalScore = previousStats.averageScore * previousAttempts;
    const totalAttempts = previousAttempts + 1;
    const averageScore = Math.round(
      (previousTotalScore + boundedScore) / totalAttempts,
    );
    const recentSessions = [
      ...previousStats.recentSessions.slice(-19),
      {
        timestamp: now,
        durationMs: boundedDuration,
        score: boundedScore,
        transcript: transcript?.trim() || undefined,
      },
    ];

    profile.speaking = {
      totalAttempts,
      totalDurationMs: previousStats.totalDurationMs + boundedDuration,
      averageScore,
      lastScore: boundedScore,
      lastPracticeAt: now,
      recentSessions,
    };

    return true;
  });
}
