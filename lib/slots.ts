// Ping "slots" are shared by client and server. Slot k starts at startedAt + k * interval.
// Slot 0 is the hiders' head start (no ping). Every hider broadcasts once per slot from 1 on.

export function currentSlot(startedAt: string | null, intervalSeconds: number, nowMs: number): number {
  if (!startedAt) return 0;
  const elapsed = nowMs - Date.parse(startedAt);
  return Math.max(0, Math.floor(elapsed / (intervalSeconds * 1000)));
}

export function slotStartMs(startedAt: string, intervalSeconds: number, slot: number): number {
  return Date.parse(startedAt) + slot * intervalSeconds * 1000;
}
