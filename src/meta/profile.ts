import { z } from 'zod';
import { byId } from './cosmetics';

export const SettingsSchema = z.object({
  steering: z.enum(['keyboard', 'mouse']).default('keyboard'),
  autoFire: z.boolean().default(true),
  musicVol: z.number().min(0).max(1).default(0.6),
  sfxVol: z.number().min(0).max(1).default(0.8),
  reduceShake: z.boolean().default(false),
  photosensitive: z.boolean().default(true),
  quality: z.enum(['low', 'medium', 'high']).default('medium'),
  showFps: z.boolean().default(false),
  nukeKey: z.string().regex(/^[A-Za-z0-9]{1,20}$/).default('KeyN'),
});
export const MissionStateSchema = z.object({ id: z.string(), progress: z.number().int().min(0), done: z.boolean(), doneDay: z.string().nullable() });
const DEFAULT_COSMETICS = { owned: ['hull.arrow', 'paint.white', 'laser.cyan', 'trail.cyan'], hull: 'hull.arrow', paint: 'paint.white', laser: 'laser.cyan', trail: 'trail.cyan' };
export const ProfileSchema = z.object({
  v: z.literal(1),
  name: z.string().regex(/^[A-Za-z0-9_]{3,12}$/).nullable().default(null),
  best: z.object({ endless: z.number().int().min(0), daily: z.number().int().min(0) }).default({ endless: 0, daily: 0 }),
  bestDistance: z.object({ endless: z.number().int().min(0), daily: z.number().int().min(0) }).default({ endless: 0, daily: 0 }),
  crystals: z.number().int().min(0).default(0),
  totalRuns: z.number().int().min(0).default(0),
  lifetime: z.object({ kills: z.number().int().min(0), bosses: z.number().int().min(0), nukes: z.number().int().min(0), distance: z.number().int().min(0), runs: z.number().int().min(0) })
    .default({ kills: 0, bosses: 0, nukes: 0, distance: 0, runs: 0 }),
  tutorialDone: z.boolean().default(false),
  settings: SettingsSchema.default(() => SettingsSchema.parse({})),
  cosmetics: z.object({
    owned: z.array(z.string()), hull: z.string(), paint: z.string(), laser: z.string(), trail: z.string(),
  }).default(() => structuredClone(DEFAULT_COSMETICS)),
  missions: z.array(MissionStateSchema).max(3).default([]),
  achievements: z.array(z.string()).default([]),
  daily: z.object({ lastDay: z.string().nullable(), streak: z.number().int().min(0), bestDay: z.string().nullable(), bestScore: z.number().int().min(0) })
    .default({ lastDay: null, streak: 0, bestDay: null, bestScore: 0 }),
});
export type Profile = z.infer<typeof ProfileSchema>;

export const PROFILE_KEY = 'nova-rush.profile';
export const PROFILE_BACKUP_KEY = 'nova-rush.profile.bak';

export function defaultProfile(): Profile { return ProfileSchema.parse({ v: 1 }); }

/** Reset any equipped slot that is unknown or not owned to its default. */
function sanitizeCosmetics(p: Profile): void {
  const c = p.cosmetics;
  const slots = ['hull', 'paint', 'laser', 'trail'] as const;
  const defaults = { hull: 'hull.arrow', paint: 'paint.white', laser: 'laser.cyan', trail: 'trail.cyan' };
  for (const s of slots) {
    const cos = byId(c[s]);
    if (!cos || cos.kind !== s || !c.owned.includes(c[s])) c[s] = defaults[s];
  }
  for (const id of Object.values(defaults)) if (!c.owned.includes(id)) c.owned.push(id);
}

export function saveProfile(p: Profile): void {
  try { localStorage.setItem(PROFILE_KEY, JSON.stringify(p)); } catch { /* storage unavailable */ }
}

export function loadProfile(): { profile: Profile; wasCorrupt: boolean } {
  let raw: string | null = null;
  try { raw = localStorage.getItem(PROFILE_KEY); } catch { return { profile: defaultProfile(), wasCorrupt: false }; }
  if (raw === null) return { profile: defaultProfile(), wasCorrupt: false };
  try {
    const parsed = ProfileSchema.safeParse(JSON.parse(raw));
    if (parsed.success) { sanitizeCosmetics(parsed.data); return { profile: parsed.data, wasCorrupt: false }; }
  } catch { /* fallthrough to reset */ }
  try { localStorage.setItem(PROFILE_BACKUP_KEY, raw); } catch { /* ignore */ }
  const d = defaultProfile();
  saveProfile(d);
  return { profile: d, wasCorrupt: true };
}

export const store: { profile: Profile } = { profile: defaultProfile() };
