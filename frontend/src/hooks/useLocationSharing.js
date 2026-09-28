import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Live location sharing for the rider.
 *
 * - Uses navigator.geolocation.watchPosition while sharing is on.
 * - Sends at most one fix every SEND_EVERY_MS, or sooner once the rider has
 *   moved MOVE_THRESHOLD_M (never faster than the server's 5 s floor).
 * - Keeps a stationary rider "fresh" by asking for a new fix when the last one
 *   is getting old (watchPosition only fires on movement).
 * - Handles permission denied, position unavailable, timeout, offline and
 *   network/server failures (exponential back-off).
 * - Stops by itself when the server says there is no active delivery, when the
 *   job list no longer contains a shareable job, and on unmount (sign-out).
 *
 * The backend decides who may see the position and when; this hook only sends.
 */

const SEND_EVERY_MS = 10_000;
const MIN_GAP_MS = 5_500; // server refuses faster than 5 s
const MOVE_THRESHOLD_M = 25;
const REFRESH_FIX_AFTER_MS = 45_000;
const BACKOFF_START_MS = 5_000;
const BACKOFF_MAX_MS = 60_000;
const WANT_KEY = 'foodflow_rider_share_location';

function distanceM(a, b) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

const readWant = () => {
  try {
    return localStorage.getItem(WANT_KEY) === '1';
  } catch {
    return false;
  }
};
const writeWant = (v) => {
  try {
    if (v) localStorage.setItem(WANT_KEY, '1');
    else localStorage.removeItem(WANT_KEY);
  } catch {
    /* storage unavailable: only the resume-after-reload convenience is lost */
  }
};

/**
 * @param {object} p
 * @param {Function} p.api the rider context's authenticated fetch helper
 * @param {boolean} p.canShare whether any active job allows sharing
 */
export default function useLocationSharing({ api, canShare }) {
  // off | requesting | sharing | denied | unavailable | timeout | offline | error | unsupported
  const [status, setStatus] = useState('off');
  const [message, setMessage] = useState('');
  const [lastSentAt, setLastSentAt] = useState(null);
  const [lastFix, setLastFix] = useState(null);
  const [enabled, setEnabled] = useState(false);

  const watchId = useRef(null);
  const latest = useRef(null); // latest fix from the device
  const lastSent = useRef(null); // { lat, lng, at }
  const inFlight = useRef(false);
  const backoff = useRef({ delay: 0, until: 0 });
  const enabledRef = useRef(false);

  const supported = typeof navigator !== 'undefined' && 'geolocation' in navigator;

  const clearWatch = useCallback(() => {
    if (watchId.current !== null && supported) navigator.geolocation.clearWatch(watchId.current);
    watchId.current = null;
  }, [supported]);

  const halt = useCallback(
    (nextStatus, text = '', { tellServer = true, forget = true } = {}) => {
      clearWatch();
      enabledRef.current = false;
      setEnabled(false);
      latest.current = null;
      lastSent.current = null;
      backoff.current = { delay: 0, until: 0 };
      setStatus(nextStatus);
      setMessage(text);
      if (forget) writeWant(false);
      if (tellServer) api('/api/delivery/location', { method: 'DELETE' }).catch(() => {});
    },
    [api, clearWatch]
  );

  const send = useCallback(
    async (force = false) => {
      const fix = latest.current;
      if (!enabledRef.current || !fix || inFlight.current) return;
      const now = Date.now();
      if (now < backoff.current.until) return;
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        setStatus('offline');
        setMessage('You are offline — location will resume when the connection returns.');
        return;
      }
      const prev = lastSent.current;
      if (prev) {
        const gap = now - prev.at;
        if (gap < MIN_GAP_MS) return;
        const moved = distanceM(prev, fix);
        if (!force && gap < SEND_EVERY_MS && moved < MOVE_THRESHOLD_M) return;
      }

      inFlight.current = true;
      try {
        const data = await api('/api/delivery/location', {
          method: 'PUT',
          body: {
            lat: fix.lat,
            lng: fix.lng,
            accuracy: fix.accuracy,
            heading: fix.heading,
            speed: fix.speed,
            timestamp: fix.timestamp,
          },
        });
        lastSent.current = { lat: fix.lat, lng: fix.lng, at: Date.now() };
        backoff.current = { delay: 0, until: 0 };
        setLastSentAt(data.updatedAt ? new Date(data.updatedAt).getTime() : Date.now());
        setStatus('sharing');
        setMessage('');
      } catch (err) {
        if (err.sessionEnded) return; // the whole screen is going away
        if (err.status === 409) {
          // No active delivery on the server: sharing ends.
          halt('off', err.message || 'No active delivery — location sharing stopped.', { tellServer: false });
          return;
        }
        const nextDelay = err.status === 429
          ? Math.max(MIN_GAP_MS, backoff.current.delay || MIN_GAP_MS)
          : Math.min(BACKOFF_MAX_MS, backoff.current.delay ? backoff.current.delay * 2 : BACKOFF_START_MS);
        backoff.current = { delay: nextDelay, until: Date.now() + nextDelay };
        if (err.status === 429) return; // just too quick; the next tick retries quietly
        setStatus(err.status ? 'error' : 'offline');
        setMessage(
          err.status
            ? `${err.message} Retrying in ${Math.round(nextDelay / 1000)}s.`
            : `Network problem — retrying in ${Math.round(nextDelay / 1000)}s.`
        );
      } finally {
        inFlight.current = false;
      }
    },
    [api, halt]
  );

  const onPosition = useCallback(
    (pos) => {
      const c = pos.coords;
      latest.current = {
        lat: c.latitude,
        lng: c.longitude,
        accuracy: Number.isFinite(c.accuracy) ? Math.min(c.accuracy, 5000) : null,
        heading: Number.isFinite(c.heading) ? c.heading : null,
        speed: Number.isFinite(c.speed) && c.speed >= 0 ? c.speed : null,
        // Some browsers report a cached fix's original time; never claim the future.
        timestamp: Math.min(pos.timestamp || Date.now(), Date.now()),
      };
      setLastFix(latest.current);
      setStatus((s) => (s === 'sharing' || s === 'offline' || s === 'error' ? s : 'sharing'));
      if (!lastSent.current) setMessage('');
      send(!lastSent.current);
    },
    [send]
  );

  const onPositionError = useCallback(
    (err) => {
      if (err.code === 1) {
        halt('denied', 'Permission denied — enable location for this site in your browser settings.', {
          forget: true,
        });
      } else if (err.code === 2) {
        setStatus('unavailable');
        setMessage('Location unavailable — no GPS fix yet. Still trying…');
      } else if (err.code === 3) {
        setStatus('timeout');
        setMessage('Getting your location is taking longer than usual. Still trying…');
      } else {
        setStatus('error');
        setMessage(err.message || 'Could not read your location.');
      }
    },
    [halt]
  );

  const start = useCallback(() => {
    if (!supported) {
      setStatus('unsupported');
      setMessage('This browser cannot share location.');
      return;
    }
    if (!canShare) {
      setStatus('off');
      setMessage('Location sharing is available once you have an order being prepared, ready or on the way.');
      return;
    }
    clearWatch();
    enabledRef.current = true;
    setEnabled(true);
    writeWant(true);
    backoff.current = { delay: 0, until: 0 };
    lastSent.current = null;
    setStatus('requesting');
    setMessage('Waiting for location permission / GPS fix…');
    watchId.current = navigator.geolocation.watchPosition(onPosition, onPositionError, {
      enableHighAccuracy: true,
      maximumAge: 10_000,
      timeout: 20_000,
    });
  }, [supported, canShare, clearWatch, onPosition, onPositionError]);

  const stop = useCallback(() => halt('off', 'Location sharing stopped.'), [halt]);

  // Heartbeat: retries after failures and keeps a stationary rider fresh.
  useEffect(() => {
    if (!enabled) return undefined;
    const id = setInterval(() => {
      const fix = latest.current;
      if (fix && Date.now() - fix.timestamp > REFRESH_FIX_AFTER_MS && supported) {
        navigator.geolocation.getCurrentPosition(onPosition, () => {}, {
          enableHighAccuracy: true,
          maximumAge: 5_000,
          timeout: 15_000,
        });
      } else {
        send();
      }
    }, 3_000);
    return () => clearInterval(id);
  }, [enabled, send, onPosition, supported]);

  // Offline / online.
  useEffect(() => {
    if (!enabled) return undefined;
    const goOffline = () => {
      setStatus('offline');
      setMessage('You are offline — location will resume when the connection returns.');
    };
    const goOnline = () => {
      backoff.current = { delay: 0, until: 0 };
      setMessage('');
      send(true);
    };
    window.addEventListener('offline', goOffline);
    window.addEventListener('online', goOnline);
    return () => {
      window.removeEventListener('offline', goOffline);
      window.removeEventListener('online', goOnline);
    };
  }, [enabled, send]);

  // No shareable job any more (delivered / cancelled / reassigned): stop.
  useEffect(() => {
    if (enabled && !canShare) {
      halt('off', 'No active delivery — location sharing stopped.', { tellServer: true });
    }
  }, [enabled, canShare, halt]);

  // Resume after a reload when the rider had it on and permission is already granted.
  useEffect(() => {
    if (!supported || enabled || !canShare || !readWant()) return;
    let cancelled = false;
    const q = navigator.permissions?.query?.({ name: 'geolocation' });
    if (!q) return;
    q.then((p) => {
      if (!cancelled && p.state === 'granted') start();
    }).catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [supported, enabled, canShare, start]);

  // Show "denied" up-front if the browser already blocks this site.
  useEffect(() => {
    if (!supported || !navigator.permissions?.query) return undefined;
    let perm;
    const onChange = () => {
      if (perm.state === 'denied') {
        if (enabledRef.current) halt('denied', 'Permission denied — enable location for this site in your browser settings.');
        else {
          setStatus('denied');
          setMessage('Permission denied — enable location for this site in your browser settings.');
        }
      } else if (perm.state !== 'denied') {
        setStatus((s) => (s === 'denied' ? 'off' : s));
      }
    };
    navigator.permissions
      .query({ name: 'geolocation' })
      .then((p) => {
        perm = p;
        if (p.state === 'denied') onChange();
        p.addEventListener?.('change', onChange);
      })
      .catch(() => {});
    return () => perm?.removeEventListener?.('change', onChange);
  }, [supported, halt]);

  // Unmount (sign-out): stop watching. The server clears the position on logout.
  useEffect(() => () => clearWatch(), [clearWatch]);

  return { status, message, enabled, lastSentAt, lastFix, start, stop, supported };
}
