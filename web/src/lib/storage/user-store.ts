/**
 * User profile storage using localStorage
 */

import type { UserProfile } from "$lib/types/user.js";

const STORAGE_KEY = "anglicus_user";

export function getUserProfile(): UserProfile | null {
  if (typeof window === "undefined") return null;

  try {
    const data = localStorage.getItem(STORAGE_KEY);
    if (!data) return null;
    const storedProfile = JSON.parse(data);

    // Default configuration with all achievements
    const defaults = {
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
      ]
    };

    // Merge logic: ensure all default achievements exist
    const mergedAchievements = defaults.achievements.map(def => {
      // If user has this achievement stored, use its unlocked status
      const existing = storedProfile.achievements?.find((a: any) => a.id === def.id);
      return existing ? { ...def, unlocked: existing.unlocked } : def;
    });

    return {
      ...defaults,
      ...storedProfile,
      achievements: mergedAchievements,
      skills: storedProfile.skills || defaults.skills
    };
  } catch {
    return null;
  }
}

export function saveUserProfile(profile: UserProfile): void {
  if (typeof window === "undefined") return;

  localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
  updateLastActive();
}

export function clearUserProfile(): void {
  if (typeof window === "undefined") return;

  localStorage.removeItem(STORAGE_KEY);
}

export function updateUserProfile(updates: Partial<UserProfile>): void {
  const profile = getUserProfile();
  if (!profile) return;

  const updated = { ...profile, ...updates };
  saveUserProfile(updated);
}

export function updateLastActive(): void {
  const profile = getUserProfile();
  if (!profile) return;

  profile.lastActiveAt = new Date().toISOString();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
}

export function hasCompletedOnboarding(): boolean {
  return getUserProfile() !== null;
}

export function updateStreakDays(): void {
  const profile = getUserProfile();
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
  saveUserProfile(profile);
}

export function addXp(amount: number): void {
  const profile = getUserProfile();
  if (!profile) return;
  
  profile.totalXP += amount;
  saveUserProfile(profile);
}

export function updateWeeklyActivity(minutes: number): void {
  const profile = getUserProfile();
  if (!profile) return;

  const today = new Date().getDay(); // 0 is Sunday
  profile.weeklyActivity[today] += minutes;
  saveUserProfile(profile);
}

export function unlockAchievement(id: string): void {
  const profile = getUserProfile();
  if (!profile) return;

  const achievement = profile.achievements.find(a => a.id === id);
  if (achievement && !achievement.unlocked) {
    achievement.unlocked = true;
    saveUserProfile(profile);
  }
}

export function incrementWordsLearned(count: number): void {
  const profile = getUserProfile();
  if (!profile) return;
  
  profile.wordsLearned += count;
  saveUserProfile(profile);
}

export function completeLesson(skillId: string): void {
  let profile = getUserProfile();
  if (!profile) return;

  // Update stats
  profile.totalXP = (profile.totalXP || 0) + 50;
  profile.wordsLearned = (profile.wordsLearned || 0) + 12;
  
  // Update weekly activity for today
  const dayIndex = new Date().getDay();
  if (!profile.weeklyActivity) profile.weeklyActivity = [0,0,0,0,0,0,0];
  profile.weeklyActivity[dayIndex] += 15; // 15 mins

  // Update skill status
  if (!profile.skills) profile.skills = [];
  const skillIndex = profile.skills.findIndex(s => s.id === skillId);
  
  if (skillIndex !== -1) {
    profile.skills[skillIndex].status = 'completed';
    profile.skills[skillIndex].stars = 3;
    
    // Unlock next skill if available
    const nextSkill = profile.skills[skillIndex + 1];
    if (nextSkill && nextSkill.status === 'locked') {
      nextSkill.status = 'current';
    }
  }

  // Save changes so far before calling other helpers that read/write profile
  saveUserProfile(profile);

  // Update Streak (Logic: check dates, potentially increment)
  updateStreakDays(); 
  
  // Refresh profile to get latest state from updateStreakDays
  profile = getUserProfile();
  if (!profile) return;

  // Check Achievements
  // 1. Early Bird (First 50 XP / First Lesson)
  const earlyBird = profile.achievements.find(a => a.id === 'early_bird');
  if (earlyBird && !earlyBird.unlocked && profile.totalXP > 0) {
    earlyBird.unlocked = true;
  }

  // 2. Weekender (Practice on weekend)
  const today = new Date().getDay();
  const isWeekend = today === 0 || today === 6; // 0=Sun, 6=Sat
  const weekender = profile.achievements.find(a => a.id === 'weekender');
  if (weekender && !weekender.unlocked && isWeekend) {
    weekender.unlocked = true;
  }

  // 3. Polyglot (placeholder 100 words - simplified for demo to 20)
  const polyglot = profile.achievements.find(a => a.id === 'polyglot');
  if (polyglot && !polyglot.unlocked && profile.wordsLearned >= 50) {
    polyglot.unlocked = true;
  }

  // 4. Streaks
  const fireStreak = profile.achievements.find(a => a.id === 'files_on_fire');
  if (fireStreak && !fireStreak.unlocked && profile.streakDays >= 3) {
    fireStreak.unlocked = true;
  }

  const unstoppable = profile.achievements.find(a => a.id === 'unstoppable');
  if (unstoppable && !unstoppable.unlocked && profile.streakDays >= 7) {
    unstoppable.unlocked = true;
  }

  // 5. XP & Scholar
  const scholar = profile.achievements.find(a => a.id === 'scholar');
  if (scholar && !scholar.unlocked && profile.totalXP >= 500) {
    scholar.unlocked = true;
  }

  // 6. Word Master
  const wordMaster = profile.achievements.find(a => a.id === 'word_master');
  if (wordMaster && !wordMaster.unlocked && profile.wordsLearned >= 50) {
    wordMaster.unlocked = true;
  }

  // 7. Sharpshooter (Perfect lesson - assuming 3 stars means perfect)
  if (skillIndex !== -1 && profile.skills[skillIndex].stars === 3) {
     const sharpshooter = profile.achievements.find(a => a.id === 'sharpshooter');
     if (sharpshooter && !sharpshooter.unlocked) {
       sharpshooter.unlocked = true;
     }
  }

  saveUserProfile(profile);
}

