/**
 * Secure user profile storage with anti-tampering measures
 * Uses encrypted localStorage + IndexedDB backup + integrity checks
 */

import type { BillingInfo, UserProfile } from "$lib/types/user.js";
import { isBrowser } from "./base-store.js";
import { encrypt, decrypt } from "./crypto.js";
import { secureGet, secureSet, checkSuspiciousActivity, incrementSessionUsage } from "./secure-store.js";

function getTodayKey(): string {
  return new Date().toISOString().slice(0, 10);
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
    },
    paywallImpressions: 0,
    redeemedCodeHashes: [],
  };
}

function mergeWithDefaults(storedProfile: any): UserProfile {
  const defaultBilling = getDefaultBilling();
  const defaults = {
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

  return {
    ...defaults,
    ...storedProfile,
    achievements: mergedAchievements,
    skills: storedProfile.skills || defaults.skills,
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

    return mergeWithDefaults(storedProfile);
  } catch (error) {
    console.error("Error loading profile:", error);
    return null;
  }
}

export async function saveUserProfile(profile: UserProfile): Promise<void> {
  if (!isBrowser()) return;

  try {
    const json = JSON.stringify(profile);
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
    
    await updateLastActive();
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
  const profile = await getUserProfile();
  if (!profile) return;

  const updated = { ...profile, ...updates };
  await saveUserProfile(updated);
}

export async function updateLastActive(): Promise<void> {
  if (!isBrowser()) return;

  try {
    const data = await secureGet();
    if (!data) return;

    let profile: any;
    const decrypted = await decrypt(data);
    if (decrypted !== null) {
      profile = JSON.parse(decrypted);
    } else {
      try {
        profile = JSON.parse(data);
      } catch {
        return;
      }
    }

    profile.lastActiveAt = new Date().toISOString();

    const json = JSON.stringify(profile);
    const encrypted = await encrypt(json);
    if (encrypted !== null) {
      await secureSet("primary", encrypted);
    }
  } catch (error) {
    console.error("Error updating last active:", error);
  }
}

export async function hasCompletedOnboarding(): Promise<boolean> {
  return (await getUserProfile()) !== null;
}

export async function updateStreakDays(): Promise<void> {
  const profile = await getUserProfile();
  if (!profile) return;

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
  await saveUserProfile(profile);
}

export async function addXp(amount: number): Promise<void> {
  const profile = await getUserProfile();
  if (!profile) return;
  
  profile.totalXP += amount;
  await saveUserProfile(profile);
}

export async function updateWeeklyActivity(minutes: number): Promise<void> {
  const profile = await getUserProfile();
  if (!profile) return;

  const today = new Date().getDay();
  profile.weeklyActivity[today] += minutes;
  await saveUserProfile(profile);
}

export async function unlockAchievement(id: string): Promise<void> {
  const profile = await getUserProfile();
  if (!profile) return;

  const achievement = profile.achievements.find(a => a.id === id);
  if (achievement && !achievement.unlocked) {
    achievement.unlocked = true;
    await saveUserProfile(profile);
  }
}

export async function incrementWordsLearned(count: number): Promise<void> {
  const profile = await getUserProfile();
  if (!profile) return;
  
  profile.wordsLearned += count;
  await saveUserProfile(profile);
}

export async function completeLesson(skillId: string): Promise<void> {
  let profile = await getUserProfile();
  if (!profile) return;

  profile.totalXP = (profile.totalXP || 0) + 50;
  profile.wordsLearned = (profile.wordsLearned || 0) + 12;
  
  const dayIndex = new Date().getDay();
  if (!profile.weeklyActivity) profile.weeklyActivity = [0,0,0,0,0,0,0];
  profile.weeklyActivity[dayIndex] += 15;

  if (!profile.skills) profile.skills = [];
  const skillIndex = profile.skills.findIndex(s => s.id === skillId);
  
  if (skillIndex !== -1) {
    profile.skills[skillIndex].status = 'completed';
    profile.skills[skillIndex].stars = 3;
    
    const nextSkill = profile.skills[skillIndex + 1];
    if (nextSkill && nextSkill.status === 'locked') {
      nextSkill.status = 'current';
    }
  }

  await saveUserProfile(profile);

  await updateStreakDays(); 
  
  profile = await getUserProfile();
  if (!profile) return;

  const earlyBird = profile.achievements.find(a => a.id === 'early_bird');
  if (earlyBird && !earlyBird.unlocked && profile.totalXP > 0) {
    earlyBird.unlocked = true;
  }

  const today = new Date().getDay();
  const isWeekend = today === 0 || today === 6;
  const weekender = profile.achievements.find(a => a.id === 'weekender');
  if (weekender && !weekender.unlocked && isWeekend) {
    weekender.unlocked = true;
  }

  const polyglot = profile.achievements.find(a => a.id === 'polyglot');
  if (polyglot && !polyglot.unlocked && profile.wordsLearned >= 50) {
    polyglot.unlocked = true;
  }

  const fireStreak = profile.achievements.find(a => a.id === 'files_on_fire');
  if (fireStreak && !fireStreak.unlocked && profile.streakDays >= 3) {
    fireStreak.unlocked = true;
  }

  const unstoppable = profile.achievements.find(a => a.id === 'unstoppable');
  if (unstoppable && !unstoppable.unlocked && profile.streakDays >= 7) {
    unstoppable.unlocked = true;
  }

  const scholar = profile.achievements.find(a => a.id === 'scholar');
  if (scholar && !scholar.unlocked && profile.totalXP >= 500) {
    scholar.unlocked = true;
  }

  const wordMaster = profile.achievements.find(a => a.id === 'word_master');
  if (wordMaster && !wordMaster.unlocked && profile.wordsLearned >= 50) {
    wordMaster.unlocked = true;
  }

  if (skillIndex !== -1 && profile.skills[skillIndex].stars === 3) {
     const sharpshooter = profile.achievements.find(a => a.id === 'sharpshooter');
     if (sharpshooter && !sharpshooter.unlocked) {
       sharpshooter.unlocked = true;
     }
  }

  await saveUserProfile(profile);
}
