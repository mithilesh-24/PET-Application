import { useEffect, useRef, useState } from 'react';
import { formatHHMMSS } from '../services/timeFormat.js';

export default function Timer({ deadlineAt, serverNow, onSync, onExpire }) {
  const [offsetMs, setOffsetMs] = useState(() =>
    typeof serverNow === 'number' ? serverNow - Date.now() : 0
  );
  const [secondsLeft, setSecondsLeft] = useState(() => {
    if (!deadlineAt) return 0;
    const approxNow = typeof serverNow === 'number' ? serverNow : Date.now();
    return Math.max(0, Math.ceil((deadlineAt - approxNow) / 1000));
  });
  const expiredCalledRef = useRef(false);

  useEffect(() => {
    if (typeof serverNow === 'number') {
      setOffsetMs(serverNow - Date.now());
    }
    expiredCalledRef.current = false;
  }, [deadlineAt, serverNow]);

  useEffect(() => {
    if (!deadlineAt) return undefined;

    const updateTick = () => {
      const estimatedServerNow = Date.now() + offsetMs;
      const rem = Math.max(0, Math.ceil((deadlineAt - estimatedServerNow) / 1000));
      setSecondsLeft(rem);
      if (rem === 0 && !expiredCalledRef.current) {
        expiredCalledRef.current = true;
        if (typeof onExpire === 'function') {
          onExpire();
        }
      }
    };

    updateTick();
    const tickId = setInterval(updateTick, 1000);
    return () => clearInterval(tickId);
  }, [deadlineAt, offsetMs, onExpire]);

  useEffect(() => {
    if (typeof onSync !== 'function') return undefined;
    const syncInterval = setInterval(() => {
      onSync();
    }, 15000);

    const handleFocus = () => {
      onSync();
    };
    window.addEventListener('focus', handleFocus);

    return () => {
      clearInterval(syncInterval);
      window.removeEventListener('focus', handleFocus);
    };
  }, [onSync]);

  const isWarning = secondsLeft > 0 && secondsLeft < 300;

  return (
    <span
      className={`exam-timer${isWarning ? ' timer-warning' : ''}`}
      data-testid="exam-timer"
      aria-label={`Time remaining ${formatHHMMSS(secondsLeft)}`}
    >
      {formatHHMMSS(secondsLeft)}
    </span>
  );
}
