"use client";
import { useCallback, useEffect, useState } from "react";
import { onCloudApplied } from "./cloud/events";
import { DEFAULT_PROFILE, loadProfile, saveProfile, type PlayerProfile } from "./profile";

export function useProfile(): [PlayerProfile, (p: PlayerProfile) => void] {
  const [profile, setProfile] = useState<PlayerProfile>(DEFAULT_PROFILE);
  useEffect(() => { setProfile(loadProfile()); return onCloudApplied((realm) => { if (realm === "profile") setProfile(loadProfile()); }); }, []);
  const update = useCallback((p: PlayerProfile) => { setProfile(p); saveProfile(p); }, []);
  return [profile, update];
}
