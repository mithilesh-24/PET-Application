export function formatHHMMSS(totalSeconds) {
  const clamped = Math.max(0, Math.floor(totalSeconds || 0));
  const hrs = Math.floor(clamped / 3600);
  const mins = Math.floor((clamped % 3600) / 60);
  const secs = clamped % 60;
  return [hrs, mins, secs].map((n) => String(n).padStart(2, '0')).join(':');
}
