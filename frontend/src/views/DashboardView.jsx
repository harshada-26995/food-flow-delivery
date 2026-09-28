import React, { useState } from 'react';
import { useRider } from '../context/RiderContext';
import useLocationSharing from '../hooks/useLocationSharing';
import LocationCard from '../components/LocationCard';
import {
  UtensilsCrossed, LogOut, RefreshCw, MapPin, Phone, Store, IndianRupee,
  PackageCheck, Banknote, CheckCircle2, History, Wallet,
  XCircle, ChefHat, AlertTriangle, MessageSquareText, BellOff, DoorOpen,
} from 'lucide-react';

/**
 * The rider's working screen.
 *
 * One job at a time is the point: a rider glancing at a phone needs the
 * current delivery, where it is going and the one button that advances it.
 * Earnings and past trips sit behind tabs rather than competing for that.
 */

const money = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;
const when = (d) =>
  d
    ? new Date(d).toLocaleString('en-IN', {
        day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit',
      })
    : '';
const initials = (name) =>
  String(name || 'R')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();

/*
 * What a rider can do with a job, keyed on the canonical order status. Only
 * READY can be picked up and only OUT_FOR_DELIVERY can be delivered — the
 * server rejects READY -> DELIVERED for riders, so it is never offered.
 * `statusLabel` from the server is what gets displayed.
 */
const PREPARING_STATUSES = ['PLACED', 'ACCEPTED', 'PREPARING'];
const JOB_STATES = {
  PLACED: { pill: 'grey', note: 'Being prepared at restaurant' },
  ACCEPTED: { pill: 'grey', note: 'Being prepared at restaurant' },
  PREPARING: { pill: 'grey', note: 'Being prepared at restaurant' },
  READY: { pill: 'amber', note: 'Ready for pickup', next: 'OUT_FOR_DELIVERY', action: 'Mark picked up' },
  OUT_FOR_DELIVERY: { pill: 'blue', note: 'On the way to the customer', next: 'DELIVERED', action: 'Mark delivered' },
};
// The job in hand first, then what can be collected, then what is cooking.
const JOB_ORDER = { OUT_FOR_DELIVERY: 0, READY: 1, PREPARING: 2, ACCEPTED: 3, PLACED: 4 };

export default function DashboardView() {
  const {
    partner, jobs, history, earnings, loading, refreshError,
    refresh, logout, setAvailability, advanceJob, api, isDemo,
  } = useRider();

  // Live location: only while a job allows it (server-decided via shareLocation).
  const canShare = jobs.some((j) => j.shareLocation);
  const sharing = useLocationSharing({ api, canShare });

  const [tab, setTab] = useState('jobs');
  const [busyId, setBusyId] = useState(null);
  const [jobErrors, setJobErrors] = useState({});
  const [availBusy, setAvailBusy] = useState(false);
  const [availError, setAvailError] = useState('');

  // Until /me answers we do not know the rider's availability; say so rather
  // than guessing "Online".
  const known = Boolean(partner?.status);
  const online = known && partner.status !== 'OFFLINE';
  const onDelivery = partner?.status === 'ON_DELIVERY';
  const hasJobInHand = jobs.some((j) => j.status === 'OUT_FOR_DELIVERY');
  // The server says "on a delivery" but lists no active job (e.g. the order
  // was just cancelled). Don't claim a delivery that isn't there; the next
  // refresh brings the server's corrected status.
  const statusSettling = onDelivery && jobs.length === 0;

  const sortedJobs = [...jobs].sort(
    (a, b) => (JOB_ORDER[a.status] ?? 9) - (JOB_ORDER[b.status] ?? 9)
  );

  const act = async (job) => {
    const next = JOB_STATES[job.status]?.next;
    if (!next) return;
    setBusyId(job.id);
    setJobErrors((e) => ({ ...e, [job.id]: '' }));
    try {
      const result = await advanceJob(job.id, next);
      if (!result.ok) setJobErrors((e) => ({ ...e, [job.id]: result.message }));
      // Picked up: start sharing (the browser asks for permission the first time).
      else if (next === 'OUT_FOR_DELIVERY' && !sharing.enabled && sharing.status !== 'denied') sharing.start();
    } finally {
      setBusyId(null);
    }
  };

  const toggleAvailability = async () => {
    if (!known) return;
    setAvailBusy(true);
    setAvailError('');
    try {
      const result = await setAvailability(online ? 'OFFLINE' : 'ONLINE');
      if (!result.ok) setAvailError(result.message);
    } finally {
      setAvailBusy(false);
    }
  };

  let availTitle;
  let availHint;
  if (!known) {
    availTitle = refreshError ? 'Status unknown' : 'Checking status…';
    availHint = refreshError ? 'Could not load your availability yet' : 'Loading your availability';
  } else if (statusSettling) {
    availTitle = 'Updating status…';
    availHint = 'Your last delivery is no longer active. Syncing with the server.';
  } else if (onDelivery) {
    availTitle = 'On a delivery';
    availHint = 'Finish your current delivery to change this';
  } else if (online) {
    availTitle = 'Online';
    availHint = 'You can be assigned deliveries';
  } else {
    availTitle = 'Offline';
    availHint = 'You will not be assigned deliveries';
  }

  return (
    <>
      <header className="topbar">
        <div className="topbar-inner">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span className="wordmark">
              <span className="logo-mark" aria-hidden="true">
                <UtensilsCrossed size={16} strokeWidth={2.25} />
              </span>
              <span>Food<span className="accent">Flow</span></span>
            </span>
            {isDemo && (
              <span className="demo-mode-badge" title="Running in instant interactive demo mode">
                ⚡ Demo Mode
              </span>
            )}
          </div>
          <div className="topbar-actions">
            <button className="icon-btn" onClick={() => refresh(false)} title="Refresh" aria-label="Refresh" disabled={loading}>
              <RefreshCw size={18} className={loading ? 'spin' : ''} />
            </button>
            <button className="icon-btn danger" onClick={logout} title="Sign out" aria-label="Sign out">
              <LogOut size={18} />
            </button>
          </div>
        </div>
      </header>

    <div className="app">
      {refreshError && (
        <div className="alert warn compact banner" role="status">
          <AlertTriangle size={16} />
          <span>Couldn't refresh, retrying. {refreshError.message}</span>
        </div>
      )}

      {/* Availability reflects only what the server reports. Disabled while a
          job is in hand, matching the API, which refuses to let a rider go
          offline while holding someone's food; any other refusal is shown. */}
      <section className="card rider-card">
        <div className="rider-id">
          <span className="avatar" aria-hidden="true">{initials(partner?.name)}</span>
          <div>
            <strong>{partner?.name || 'Rider'}</strong>
            <small>
              {partner
                ? [partner.partnerCode, partner.vehicle || 'No vehicle on file'].filter(Boolean).join(' · ')
                : 'Loading profile…'}
            </small>
          </div>
        </div>
        <div className={`availability ${!known || statusSettling ? 'unknown' : online ? 'on' : 'off'}`}>
          <div>
            <div className="status-line">
              <span className="dot" />
              <strong>{availTitle}</strong>
            </div>
            <small>{availHint}</small>
          </div>
          <button
            className={`btn ${online ? 'ghost' : 'primary'}`}
            disabled={!known || availBusy || (onDelivery && jobs.length > 0)}
            onClick={toggleAvailability}
          >
            {!known ? '…' : availBusy ? 'Saving…' : online ? 'Go offline' : 'Go online'}
          </button>
        </div>
      </section>
      {availError && <div className="alert error compact banner">{availError}</div>}

      <LocationCard sharing={sharing} canShare={canShare} promptPickup={hasJobInHand} />

      <div className="stat-row">
        <div className="card stat">
          <small>Today</small>
          <strong>{earnings?.today?.deliveries ?? 0}</strong>
          <span>deliveries</span>
        </div>
        <div className="card stat">
          <small>Earned today</small>
          <strong>{money(earnings?.today?.earned)}</strong>
          <span>{money(earnings?.payoutPerDelivery)} per trip</span>
        </div>
        <div className="card stat">
          <small>Lifetime</small>
          <strong>{money(earnings?.lifetime?.earned)}</strong>
          <span>{earnings?.lifetime?.deliveries ?? 0} trips</span>
        </div>
      </div>

      <nav className="tabs">
        <button className={tab === 'jobs' ? 'active' : ''} onClick={() => setTab('jobs')}>
          <PackageCheck size={17} /> Deliveries
          {jobs.length > 0 && <span className="count" aria-label={`${jobs.length} active`}>{jobs.length}</span>}
        </button>
        <button className={tab === 'earnings' ? 'active' : ''} onClick={() => setTab('earnings')}>
          <Wallet size={17} /> Earnings
        </button>
        <button className={tab === 'history' ? 'active' : ''} onClick={() => setTab('history')}>
          <History size={17} /> History
        </button>
      </nav>

      <main className="content">
        {tab === 'jobs' && (
          jobs.length === 0 ? (
            <div className="card empty">
              <span className="chip" aria-hidden="true"><PackageCheck size={22} /></span>
              <p>No deliveries assigned right now</p>
              <small>
                {!known
                  ? 'Loading your deliveries…'
                  : online
                  ? 'Orders a restaurant assigns to you will appear here.'
                  : 'Go online to be assigned deliveries.'}
              </small>
              {known && (
                <button className="btn ghost" onClick={() => refresh(false)} disabled={loading}>
                  <RefreshCw size={16} className={loading ? 'spin' : ''} /> Check again
                </button>
              )}
            </div>
          ) : (
            sortedJobs.map((job) => {
              const state = JOB_STATES[job.status] || { pill: 'grey', note: job.statusLabel || job.status };
              const preparing = PREPARING_STATUSES.includes(job.status);
              return (
                <article key={job.id} className="card job">
                  <div className="job-head">
                    <div className="job-title">
                      <strong>{job.orderNumber}</strong>
                      <span className={`pill ${state.pill}`}>{job.statusLabel || job.status}</span>
                    </div>
                    <b className="amount">{money(job.total)}</b>
                  </div>

                  {job.collectCash && (
                    <div className="alert warn compact">
                      <Banknote size={17} /> Collect {money(job.total)} in cash at the door
                    </div>
                  )}

                  <div className="legs">
                  <div className="leg">
                    <span className="chip" aria-hidden="true"><Store size={18} /></span>
                    <div>
                      <small>Pick up</small>
                      <strong>{job.pickup?.name}</strong>
                      <span>{job.pickup?.address || 'No address on file'}</span>
                    </div>
                    {job.pickup?.phone && (
                      <a className="icon-btn" href={`tel:${job.pickup.phone}`} title="Call restaurant" aria-label="Call restaurant">
                        <Phone size={18} />
                      </a>
                    )}
                  </div>

                  <div className="leg">
                    <span className="chip" aria-hidden="true"><MapPin size={18} /></span>
                    <div>
                      <small>Deliver to</small>
                      <strong>{job.drop?.name || 'Customer'}</strong>
                      <span>{job.drop?.address || 'No address on file'}</span>
                    </div>
                    {job.drop?.phone && (
                      <a className="icon-btn" href={`tel:${job.drop.phone}`} title="Call customer" aria-label="Call customer">
                        <Phone size={18} />
                      </a>
                    )}
                  </div>
                  </div>

                  <DeliveryPrefs prefs={job.deliveryPreferences} />

                  {(job.items || []).length > 0 && (
                  <ul className="items">
                    {(job.items || []).map((i, idx) => (
                      <li key={idx}>
                        <span>{i.name}</span>
                        <b>×{i.quantity}</b>
                      </li>
                    ))}
                  </ul>
                  )}

                  {jobErrors[job.id] && (
                    <div className="alert error compact job-error">{jobErrors[job.id]}</div>
                  )}

                  {state.next ? (
                    <button
                      className="btn primary block big"
                      disabled={busyId === job.id}
                      onClick={() => act(job)}
                    >
                      {busyId === job.id ? 'Saving…' : state.action}
                    </button>
                  ) : (
                    <div className={`job-state ${preparing ? 'waiting' : ''}`}>
                      {preparing && <ChefHat size={18} />}
                      <span>
                        <strong>{state.note}</strong>
                        {preparing && <small>You can pick it up once the restaurant marks it ready.</small>}
                      </span>
                    </div>
                  )}
                </article>
              );
            })
          )
        )}

        {tab === 'earnings' && (
          <div className="card panel">
            <div className="earn-head">
              <span className="chip" aria-hidden="true"><IndianRupee size={19} /></span>
              <div>
                <small>Total earned</small>
                <strong>{money(earnings?.lifetime?.earned)}</strong>
                <small>Across {earnings?.lifetime?.deliveries ?? 0} deliveries</small>
              </div>
            </div>
            <p className="note">
              You earn {money(earnings?.payoutPerDelivery)} per completed delivery. It is credited
              the moment you mark an order delivered.
            </p>
            <h4>Recent payouts</h4>
            {(earnings?.recent || []).length === 0 ? (
              <div className="empty small">
                <span className="chip" aria-hidden="true"><Wallet size={20} /></span>
                <p>No completed deliveries yet</p>
                <small>Payouts appear here once you mark an order delivered.</small>
              </div>
            ) : (
              <ul className="ledger">
                {earnings.recent.map((row) => (
                  <li key={row.orderNumber}>
                    <div>
                      <strong>{row.orderNumber}</strong>
                      <small>{row.restaurant} · {when(row.deliveredAt)}</small>
                    </div>
                    <b className="credit">+{money(row.payout)}</b>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {tab === 'history' && (
          history.length === 0 ? (
            <div className="card empty">
              <span className="chip" aria-hidden="true"><History size={22} /></span>
              <p>No past deliveries yet</p>
              <small>Delivered and cancelled orders will be listed here.</small>
            </div>
          ) : (
            <div className="card panel history-panel">
              <ul className="ledger">
                {history.map((job) => {
                  const cancelled = job.status === 'CANCELLED';
                  const delivered = job.status === 'DELIVERED';
                  // History rows carry no payout of their own; a delivered
                  // order earns the platform's flat per-delivery payout.
                  const payout = job.payout ?? earnings?.payoutPerDelivery;
                  return (
                    <li key={job.id} className={cancelled ? 'cancelled' : ''}>
                      <div>
                        <strong>
                          {delivered && <CheckCircle2 size={16} className="ok" />}
                          {cancelled && <XCircle size={16} className="bad" />}
                          {job.orderNumber}
                          {cancelled && <span className="pill red">Cancelled</span>}
                        </strong>
                        <small>{job.pickup?.name} → {job.drop?.address || '—'}</small>
                        <small>
                          {delivered
                            ? `Delivered ${when(job.deliveredAt)}`
                            : cancelled
                              ? `Placed ${when(job.placedAt)}`
                              : `${job.statusLabel || job.status} · ${when(job.placedAt)}`}
                          {' · '}Order {money(job.total)}
                        </small>
                      </div>
                      {delivered ? (
                        <b className="credit">{payout != null ? `+${money(payout)}` : '—'}</b>
                      ) : (
                        <b className="no-payout">No payout</b>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          )
        )}
      </main>
    </div>
    </>
  );
}

/** How the customer wants the hand-over done, shown on each active job. */
function DeliveryPrefs({ prefs }) {
  if (!prefs) return null;
  const special =
    prefs.instructions ||
    prefs.handover !== 'HAND_TO_ME' ||
    prefs.contactPreference !== 'CALL_ON_ARRIVAL' ||
    prefs.doNotRingBell;
  return (
    <div className={`prefs ${special ? 'special' : ''}`} data-testid="job-prefs">
      <div className="prefs-row">
        <span className="pref-chip"><DoorOpen size={13} /> {prefs.handoverLabel}</span>
        <span className="pref-chip"><Phone size={13} /> {prefs.contactPreferenceLabel}</span>
        {prefs.doNotRingBell && <span className="pref-chip warn"><BellOff size={13} /> Don't ring the bell</span>}
      </div>
      {prefs.instructions && (
        <p className="pref-note"><MessageSquareText size={13} /> {prefs.instructions}</p>
      )}
    </div>
  );
}
