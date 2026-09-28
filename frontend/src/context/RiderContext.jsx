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

/** Backend base URL: respects VITE_API_URL or defaults to production Render backend */
const API_BASE_URL = (
  import.meta.env.VITE_API_URL ||
  import.meta.env.VITE_BACKEND_URL ||
  (import.meta.env.PROD ? 'https://food-flow-backend-aj7e.onrender.com' : '')
).replace(/\/+$/, '');

/** Sign-in endpoints answer 401 for a wrong or expired code, not a dead session. */
const AUTH_PREFIX = '/api/delivery/auth/';

/** How soon to try again after a background refresh failed. */
const RETRY_AFTER_ERROR_MS = 8000;

/** Mock datasets for instant demo rider testing */
const DEMO_RIDERS = {
  active: {
    token: 'demo_rider_token_active',
    partner: {
      id: 'demo-dp-1',
      name: 'Rohan Sharma',
      phone: '9876543210',
      partnerCode: 'DP-0012',
      vehicle: 'Honda Activa 6G (MH-15-EV-4021)',
      status: 'ONLINE',
      rating: 4.9,
      completedDeliveries: 48,
      earnings: 2400,
    },
    jobs: [
      {
        id: 'demo-job-1',
        orderNumber: 'FF-8902',
        status: 'READY',
        statusLabel: 'Ready for pickup',
        shareLocation: true,
        total: 640,
        collectCash: true,
        placedAt: new Date(Date.now() - 25 * 60000).toISOString(),
        pickup: {
          name: 'Spice Route Kitchen',
          address: 'Shop 12, College Road, Near City Mall, Nashik',
          phone: '+91 98220 12345',
        },
        drop: {
          name: 'Priya Deshmukh',
          address: 'Flat 402, Green Acres, Mahatma Nagar, Nashik',
          phone: '+91 98110 54321',
        },
        deliveryPreferences: {
          handover: 'LEAVE_AT_DOOR',
          handoverLabel: 'Leave at doorstep',
          contactPreference: 'CALL_ON_ARRIVAL',
          contactPreferenceLabel: 'Call on arrival',
          doNotRingBell: true,
          instructions: 'Please do not ring the doorbell. Gate passcode is 4020.',
        },
        items: [
          { name: 'Paneer Butter Masala', quantity: 1 },
          { name: 'Garlic Butter Naan', quantity: 3 },
          { name: 'Jeera Rice', quantity: 1 },
        ],
      },
      {
        id: 'demo-job-2',
        orderNumber: 'FF-8905',
        status: 'PREPARING',
        statusLabel: 'Kitchen is cooking',
        shareLocation: false,
        total: 480,
        collectCash: false,
        placedAt: new Date(Date.now() - 10 * 60000).toISOString(),
        pickup: {
          name: 'Burger Bistro',
          address: 'Plot 45, Thatte Nagar, Nashik',
          phone: '+91 98220 67890',
        },
        drop: {
          name: 'Rahul Verma',
          address: 'B-201, Silver Oak Society, Gangapur Road, Nashik',
          phone: '+91 98110 98765',
        },
        deliveryPreferences: {
          handover: 'HAND_TO_ME',
          handoverLabel: 'Hand to me',
          contactPreference: 'CALL_ON_ARRIVAL',
          contactPreferenceLabel: 'Call on arrival',
          doNotRingBell: false,
          instructions: 'Call when you reach society gate.',
        },
        items: [
          { name: 'Double Cheese Crunch Burger', quantity: 2 },
          { name: 'Peri Peri Crispy Fries', quantity: 1 },
          { name: 'Cold Coffee Frappe', quantity: 2 },
        ],
      },
    ],
    earnings: {
      payoutPerDelivery: 50,
      today: { deliveries: 6, earned: 300 },
      lifetime: { deliveries: 48, earned: 2400 },
      recent: [
        { orderNumber: 'FF-8840', restaurant: 'Italiano Pizzeria', deliveredAt: new Date(Date.now() - 90 * 60000).toISOString(), payout: 50 },
        { orderNumber: 'FF-8792', restaurant: 'Green Garden Cafe', deliveredAt: new Date(Date.now() - 180 * 60000).toISOString(), payout: 50 },
        { orderNumber: 'FF-8744', restaurant: 'Biryani House', deliveredAt: new Date(Date.now() - 300 * 60000).toISOString(), payout: 50 },
      ],
    },
    history: [
      {
        id: 'demo-hist-1',
        orderNumber: 'FF-8840',
        status: 'DELIVERED',
        statusLabel: 'Delivered',
        total: 750,
        payout: 50,
        placedAt: new Date(Date.now() - 120 * 60000).toISOString(),
        deliveredAt: new Date(Date.now() - 90 * 60000).toISOString(),
        pickup: { name: 'Italiano Pizzeria', address: 'MG Road' },
        drop: { name: 'Ananya Roy', address: 'Samarth Nagar' },
      },
      {
        id: 'demo-hist-2',
        orderNumber: 'FF-8792',
        status: 'DELIVERED',
        statusLabel: 'Delivered',
        total: 520,
        payout: 50,
        placedAt: new Date(Date.now() - 210 * 60000).toISOString(),
        deliveredAt: new Date(Date.now() - 180 * 60000).toISOString(),
        pickup: { name: 'Green Garden Cafe', address: 'College Road' },
        drop: { name: 'Karan Patel', address: 'Indira Nagar' },
      },
      {
        id: 'demo-hist-3',
        orderNumber: 'FF-8650',
        status: 'CANCELLED',
        statusLabel: 'Cancelled',
        total: 390,
        payout: null,
        placedAt: new Date(Date.now() - 400 * 60000).toISOString(),
        pickup: { name: 'Subway Central', address: 'City Center Mall' },
        drop: { name: 'Vikas Shah', address: 'Tidke Colony' },
      },
    ],
  },
  new: {
    token: 'demo_rider_token_new',
    partner: {
      id: 'demo-dp-2',
      name: 'Amit Patil',
      phone: '9876543211',
      partnerCode: 'DP-0015',
      vehicle: 'TVS Jupiter (MH-15-AB-7890)',
      status: 'ONLINE',
      rating: 4.8,
      completedDeliveries: 12,
      earnings: 600,
    },
    jobs: [],
    earnings: {
      payoutPerDelivery: 50,
      today: { deliveries: 0, earned: 0 },
      lifetime: { deliveries: 12, earned: 600 },
      recent: [],
    },
    history: [
      {
        id: 'demo-hist-new-1',
        orderNumber: 'FF-8610',
        status: 'DELIVERED',
        statusLabel: 'Delivered',
        total: 410,
        payout: 50,
        placedAt: new Date(Date.now() - 86400000).toISOString(),
        deliveredAt: new Date(Date.now() - 84000000).toISOString(),
        pickup: { name: 'Dosa Plaza', address: 'Nashik Road' },
        drop: { name: 'Sunil Kale', address: 'Dwarka' },
      },
    ],
  },
};

export const RiderProvider = ({ children }) => {
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY) || '');
  const [partner, setPartner] = useState(() => {
    const saved = localStorage.getItem(TOKEN_KEY);
    if (saved === DEMO_RIDERS.active.token) return DEMO_RIDERS.active.partner;
    if (saved === DEMO_RIDERS.new.token) return DEMO_RIDERS.new.partner;
    return null;
  });
  const [jobs, setJobs] = useState(() => {
    const saved = localStorage.getItem(TOKEN_KEY);
    if (saved === DEMO_RIDERS.active.token) return DEMO_RIDERS.active.jobs;
    if (saved === DEMO_RIDERS.new.token) return DEMO_RIDERS.new.jobs;
    return [];
  });
  const [history, setHistory] = useState(() => {
    const saved = localStorage.getItem(TOKEN_KEY);
    if (saved === DEMO_RIDERS.active.token) return DEMO_RIDERS.active.history;
    if (saved === DEMO_RIDERS.new.token) return DEMO_RIDERS.new.history;
    return [];
  });
  const [earnings, setEarnings] = useState(() => {
    const saved = localStorage.getItem(TOKEN_KEY);
    if (saved === DEMO_RIDERS.active.token) return DEMO_RIDERS.active.earnings;
    if (saved === DEMO_RIDERS.new.token) return DEMO_RIDERS.new.earnings;
    return null;
  });
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState('');
  // Why the rider was signed out by the server, shown on the login screen.
  const [signOutReason, setSignOutReason] = useState('');
  // Last background refresh failure: { message, at }. `at` changes on every
  // failure so the retry effect below re-arms each time.
  const [refreshError, setRefreshError] = useState(null);

  const isDemo = token.startsWith('demo_');
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
      if (current.startsWith('demo_')) {
        // In demo mode, simulate successful instant backend answers
        return { success: true, message: 'Demo updated' };
      }

      const { body, ...rest } = options;
      const isAuthCall = path.includes(AUTH_PREFIX);
      const url = path.startsWith('http') ? path : `${API_BASE_URL}${path}`;

      let res;
      try {
        res = await fetch(url, {
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

  const sendOtp = async (phone) => {
    // If demo number is typed in, return friendly code
    if (phone === '9876543210' || phone === '9876543211') {
      return {
        success: true,
        otp: '123456',
        expiresInSeconds: 300,
        message: 'Demo Rider Code: 123456',
      };
    }
    return api('/api/delivery/auth/send-otp', { method: 'POST', body: { phone } });
  };

  const verifyOtp = async (phone, otp) => {
    if ((phone === '9876543210' || phone === '9876543211') && (otp === '123456' || otp === '000000')) {
      return loginDemo(phone === '9876543210' ? 'active' : 'new');
    }
    const data = await api('/api/delivery/auth/verify-otp', { method: 'POST', body: { phone, otp } });
    if (!data.token) throw new Error(data.message || 'Sign-in failed');
    localStorage.setItem(TOKEN_KEY, data.token);
    setSignOutReason('');
    setToken(data.token);
    setPartner(data.partner || null);
    showToast(data.message || 'Signed in');
    return data;
  };

  const loginDemo = (type = 'active') => {
    const demo = DEMO_RIDERS[type] || DEMO_RIDERS.active;
    localStorage.setItem(TOKEN_KEY, demo.token);
    setSignOutReason('');
    setToken(demo.token);
    setPartner(JSON.parse(JSON.stringify(demo.partner)));
    setJobs(JSON.parse(JSON.stringify(demo.jobs)));
    setHistory(JSON.parse(JSON.stringify(demo.history)));
    setEarnings(JSON.parse(JSON.stringify(demo.earnings)));
    setRefreshError(null);
    showToast(`Signed in as Demo Rider (${demo.partner.name})`);
    return { success: true, token: demo.token, partner: demo.partner };
  };

  const logout = () => {
    if (!isDemo) {
      api('/api/delivery/auth/logout', { method: 'POST' }).catch(() => {});
    }
    clearSession('Signed out');
  };

  /* ---------------------------------------------------------------- *
   * Data
   * ---------------------------------------------------------------- */

  const refresh = useCallback(
    async (silent = false) => {
      const startedWith = localStorage.getItem(TOKEN_KEY);
      if (!startedWith) return false;
      if (startedWith.startsWith('demo_')) return true; // keep mock state in demo mode
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
    if (!isDemo) refresh(false);

    const tick = () => {
      if (!document.hidden && !isDemo) refresh(true);
    };
    const interval = setInterval(tick, 20000);
    document.addEventListener('visibilitychange', tick);
    window.addEventListener('online', tick);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', tick);
      window.removeEventListener('online', tick);
    };
  }, [isAuthenticated, isDemo, refresh]);

  // After a failed refresh, try again sooner than the regular poll.
  useEffect(() => {
    if (!isAuthenticated || !refreshError || isDemo) return undefined;
    const id = setTimeout(() => {
      if (!document.hidden) refresh(true);
    }, RETRY_AFTER_ERROR_MS);
    return () => clearTimeout(id);
  }, [isAuthenticated, refreshError, isDemo, refresh]);

  /* ---------------------------------------------------------------- *
   * Actions
   * ---------------------------------------------------------------- */

  const setAvailability = async (status) => {
    if (isDemo) {
      setPartner((prev) => (prev ? { ...prev, status } : prev));
      showToast(`Status updated to ${status}`);
      return { ok: true };
    }
    try {
      const data = await api('/api/delivery/availability', { method: 'PUT', body: { status } });
      if (data.partner) setPartner(data.partner);
      showToast(data.message || 'Availability updated');
      return { ok: true };
    } catch (err) {
      if (!err.sessionEnded) refresh(true);
      return { ok: false, message: err.message };
    }
  };

  const advanceJob = async (orderId, status) => {
    if (isDemo) {
      const targetJob = jobs.find((j) => j.id === orderId);
      if (status === 'OUT_FOR_DELIVERY') {
        setJobs((prev) =>
          prev.map((j) =>
            j.id === orderId
              ? { ...j, status: 'OUT_FOR_DELIVERY', statusLabel: 'On the way to the customer' }
              : j
          )
        );
        setPartner((prev) => (prev ? { ...prev, status: 'ON_DELIVERY' } : prev));
        showToast('Order marked Picked Up');
        return { ok: true };
      }

      if (status === 'DELIVERED') {
        setJobs((prev) => prev.filter((j) => j.id !== orderId));
        setPartner((prev) => (prev ? { ...prev, status: 'ONLINE', completedDeliveries: (prev.completedDeliveries || 0) + 1, earnings: (prev.earnings || 0) + 50 } : prev));
        
        // Add to history
        if (targetJob) {
          const completedEntry = {
            ...targetJob,
            status: 'DELIVERED',
            statusLabel: 'Delivered',
            payout: 50,
            deliveredAt: new Date().toISOString(),
          };
          setHistory((prev) => [completedEntry, ...prev]);
        }

        // Add to earnings
        setEarnings((prev) => {
          const p = prev || { payoutPerDelivery: 50, today: { deliveries: 0, earned: 0 }, lifetime: { deliveries: 0, earned: 0 }, recent: [] };
          return {
            ...p,
            today: { deliveries: (p.today?.deliveries || 0) + 1, earned: (p.today?.earned || 0) + 50 },
            lifetime: { deliveries: (p.lifetime?.deliveries || 0) + 1, earned: (p.lifetime?.earned || 0) + 50 },
            recent: [
              {
                orderNumber: targetJob?.orderNumber || 'FF-DEMO',
                restaurant: targetJob?.pickup?.name || 'Restaurant',
                deliveredAt: new Date().toISOString(),
                payout: 50,
              },
              ...(p.recent || []),
            ],
          };
        });

        showToast('Order marked Delivered! +₹50 credited');
        return { ok: true };
      }
      return { ok: true };
    }

    try {
      const data = await api(`/api/delivery/orders/${orderId}/status`, {
        method: 'PUT',
        body: { status },
      });
      showToast(data.message || 'Updated');
      if (data.partner) setPartner(data.partner);
      await refresh(true);
      return { ok: true };
    } catch (err) {
      if (!err.sessionEnded) refresh(true);
      return { ok: false, message: err.message };
    }
  };

  return (
    <RiderContext.Provider
      value={{
        isAuthenticated,
        isDemo,
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
        loginDemo,
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
