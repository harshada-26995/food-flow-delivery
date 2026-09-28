import React, { useEffect, useState } from 'react';
import { Navigation, NavigationOff, ShieldAlert, WifiOff, Loader2, AlertTriangle } from 'lucide-react';

/**
 * Live-location indicator and Start / Stop control for the rider.
 * `sharing` is the value returned by useLocationSharing.
 */
function ago(ts, now) {
  if (!ts) return '';
  const s = Math.max(0, Math.round((now - ts) / 1000));
  if (s < 60) return `${s}s ago`;
  return `${Math.floor(s / 60)}m ${s % 60}s ago`;
}

export default function LocationCard({ sharing, canShare, promptPickup }) {
  const { status, message, enabled, lastSentAt, start, stop, supported } = sharing;
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (!enabled) return undefined;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [enabled]);

  let tone = 'off';
  let Icon = NavigationOff;
  let title = 'Location off';
  let hint = canShare
    ? 'Share your live location so the customer and restaurant can see you coming.'
    : 'Available once you have an order being prepared, ready or on the way.';

  if (!supported || status === 'unsupported') {
    tone = 'bad';
    Icon = AlertTriangle;
    title = 'Location not supported';
    hint = 'This browser cannot share location.';
  } else if (status === 'denied') {
    tone = 'bad';
    Icon = ShieldAlert;
    title = 'Location permission denied';
    hint = 'Allow location for this site in your browser settings, then tap Try again.';
  } else if (status === 'requesting') {
    tone = 'wait';
    Icon = Loader2;
    title = 'Starting location…';
    hint = message || 'Waiting for location permission / GPS fix…';
  } else if (status === 'sharing') {
    tone = 'on';
    Icon = Navigation;
    title = 'Sharing live location';
    hint = lastSentAt ? `Last sent ${ago(lastSentAt, now)}` : 'Getting your first fix…';
  } else if (status === 'offline') {
    tone = 'wait';
    Icon = WifiOff;
    title = 'Offline, location paused';
    hint = message;
  } else if (['unavailable', 'timeout', 'error'].includes(status)) {
    tone = 'wait';
    Icon = AlertTriangle;
    title = status === 'error' ? 'Location update failed' : 'Location unavailable';
    hint = message;
  } else if (message) {
    hint = message;
  }

  return (
    <section className={`card location-card ${tone}`} data-testid="location-card" data-status={status}>
      <div className="loc-row">
        <div className="location-main">
          <span className="chip" aria-hidden="true">
            <Icon size={19} className={status === 'requesting' ? 'spin' : ''} />
          </span>
          <div>
            <div className="title-row">
              <strong>{title}</strong>
              {status === 'sharing' && <span className="live-dot" aria-hidden="true" />}
            </div>
            <small>{hint}</small>
            {promptPickup && !enabled && status !== 'denied' && (
              <small className="location-prompt">You are on the way — start sharing so the customer can follow you.</small>
            )}
          </div>
        </div>
        {enabled ? (
          <button className="btn ghost" onClick={stop}>Stop sharing</button>
        ) : (
          <button className="btn primary" onClick={start} disabled={!supported || !canShare}>
            {status === 'denied' ? 'Try again' : 'Start sharing'}
          </button>
        )}
      </div>
    </section>
  );
}
