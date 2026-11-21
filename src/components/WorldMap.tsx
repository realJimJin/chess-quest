/* eslint-disable @next/next/no-img-element */
"use client";
import type { Campaign } from "@/lib/game";
import QuestIcon from "./QuestIcon";

// Figma's academy scene is a backdrop. Every interactive landmark is a real
// campaign level; longer books move through groups of landmarks without shrinking targets.
const LANDMARKS = [[34,43], [80,56], [58,67], [21,69], [64,35]] as const;
export default function WorldMap({ camp, selectedId, onPick }: { camp: Campaign; selectedId: string | null; onPick: (id: string) => void }) {
  const selectedIndex = Math.max(0, camp.levels.findIndex(level => level.id === selectedId));
  const page = Math.floor(selectedIndex / LANDMARKS.length);
  const count = Math.ceil(camp.levels.length / LANDMARKS.length);
  const levels = camp.levels.slice(page * LANDMARKS.length, (page + 1) * LANDMARKS.length);
  return <div className="world-map" role="group" aria-label="Campaign map" data-testid="world-map">
    <img className="journey-art" src="/art/figma-make/journey.png" width="1536" height="1024" alt="Isometric academy with winding paths, forested cliffs and a stone bridge at blue hour" />
    <div className="journey-shade" />
    <div className="map-landmarks">{levels.map((level,index) => <button key={level.id} className="map-landmark" style={{left:`${LANDMARKS[index][0]}%`,top:`${LANDMARKS[index][1]}%`}} onClick={()=>onPick(level.id)} aria-pressed={selectedId === level.id} data-testid={`level-${level.index}`} data-state={level.state} aria-label={`Level ${level.index + 1}, exercises ${level.firstNumber} to ${level.lastNumber}, ${level.state}`}><span className="landmark-diamond"><span>{level.state === "locked" ? <QuestIcon name="shield" /> : String(level.index + 1).padStart(2,"0")}</span></span><span className="landmark-label">{camp.bookId === "samples" && level.index === 0 ? "The academy" : `Level ${level.index + 1}`}<span>{level.state === "cleared" ? "✓" : level.state === "locked" ? "Locked" : "→"}</span></span></button>)}</div>
    {count > 1 && <div className="map-pagination" aria-label="Map sections"><button className="btn" disabled={!page} onClick={()=>onPick(camp.levels[(page-1)*LANDMARKS.length].id)}>← Previous</button><span>Section {page+1} / {count}</span><button className="btn" disabled={page+1===count} onClick={()=>onPick(camp.levels[(page+1)*LANDMARKS.length].id)}>Next →</button></div>}
  </div>;
}
