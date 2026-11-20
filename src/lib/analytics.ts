import { AppUser, ActivityEvent, QueryLog } from './db';

export type ChartTimeframe = '24h' | '7d' | '30d';

export interface ChartBucket {
  index: number;
  label: string;
  fullLabel: string;
  startMs: number;
  endMs: number;
  users: number;
  queries: number;
  activeUserNames: string[];
  bucketQueries: QueryLog[];
  bucketActivities: ActivityEvent[];
}

const WEEKDAYS_SHORT = ['Нд', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
const WEEKDAYS_FULL = ['Неділя', 'Понеділок', 'Вівторок', 'Середа', 'Четвер', "П'ятниця", 'Субота'];
const USER_ACTIVITY_TYPES = new Set<ActivityEvent['type']>([
  'visit',
  'query',
  'model_change',
  'topup_request',
]);

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function formatDayMonth(d: Date): string {
  return `${pad2(d.getDate())}.${pad2(d.getMonth() + 1)}`;
}

function formatFullDateUk(d: Date): string {
  return d.toLocaleDateString('uk-UA', { day: 'numeric', month: 'long' });
}

function startOfDayMs(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function startOfHourMs(ms: number): number {
  const d = new Date(ms);
  d.setMinutes(0, 0, 0);
  return d.getTime();
}

function getUserDisplayName(u: AppUser): string {
  if (u.firstName && u.lastName) return `${u.firstName} ${u.lastName}`;
  if (u.firstName) return u.firstName;
  if (u.username) return `@${u.username}`;
  return `ID ${u.telegramId || u.id}`;
}

export function buildActivityChartData(
  timeframe: ChartTimeframe,
  queries: QueryLog[],
  users: AppUser[],
  activities: ActivityEvent[],
  nowMs: number = Date.now()
): ChartBucket[] {
  const ONE_HOUR_MS = 60 * 60 * 1000;
  const ONE_DAY_MS = 24 * ONE_HOUR_MS;

  // Build lookup tables for canonical user identification & readable display names
  const usersById = new Map<string, AppUser>();
  const nameToUserIds = new Map<string, Set<string>>();

  const registerAlias = (alias: string | undefined, userId: string) => {
    const key = alias?.trim().toLowerCase();
    if (!key) return;
    let set = nameToUserIds.get(key);
    if (!set) {
      set = new Set<string>();
      nameToUserIds.set(key, set);
    }
    set.add(userId);
  };

  for (const u of users) {
    usersById.set(u.id, u);
    if (u.telegramId != null) {
      usersById.set(String(u.telegramId), u);
    }
    registerAlias(u.firstName, u.id);
    registerAlias(u.username ? `@${u.username}` : undefined, u.id);
    registerAlias(u.username, u.id);
    if (u.firstName && u.lastName) {
      registerAlias(`${u.firstName} ${u.lastName}`, u.id);
    }
  }

  const resolveCanonicalUser = (
    explicitId?: string,
    rawName?: string
  ): { key: string; displayName: string } | null => {
    if (explicitId && explicitId.trim()) {
      const id = explicitId.trim();
      const matched = usersById.get(id);
      if (matched) {
        return { key: `id:${matched.id}`, displayName: getUserDisplayName(matched) };
      }
      return { key: `id:${id}`, displayName: rawName?.trim() || `ID ${id}` };
    }

    const name = rawName?.trim();
    if (!name) return null;

    const candidates = nameToUserIds.get(name.toLowerCase());
    if (candidates && candidates.size === 1) {
      const matchedId = Array.from(candidates)[0];
      const matched = usersById.get(matchedId);
      if (matched) {
        return { key: `id:${matched.id}`, displayName: getUserDisplayName(matched) };
      }
    }

    return { key: `name:${name.toLowerCase()}`, displayName: name };
  };

  // Build time buckets chronologically ending at current hour / current calendar day
  const buckets: ChartBucket[] = [];
  const todayStart = startOfDayMs(nowMs);
  const yesterdayStart = todayStart - ONE_DAY_MS;

  if (timeframe === '24h') {
    const currentHourStart = startOfHourMs(nowMs);
    for (let offset = 23; offset >= 0; offset--) {
      const startMs = currentHourStart - offset * ONE_HOUR_MS;
      const endMs = startMs + ONE_HOUR_MS;
      const d = new Date(startMs);
      const h = pad2(d.getHours());
      const label = `${h}:00`;
      const dayStart = startOfDayMs(startMs);
      const dayPrefix =
        dayStart === todayStart
          ? 'Сьогодні'
          : dayStart === yesterdayStart
          ? 'Вчора'
          : formatDayMonth(d);

      buckets.push({
        index: buckets.length,
        label,
        fullLabel: `${dayPrefix}, ${h}:00–${h}:59`,
        startMs,
        endMs,
        users: 0,
        queries: 0,
        activeUserNames: [],
        bucketQueries: [],
        bucketActivities: [],
      });
    }
  } else {
    const daysCount = timeframe === '7d' ? 7 : 30;
    for (let offset = daysCount - 1; offset >= 0; offset--) {
      const startMs = todayStart - offset * ONE_DAY_MS;
      const endMs = startMs + ONE_DAY_MS;
      const d = new Date(startMs);
      const weekdayShort = WEEKDAYS_SHORT[d.getDay()];
      const weekdayFull = WEEKDAYS_FULL[d.getDay()];
      const label =
        timeframe === '7d'
          ? `${weekdayShort} ${d.getDate()}`
          : formatDayMonth(d);
      const dayPrefix =
        startMs === todayStart
          ? 'Сьогодні'
          : startMs === yesterdayStart
          ? 'Вчора'
          : weekdayFull;

      buckets.push({
        index: buckets.length,
        label,
        fullLabel: `${dayPrefix}, ${formatFullDateUk(d)}`,
        startMs,
        endMs,
        users: 0,
        queries: 0,
        activeUserNames: [],
        bucketQueries: [],
        bucketActivities: [],
      });
    }
  }

  if (buckets.length === 0) return buckets;

  const rangeStartMs = buckets[0].startMs;
  const rangeEndMs = buckets[buckets.length - 1].endMs;

  const findBucketIndex = (tsMs: number): number => {
    if (!Number.isFinite(tsMs) || tsMs < rangeStartMs || tsMs >= rangeEndMs) {
      return -1;
    }
    const stepMs = timeframe === '24h' ? ONE_HOUR_MS : ONE_DAY_MS;
    const idx = Math.floor((tsMs - rangeStartMs) / stepMs);
    if (idx < 0 || idx >= buckets.length) return -1;
    // Guard against DST transitions shifting calendar day length by +/- 1 hour
    const candidate = buckets[idx];
    if (tsMs >= candidate.startMs && tsMs < candidate.endMs) return idx;
    return buckets.findIndex((b) => tsMs >= b.startMs && tsMs < b.endMs);
  };

  const uniqueUserMaps: Map<string, string>[] = buckets.map(() => new Map());

  // 1. Aggregate queries (actual AI generations)
  for (const q of queries) {
    const ts = new Date(q.timestamp).getTime();
    const idx = findBucketIndex(ts);
    if (idx === -1) continue;

    buckets[idx].bucketQueries.push(q);
    const resolved = resolveCanonicalUser(q.userId, q.userName);
    if (resolved) {
      uniqueUserMaps[idx].set(resolved.key, resolved.displayName);
    }
  }

  // 2. Aggregate activity events (visits, queries, model switches, topup requests)
  for (const act of activities) {
    if (!USER_ACTIVITY_TYPES.has(act.type)) continue;
    const ts = new Date(act.timestamp).getTime();
    const idx = findBucketIndex(ts);
    if (idx === -1) continue;

    buckets[idx].bucketActivities.push(act);
    const resolved = resolveCanonicalUser(act.userId, act.user);
    if (resolved) {
      uniqueUserMaps[idx].set(resolved.key, resolved.displayName);
    }
  }

  // 3. Include users.lastActive in their corresponding bucket so active sessions never disappear
  for (const u of users) {
    if (!u.lastActive) continue;
    const ts = new Date(u.lastActive).getTime();
    const idx = findBucketIndex(ts);
    if (idx === -1) continue;

    uniqueUserMaps[idx].set(`id:${u.id}`, getUserDisplayName(u));
  }

  // Finalize counts & sort bucket events newest-first
  for (let i = 0; i < buckets.length; i++) {
    const b = buckets[i];
    b.queries = b.bucketQueries.length;
    b.users = uniqueUserMaps[i].size;
    b.activeUserNames = Array.from(uniqueUserMaps[i].values());
    b.bucketQueries.sort(
      (a, c) => new Date(c.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
    b.bucketActivities.sort(
      (a, c) => new Date(c.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
  }

  return buckets;
}
