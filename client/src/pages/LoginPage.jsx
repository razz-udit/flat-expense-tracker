import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { 
  Building2, 
  QrCode, 
  AlertCircle, 
  CheckCircle2, 
  ArrowRight, 
  ShieldCheck, 
  Sparkles, 
  Download, 
  Smartphone,
  Mail,
  User
} from 'lucide-react';

function GoogleLogo({ className = "w-5 h-5" }) {
  return (
    <svg className={className} viewBox="0 0 24 24">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
      />
    </svg>
  );
}

export default function LoginPage() {
  const navigate = useNavigate();
  const { loginWithGoogle, addToast, promptInstall, currentUser } = useApp();

  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  
  // Pending Google data for new members who need to register their settlement UPI ID
  const [pendingGoogleData, setPendingGoogleData] = useState(null);
  const [upiInput, setUpiInput] = useState('');

  // Fallback Google Sign-In state (when VITE_GOOGLE_CLIENT_ID is not configured)
  const [showManualGoogleModal, setShowManualGoogleModal] = useState(false);
  const [manualGoogleEmail, setManualGoogleEmail] = useState('');
  const [manualGoogleName, setManualGoogleName] = useState('');
  const [manualGoogleUpi, setManualGoogleUpi] = useState('');

  const googleBtnRef = useRef(null);
  const googleClientId = import.meta.env?.VITE_GOOGLE_CLIENT_ID;

  // If already logged in, redirect to dashboard
  useEffect(() => {
    if (currentUser) {
      navigate('/', { replace: true });
    }
  }, [currentUser, navigate]);

  const handleGoogleCredentialResponse = useCallback(async (response) => {
    if (!response?.credential) {
      setErrorMsg('Google Sign-In was cancelled or failed.');
      return;
    }

    try {
      setIsLoading(true);
      setErrorMsg('');
      const member = await loginWithGoogle({ credential: response.credential });
      addToast(`Welcome, ${member.name}! Signed in via Google.`, 'success');
      navigate('/', { replace: true });
    } catch (err) {
      console.error('Google Sign-In error:', err);
      if (err.message && err.message.includes('NEEDS_UPI_ID')) {
        // Parse payload to pre-fill name and email for completing registration
        try {
          const payload = JSON.parse(atob(response.credential.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
          setPendingGoogleData({
            credential: response.credential,
            email: payload.email,
            name: payload.name,
            avatar_url: payload.picture,
            google_id: payload.sub,
          });
        } catch {
          setPendingGoogleData({ credential: response.credential });
        }
      } else {
        setErrorMsg(err.message || 'Google authentication failed.');
      }
    } finally {
      setIsLoading(false);
    }
  }, [loginWithGoogle, addToast, navigate]);

  // Initialize Google Identity Services (GSI) if client ID is configured
  useEffect(() => {
    if (!googleClientId) return;

    const checkAndInitGoogle = () => {
      if (window.google?.accounts?.id && googleBtnRef.current) {
        try {
          window.google.accounts.id.initialize({
            client_id: googleClientId,
            callback: handleGoogleCredentialResponse,
            auto_select: false,
          });

          window.google.accounts.id.renderButton(googleBtnRef.current, {
            theme: 'filled_blue',
            size: 'large',
            shape: 'pill',
            width: 320,
            text: 'continue_with',
          });
        } catch (err) {
          console.error('Failed to initialize Google Sign-In button:', err);
        }
      }
    };

    checkAndInitGoogle();
    const interval = setInterval(checkAndInitGoogle, 500);
    const timeout = setTimeout(() => clearInterval(interval), 5000);

    return () => {
      clearInterval(interval);
      clearTimeout(timeout);
    };
  }, [googleClientId, handleGoogleCredentialResponse]);

  const handleCompleteGoogleRegistration = async (e) => {
    e.preventDefault();
    setErrorMsg('');

    if (!upiInput.trim() || !upiInput.includes('@') || upiInput.trim().length < 3) {
      setErrorMsg('Please enter a valid UPI ID (e.g. yourname@okaxis or 9876543210@paytm) so flatmates can settle debts with you.');
      return;
    }

    try {
      setIsLoading(true);
      const member = await loginWithGoogle({
        ...pendingGoogleData,
        upi_id: upiInput.trim(),
      });
      addToast(`Welcome to the flat, ${member.name}! Account registered with Google.`, 'success');
      navigate('/', { replace: true });
    } catch (err) {
      console.error('Registration error:', err);
      setErrorMsg(err.message || 'Failed to complete registration.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleManualGoogleAuthSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg('');

    if (!manualGoogleEmail.trim() || !manualGoogleEmail.includes('@')) {
      setErrorMsg('Please enter a valid Google email address.');
      return;
    }

    if (!manualGoogleName.trim() || manualGoogleName.trim().length < 2) {
      setErrorMsg('Please enter your full name (at least 2 characters).');
      return;
    }

    if (!manualGoogleUpi.trim() || !manualGoogleUpi.includes('@')) {
      setErrorMsg('A valid UPI ID is mandatory for receiving flat payments (e.g. name@okhdfcbank or 9876543210@paytm).');
      return;
    }

    try {
      setIsLoading(true);
      const member = await loginWithGoogle({
        email: manualGoogleEmail.trim().toLowerCase(),
        name: manualGoogleName.trim(),
        upi_id: manualGoogleUpi.trim(),
        avatar_url: `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(manualGoogleName.trim())}`,
      });
      addToast(`Welcome, ${member.name}! Signed in via Google.`, 'success');
      setShowManualGoogleModal(false);
      navigate('/', { replace: true });
    } catch (err) {
      console.error('Google Auth error:', err);
      setErrorMsg(err.message || 'Failed to authenticate with Google.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleClick = () => {
    if (googleClientId && window.google?.accounts?.id) {
      window.google.accounts.id.prompt();
    } else {
      setShowManualGoogleModal(true);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 text-white flex flex-col justify-between p-4 sm:p-6 lg:p-8">
      {/* Header */}
      <header className="max-w-md w-full mx-auto flex items-center justify-between pt-2 pb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-indigo-600 flex items-center justify-center text-white shadow-lg shadow-indigo-500/30">
            <Building2 className="w-5 h-5" />
          </div>
          <div>
            <h1 className="font-extrabold text-xl tracking-tight">
              FlatMate<span className="text-indigo-400">Pay</span>
            </h1>
            <p className="text-xs text-indigo-200/70 font-medium">Flat Expense & Settlement Manager</p>
          </div>
        </div>

        <button
          type="button"
          onClick={promptInstall}
          className="flex items-center gap-1.5 text-xs text-white font-bold bg-white/10 hover:bg-white/20 active:scale-95 px-3 py-1.5 rounded-xl border border-white/20 shadow-sm transition-all cursor-pointer"
          title="Install FlatMatePay App"
        >
          <Download className="w-3.5 h-3.5 text-indigo-300" />
          <span>Install App</span>
        </button>
      </header>

      {/* Main Card */}
      <main className="max-w-md w-full mx-auto my-auto py-4">
        <div className="bg-white/10 backdrop-blur-xl border border-white/15 rounded-3xl p-6 sm:p-8 shadow-2xl space-y-6">
          {/* Title Area */}
          <div className="text-center space-y-2">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-indigo-500/20 border border-indigo-500/30 text-indigo-300 text-xs font-semibold mb-1">
              <ShieldCheck className="w-3.5 h-3.5 text-indigo-400" />
              <span>Mandatory Google Authentication</span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
              {pendingGoogleData ? 'Almost Done!' : 'Sign In with Google'}
            </h2>
            <p className="text-xs sm:text-sm text-slate-300 max-w-sm mx-auto">
              {pendingGoogleData
                ? 'Please add your personal UPI ID so flatmates can settle debts with you instantly.'
                : 'Sign in directly with your Google account. No passwords to remember or forget!'}
            </p>
          </div>

          {/* Error Alert */}
          {errorMsg && (
            <div className="p-3.5 rounded-2xl bg-rose-500/20 border border-rose-500/40 text-rose-200 text-xs flex items-start gap-2.5 animate-in fade-in">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <span className="leading-relaxed">{errorMsg}</span>
            </div>
          )}

          {/* Step 2: Prompt for UPI ID if new user signing up via Google */}
          {pendingGoogleData ? (
            <form onSubmit={handleCompleteGoogleRegistration} className="space-y-4">
              <div className="bg-slate-900/60 p-3.5 rounded-2xl border border-slate-700/60 text-xs space-y-1">
                <div className="font-bold text-white flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  <span>Google Account Verified</span>
                </div>
                {pendingGoogleData.name && (
                  <p className="text-slate-300 font-medium">Name: {pendingGoogleData.name}</p>
                )}
                {pendingGoogleData.email && (
                  <p className="text-slate-400">Email: {pendingGoogleData.email}</p>
                )}
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-1.5">
                  Your UPI ID <span className="text-rose-400">*</span>
                </label>
                <div className="relative">
                  <span className="absolute left-3.5 top-3 text-slate-400">
                    <QrCode className="w-4 h-4" />
                  </span>
                  <input
                    type="text"
                    required
                    placeholder="e.g. rahul@okaxis or 9876543210@paytm"
                    value={upiInput}
                    onChange={(e) => setUpiInput(e.target.value)}
                    className="w-full pl-10 pr-3.5 py-2.5 rounded-xl bg-slate-900/80 border border-slate-700/80 text-white placeholder-slate-500 text-sm font-semibold focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400 transition-all"
                  />
                </div>
                <p className="text-[11px] text-slate-400 mt-1">
                  Required for flat settlements so roommates can send you payments with 1 click.
                </p>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setPendingGoogleData(null)}
                  className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold transition-all cursor-pointer"
                >
                  Back
                </button>
                <button
                  type="submit"
                  disabled={isLoading}
                  className="flex-1 py-2.5 px-4 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white font-bold text-xs shadow-lg shadow-indigo-600/30 flex items-center justify-center gap-2 transition-all active:scale-[0.98] cursor-pointer disabled:opacity-50"
                >
                  {isLoading ? (
                    <span>Registering...</span>
                  ) : (
                    <>
                      <span>Complete Google Sign Up</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </div>
            </form>
          ) : (
            /* Primary Mandatory Google Sign-In Action */
            <div className="space-y-4">
              {/* Google Button Container (rendered by Google GIS if client ID configured) */}
              <div className="flex flex-col items-center justify-center space-y-3">
                <div ref={googleBtnRef} id="google-btn-container" className="min-h-[44px] flex items-center justify-center"></div>

                {/* Custom Google Sign In Button */}
                <button
                  type="button"
                  onClick={handleGoogleClick}
                  disabled={isLoading}
                  className="w-full py-3.5 px-4 rounded-2xl bg-white hover:bg-slate-100 active:scale-[0.98] text-slate-900 font-black text-sm shadow-xl flex items-center justify-center gap-3 transition-all cursor-pointer border border-slate-200"
                >
                  <GoogleLogo className="w-5 h-5 shrink-0" />
                  <span>Continue with Google</span>
                </button>
              </div>

              {/* Security highlights */}
              <div className="bg-slate-900/60 p-4 rounded-2xl border border-white/10 space-y-2 text-xs text-slate-300">
                <div className="flex items-center gap-2 font-bold text-indigo-300">
                  <Sparkles className="w-4 h-4" />
                  <span>Why Google Only?</span>
                </div>
                <ul className="space-y-1 text-slate-400 text-[11px] list-disc list-inside">
                  <li>No passwords to remember, reset, or forget.</li>
                  <li>One-click instant authentication on phone and desktop.</li>
                  <li>Guaranteed account ownership for expense verification.</li>
                </ul>
              </div>
            </div>
          )}
        </div>

        {/* Manual / Development Google Sign-In Modal */}
        {showManualGoogleModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in">
            <div className="bg-slate-900 border border-slate-700 max-w-md w-full rounded-3xl p-6 shadow-2xl space-y-5">
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <div className="flex items-center gap-2.5">
                  <GoogleLogo className="w-5 h-5" />
                  <h3 className="font-extrabold text-base text-white">Google Sign-In</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setShowManualGoogleModal(false)}
                  className="text-slate-400 hover:text-white p-1 rounded-lg cursor-pointer text-sm"
                >
                  ✕
                </button>
              </div>

              <p className="text-xs text-slate-300">
                Sign in with your Google account credentials. If you are a new roommate, your account will be created automatically.
              </p>

              <form onSubmit={handleManualGoogleAuthSubmit} className="space-y-3.5">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-1">
                    Google Email <span className="text-indigo-400">*</span>
                  </label>
                  <div className="relative">
                    <span className="absolute left-3.5 top-3 text-slate-400">
                      <Mail className="w-4 h-4" />
                    </span>
                    <input
                      type="email"
                      required
                      placeholder="e.g. uditraj@gmail.com"
                      value={manualGoogleEmail}
                      onChange={(e) => setManualGoogleEmail(e.target.value)}
                      className="w-full pl-10 pr-3.5 py-2.5 rounded-xl bg-slate-800/80 border border-slate-700 text-white placeholder-slate-500 text-xs font-semibold focus:outline-none focus:border-indigo-400"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-1">
                    Your Full Name <span className="text-indigo-400">*</span>
                  </label>
                  <div className="relative">
                    <span className="absolute left-3.5 top-3 text-slate-400">
                      <User className="w-4 h-4" />
                    </span>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Udit Raj"
                      value={manualGoogleName}
                      onChange={(e) => setManualGoogleName(e.target.value)}
                      className="w-full pl-10 pr-3.5 py-2.5 rounded-xl bg-slate-800/80 border border-slate-700 text-white placeholder-slate-500 text-xs font-semibold focus:outline-none focus:border-indigo-400"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-1">
                    Your Settlement UPI ID <span className="text-rose-400">*</span>
                  </label>
                  <div className="relative">
                    <span className="absolute left-3.5 top-3 text-slate-400">
                      <QrCode className="w-4 h-4" />
                    </span>
                    <input
                      type="text"
                      required
                      placeholder="e.g. 7992311040@paytm or name@okhdfcbank"
                      value={manualGoogleUpi}
                      onChange={(e) => setManualGoogleUpi(e.target.value)}
                      className="w-full pl-10 pr-3.5 py-2.5 rounded-xl bg-slate-800/80 border border-slate-700 text-white placeholder-slate-500 text-xs font-semibold focus:outline-none focus:border-indigo-400"
                    />
                  </div>
                  <p className="text-[10px] text-slate-400 mt-1">
                    Used so flatmates can pay you when debts are settled.
                  </p>
                </div>

                <div className="pt-2 flex gap-2">
                  <button
                    type="button"
                    onClick={() => setShowManualGoogleModal(false)}
                    className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isLoading}
                    className="flex-1 py-2.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs flex items-center justify-center gap-2 cursor-pointer shadow-md"
                  >
                    {isLoading ? <span>Signing In...</span> : <span>Sign In with Google</span>}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Mobile Install App banner (preserved exclusively on login page) */}
        <div className="mt-3 p-3 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-between text-xs backdrop-blur-md">
          <div className="flex items-center gap-2">
            <Smartphone className="w-4 h-4 text-indigo-400" />
            <span className="text-slate-300">Using FlatMatePay on mobile?</span>
          </div>
          <button
            type="button"
            onClick={promptInstall}
            className="text-indigo-300 font-bold hover:text-white underline cursor-pointer"
          >
            Install to Home Screen →
          </button>
        </div>
      </main>

      {/* Footer */}
      <footer className="max-w-md w-full mx-auto text-center py-3 text-xs text-slate-500">
        FlatMatePay • Protected with Google OAuth
      </footer>
    </div>
  );
}
