"use client";
import { useCallback, useEffect, useState } from "react";
import { DEFAULT_PROFILE, loadProfile, saveProfile, type PlayerProfile } from "./profile";

export function useProfile(): [PlayerProfile, (p: PlayerProfile) => void] {
  const [profile, setProfile] = useState<PlayerProfile>(DEFAULT_PROFILE);
  useEffect(() => { setProfile(loadProfile()); }, []);
  const update = useCallback((p: PlayerProfile) => { setProfile(p); saveProfile(p); }, []);
  return [profile, update];
}
