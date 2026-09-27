import React from 'react';
import { 
  Download, 
  Smartphone, 
  Share, 
  PlusSquare, 
  CheckCircle2, 
  X, 
  Sparkles, 
  ExternalLink 
} from 'lucide-react';
import { useApp } from '../context/AppContext';

export default function InstallAppModal({ isOpen, onClose }) {
  const { promptInstall, canInstallPrompt, isIOS, isInstalled } = useApp();

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in">
      <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full p-6 border border-slate-100 animate-in zoom-in-95 space-y-5 relative">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-5 right-5 p-1.5 rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header with App Icon */}
        <div className="flex items-center gap-3.5 pr-8">
          <div className="w-13 h-13 rounded-2xl bg-gradient-to-tr from-indigo-600 via-indigo-700 to-violet-600 flex items-center justify-center text-white shadow-lg shadow-indigo-200 shrink-0">
            <Smartphone className="w-7 h-7" />
          </div>
          <div>
            <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 text-[10px] font-extrabold uppercase tracking-wider mb-1">
              <Sparkles className="w-3 h-3 text-indigo-600" />
              <span>Mobile App</span>
            </div>
            <h3 className="font-black text-lg text-slate-900 leading-tight">
              Install FlatMatePay
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Access roommate expenses directly from your phone screen
            </p>
          </div>
        </div>

        {/* Benefits Grid */}
        <div className="bg-slate-50 rounded-2xl p-3.5 border border-slate-100 space-y-2">
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-700">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>1-Tap home screen access without opening browser tabs</span>
          </div>
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-700">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>Native full-screen interface without browser URL bars</span>
          </div>
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-700">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>Instant UPI payments via GPay, PhonePe, Paytm & BHIM</span>
          </div>
        </div>

        {/* Interactive Action or Platform Guide */}
        {isInstalled ? (
          <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl text-center space-y-1">
            <div className="text-sm font-extrabold text-emerald-800 flex items-center justify-center gap-1.5">
              <CheckCircle2 className="w-5 h-5 text-emerald-600" />
              <span>App Already Installed!</span>
            </div>
            <p className="text-xs text-emerald-700">
              FlatMatePay is installed on this device. You can launch it directly from your home screen or apps list.
            </p>
          </div>
        ) : canInstallPrompt ? (
          <div className="space-y-3">
            <button
              onClick={() => {
                promptInstall();
                onClose();
              }}
              className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 text-white font-extrabold text-sm shadow-md shadow-indigo-200 transition-all active:scale-98 cursor-pointer"
            >
              <Download className="w-4 h-4" />
              <span>Install Application Now</span>
            </button>
            <p className="text-center text-[11px] text-slate-400">
              Clicking will prompt your browser to add the app to your device
            </p>
          </div>
        ) : isIOS ? (
          <div className="space-y-3">
            <div className="text-xs font-bold text-slate-800 uppercase tracking-wider">
              How to Install on iPhone / iPad (Safari):
            </div>
            <ol className="space-y-2.5 text-xs text-slate-600">
              <li className="flex items-start gap-2.5 p-2.5 rounded-xl bg-indigo-50/50 border border-indigo-100">
                <div className="w-5 h-5 rounded-full bg-indigo-600 text-white font-bold text-[10px] flex items-center justify-center shrink-0 mt-0.5">
                  1
                </div>
                <div>
                  Tap the <strong className="text-indigo-950 font-bold inline-flex items-center gap-1">Share button <Share className="w-3.5 h-3.5 text-indigo-600 inline" /></strong> in Safari's bottom toolbar.
                </div>
              </li>
              <li className="flex items-start gap-2.5 p-2.5 rounded-xl bg-indigo-50/50 border border-indigo-100">
                <div className="w-5 h-5 rounded-full bg-indigo-600 text-white font-bold text-[10px] flex items-center justify-center shrink-0 mt-0.5">
                  2
                </div>
                <div>
                  Scroll down the menu and tap <strong className="text-indigo-950 font-bold inline-flex items-center gap-1">"Add to Home Screen" <PlusSquare className="w-3.5 h-3.5 text-indigo-600 inline" /></strong>.
                </div>
              </li>
              <li className="flex items-start gap-2.5 p-2.5 rounded-xl bg-indigo-50/50 border border-indigo-100">
                <div className="w-5 h-5 rounded-full bg-indigo-600 text-white font-bold text-[10px] flex items-center justify-center shrink-0 mt-0.5">
                  3
                </div>
                <div>
                  Tap <strong className="text-indigo-950 font-bold">"Add"</strong> in the top-right corner. The app will appear on your Home Screen!
                </div>
              </li>
            </ol>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="text-xs font-bold text-slate-800 uppercase tracking-wider">
              How to Install (Chrome / Android / Edge):
            </div>
            <ol className="space-y-2 text-xs text-slate-600">
              <li className="flex items-start gap-2 p-2 rounded-xl bg-slate-50 border border-slate-100">
                <span className="font-bold text-slate-900">1.</span>
                <span>Tap the browser menu (<strong>⋮</strong> or three dots in top/bottom bar).</span>
              </li>
              <li className="flex items-start gap-2 p-2 rounded-xl bg-slate-50 border border-slate-100">
                <span className="font-bold text-slate-900">2.</span>
                <span>Select <strong>"Install App"</strong> or <strong>"Add to Home screen"</strong>.</span>
              </li>
              <li className="flex items-start gap-2 p-2 rounded-xl bg-slate-50 border border-slate-100">
                <span className="font-bold text-slate-900">3.</span>
                <span>Confirm install. FlatMatePay will install as a native app!</span>
              </li>
            </ol>
          </div>
        )}

        <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400">
          <span>PWA Version 1.0 • Offline Ready</span>
          <button
            onClick={onClose}
            className="text-indigo-600 font-bold hover:underline cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
