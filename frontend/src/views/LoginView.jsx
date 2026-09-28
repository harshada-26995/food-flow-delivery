import React, { useState, useEffect } from 'react';
import { useRider } from '../context/RiderContext';
import { UtensilsCrossed, Phone, ShieldCheck, Clock, RefreshCw } from 'lucide-react';

/**
 * Rider sign-in: phone number, then a six-digit code.
 *
 * No password and no self-signup. A rider exists because the platform or a
 * restaurant created the record and the platform approved them — the phone
 * number on that record is what proves identity. An unknown or unapproved
 * number is refused at the verify step, never at the "send code" step, so
 * nobody can use this screen to discover which numbers are registered riders.
 */

const RESEND_COOLDOWN_SECONDS = 30;
const FALLBACK_TTL_SECONDS = 300;

const formatPhone = (d) => (d.length <= 5 ? d : `${d.slice(0, 5)} ${d.slice(5)}`);
const countdown = (s) => `${Math.floor(Math.max(0, s) / 60)}:${String(Math.max(0, s) % 60).padStart(2, '0')}`;
const isValidMobile = (d) => /^[6-9]\d{9}$/.test(d);

export default function LoginView() {
  const { sendOtp, verifyOtp, showToast, signOutReason, clearSignOutReason } = useRider();

  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [devCode, setDevCode] = useState('');

  const [expiresAt, setExpiresAt] = useState(0);
  const [resendAt, setResendAt] = useState(0);
  const [, tick] = useState(0);

  useEffect(() => {
    if (!sent) return undefined;
    const id = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [sent]);

  const digits = phone.replace(/\D/g, '');
  const now = Date.now();
  const secondsLeft = Math.ceil((expiresAt - now) / 1000);
  const resendIn = Math.ceil((resendAt - now) / 1000);
  const expired = sent && secondsLeft <= 0;

  const request = async () => {
    setError('');
    clearSignOutReason();
    setBusy(true);
    try {
      const res = await sendOtp(digits);
      const ttl = Number(res.expiresInSeconds) || FALLBACK_TTL_SECONDS;
      setSent(true);
      setOtp('');
      setDevCode(res.otp || '');
      setExpiresAt(Date.now() + ttl * 1000);
      setResendAt(Date.now() + RESEND_COOLDOWN_SECONDS * 1000);
      showToast(res.otp ? `Development code: ${res.otp}` : `Code sent to ${formatPhone(digits)}`);
    } catch (err) {
      setError(
        err.status === 429
          ? 'Too many codes requested for this number. Wait about 15 minutes.'
          : err.message
      );
    } finally {
      setBusy(false);
    }
  };

  const onSendCode = (e) => {
    e.preventDefault();
    if (!isValidMobile(digits)) {
      setError('Enter the 10-digit mobile number registered with FoodFlow.');
      return;
    }
    request();
  };

  const onVerify = async (e) => {
    e.preventDefault();
    if (expired) {
      setError('That code has expired. Request a new one.');
      return;
    }
    setError('');
    setBusy(true);
    try {
      await verifyOtp(digits, otp);
    } catch (err) {
      // The server's own reason: incorrect code, expired code, too many tries.
      setError(err.message || 'Sign-in failed. Try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-screen">
      <div className="auth-top">
        <span className="wordmark">
          <span className="logo-mark" aria-hidden="true">
            <UtensilsCrossed size={16} strokeWidth={2.25} />
          </span>
          <span>Food<span className="accent">Flow</span></span>
        </span>
        <span className="panel-tag">For riders</span>
      </div>
      <div className="auth-card">
        <div className="auth-head">
          <h1>{sent ? 'Enter your code' : 'Sign in to start delivering'}</h1>
          <p>
            {sent
              ? `We sent a 6-digit code to +91 ${formatPhone(digits)}.`
              : 'Use the mobile number registered with FoodFlow.'}
          </p>
        </div>

        {/* A field error from this form wins; otherwise say why the server
            signed the rider out (session expired, approval revoked…). */}
        {(error || signOutReason) && <div className="alert error">{error || signOutReason}</div>}

        {!sent ? (
          <form onSubmit={onSendCode}>
            <label className="field-label" htmlFor="rider-phone">Mobile number</label>
            <div className="input-wrap">
              <Phone size={17} className="input-icon" />
              <span className="input-prefix">+91</span>
              <input
                id="rider-phone"
                autoComplete="tel-national"
                className="input has-prefix"
                type="tel"
                inputMode="numeric"
                autoFocus
                placeholder="98765 43210"
                value={formatPhone(digits)}
                onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
              />
            </div>

            <button className="btn primary block big" disabled={busy || !isValidMobile(digits)}>
              {busy ? 'Sending code…' : 'Send code'}
            </button>

            <p className="fine-print">
              <ShieldCheck size={14} /> Only approved delivery partners can sign in here.
            </p>
          </form>
        ) : (
          <form onSubmit={onVerify}>
            {devCode && (
              <div className="alert info">
                Development mode. Your code is <strong>{devCode}</strong>
              </div>
            )}

            <label className="field-label" htmlFor="rider-otp">6-digit code</label>
            <input
              id="rider-otp"
              autoComplete="one-time-code"
              className="input otp"
              type="text"
              inputMode="numeric"
              maxLength={6}
              autoFocus
              disabled={expired}
              placeholder="000000"
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
            />

            <div className={`countdown ${expired ? 'expired' : ''}`}>
              <Clock size={14} />
              {expired ? 'Code expired. Request a new one.' : `Expires in ${countdown(secondsLeft)}`}
            </div>

            <button className="btn primary block big" disabled={busy || expired || otp.length !== 6}>
              {busy ? 'Verifying…' : 'Verify and start'}
            </button>

            <div className="row-actions">
              <button
                type="button"
                className="btn ghost"
                onClick={() => {
                  setSent(false);
                  setOtp('');
                  setError('');
                  setDevCode('');
                }}
              >
                Change number
              </button>
              <button
                type="button"
                className="btn ghost"
                disabled={busy || resendIn > 0}
                onClick={request}
              >
                <RefreshCw size={15} />
                {resendIn > 0 ? `Resend in ${countdown(resendIn)}` : 'Resend code'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
