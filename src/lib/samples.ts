import raw from "./samples.json";
import type { ExerciseDb } from "./types";

// Eight original puzzles written for this app so it is usable before any book
// is imported. They are not taken from any book and are labelled as samples.
export const SAMPLE_PACK = raw as unknown as ExerciseDb;
