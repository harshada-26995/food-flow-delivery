import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

const RiderContext = createContext();

/**
 * Rider session and data.
 *
 * The session is the JWT the API issues after phone + OTP. Holding a token the
 * server accepts is what "signed in" means — there is no separate client-side
 * flag and no cached demo rider, so clearing the token is a real sign-out.
 */
const TOKEN_KEY = 'foodflow_rider_token';

/** Sign-in endpoints answer 401 for a wrong or expired code, not a dead session. */
const AUTH_PREFIX = '/api/delivery/auth/';

/** How soon to try again after a background refresh failed. */
const RETRY_AFTER_ERROR_MS = 8000;

export const RiderProvider = ({ children }) => {
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY) || '');
  const [partner, setPartner] = useState(null);
  const [jobs, setJobs] = useState([]);
  const [history, setHistory] = useState([]);
  const [earnings, setEarnings] = useState(null);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState('');
  // Why the rider was signed out by the server, shown on the login screen.
  const [signOutReason, setSignOutReason] = useState('');
  // Last background refresh failure: { message, at }. `at` changes on every
  // failure so the retry effect below re-arms each time.
  const [refreshError, setRefreshError] = useState(null);

  const isAuthenticated = Boolean(token);

  const showToast = useCallback((message) => {
    setToast(message);
    setTimeout(() => setToast(''), 3000);
  }, []);

  const clearSession = useCallback((message, reason = '') => {
    localStorage.removeItem(TOKEN_KEY);
    setToken('');
    setPartner(null);
    setJobs([]);
    setHistory([]);
    setEarnings(null);
    setRefreshError(null);
    setSignOutReason(reason);
    if (message) showToast(message);
  }, [showToast]);

  const clearSignOutReason = useCallback(() => setSignOutReason(''), []);

  /** Single place the token is attached and a dead session is noticed. */
  const api = useCallback(
    async (path, options = {}) => {
      const current = localStorage.getItem(TOKEN_KEY) || '';
      const { body, ...rest } = options;
      const isAuthCall = path.startsWith(AUTH_PREFIX);

      let res;
      try {
        res = await fetch(path, {
          ...rest,
          headers: {
            'Content-Type': 'application/json',
            ...(current ? { Authorization: `Bearer ${current}` } : {}),
            ...(options.headers || {}),
          },
          ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
        });
      } catch {
        throw new Error('Could not reach the server. Check your connection.');
      }

      const data = await res.json().catch(() => ({}));

      if (!res.ok || data?.success === false) {
        const message = data?.message || `Request failed (${res.status})`;
        const err = new Error(message);
        err.status = res.status;

        // 401 = the token is no longer accepted; 403 = the rider is no longer
        // allowed in (approval revoked, account deactivated). Both end the
        // session — but only for the session that made the request, and never
        // for the sign-in calls, whose 401 means "wrong code".
        const sameSession = current && localStorage.getItem(TOKEN_KEY) === current;
        if (!isAuthCall && sameSession && (res.status === 401 || res.status === 403)) {
          const reason =
            res.status === 401 ? 'Your session expired. Sign in again.' : message;
          clearSession('', reason);
          err.sessionEnded = true;
        }
        throw err;
      }
      return data;
    },
    [clearSession]
  );

  /* ---------------------------------------------------------------- *
   * Authentication
   * ---------------------------------------------------------------- */

  const sendOtp = async (phone) => api('/api/delivery/auth/send-otp', { method: 'POST', body: { phone } });

  const verifyOtp = async (phone, otp) => {
    const data = await api('/api/delivery/auth/verify-otp', { method: 'POST', body: { phone, otp } });
    if (!data.token) throw new Error(data.message || 'Sign-in failed');
    localStorage.setItem(TOKEN_KEY, data.token);
    setSignOutReason('');
    setToken(data.token);
    setPartner(data.partner || null);
    showToast(data.message || 'Signed in');
    return data;
  };

  const logout = () => {
    api('/api/delivery/auth/logout', { method: 'POST' }).catch(() => {});
    clearSession('Signed out');
  };

  /* ---------------------------------------------------------------- *
   * Data
   * ---------------------------------------------------------------- */

  const refresh = useCallback(
    async (silent = false) => {
      const startedWith = localStorage.getItem(TOKEN_KEY);
      if (!startedWith) return false;
      if (!silent) setLoading(true);
      try {
        const [me, active, past, money] = await Promise.all([
          api('/api/delivery/me'),
          api('/api/delivery/orders?scope=active'),
          api('/api/delivery/orders?scope=history'),
          api('/api/delivery/earnings'),
        ]);
        // Signed out (or in as someone else) while this was in flight.
        if (localStorage.getItem(TOKEN_KEY) !== startedWith) return false;
        setPartner(me.partner || null);
        setJobs(active.data || []);
        setHistory(past.data || []);
        setEarnings(money);
        setRefreshError(null);
        return true;
      } catch (err) {
        // A session the server ended is already handled (login screen shows
        // why). Anything else is surfaced as a banner and retried — never
        // swallowed, and never thrown at the rider mid-job.
        if (!err.sessionEnded && localStorage.getItem(TOKEN_KEY) === startedWith) {
          setRefreshError({ message: err.message, at: Date.now() });
          if (!silent) showToast(err.message);
        }
        return false;
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [api, showToast]
  );

  useEffect(() => {
    if (!isAuthenticated) return undefined;
    refresh(false);

    /*
     * A rider is waiting on the restaurant to mark an order ready, so the job
     * list has to move without them pulling to refresh. Twenty seconds is
     * often enough for that, and it pauses while the screen is not in front
     * of them — this runs on a phone, on mobile data, on a battery.
     */
    const tick = () => {
      if (!document.hidden) refresh(true);
    };
    const interval = setInterval(tick, 20000);
    document.addEventListener('visibilitychange', tick);
    window.addEventListener('online', tick);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', tick);
      window.removeEventListener('online', tick);
    };
  }, [isAuthenticated, refresh]);

  // After a failed refresh, try again sooner than the regular poll.
  useEffect(() => {
    if (!isAuthenticated || !refreshError) return undefined;
    const id = setTimeout(() => {
      if (!document.hidden) refresh(true);
    }, RETRY_AFTER_ERROR_MS);
    return () => clearTimeout(id);
  }, [isAuthenticated, refreshError, refresh]);

  /* ---------------------------------------------------------------- *
   * Actions
   *
   * Each returns { ok, message } so the screen can show the server's own
   * words next to the control, and never reports success it did not get.
   * ---------------------------------------------------------------- */

  const setAvailability = async (status) => {
    try {
      const data = await api('/api/delivery/availability', { method: 'PUT', body: { status } });
      if (data.partner) setPartner(data.partner);
      showToast(data.message || 'Availability updated');
      return { ok: true };
    } catch (err) {
      // The server may know something we don't (e.g. a job was assigned);
      // re-read so the toggle shows what is actually recorded.
      if (!err.sessionEnded) refresh(true);
      return { ok: false, message: err.message };
    }
  };

  const advanceJob = async (orderId, status) => {
    try {
      const data = await api(`/api/delivery/orders/${orderId}/status`, {
        method: 'PUT',
        body: { status },
      });
      showToast(data.message || 'Updated');
      if (data.partner) setPartner(data.partner);
      // Re-read rather than patching locally, so earnings and the job list
      // reflect what the server actually recorded.
      await refresh(true);
      return { ok: true };
    } catch (err) {
      // The order may have been cancelled or reassigned meanwhile.
      if (!err.sessionEnded) refresh(true);
      return { ok: false, message: err.message };
    }
  };

  return (
    <RiderContext.Provider
      value={{
        isAuthenticated,
        partner,
        jobs,
        history,
        earnings,
        loading,
        toast,
        signOutReason,
        refreshError,
        showToast,
        clearSignOutReason,
        sendOtp,
        verifyOtp,
        logout,
        refresh,
        setAvailability,
        advanceJob,
        api,
      }}
    >
      {children}
    </RiderContext.Provider>
  );
};

export const useRider = () => useContext(RiderContext);
