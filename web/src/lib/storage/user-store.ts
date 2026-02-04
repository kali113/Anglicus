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
    return JSON.parse(data);
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
  }

  profile.lastActiveAt = now.toISOString();
  saveUserProfile(profile);
}
