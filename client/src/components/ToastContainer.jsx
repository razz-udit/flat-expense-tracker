import React from 'react';
import { useApp } from '../context/AppContext';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';

export default function ToastContainer() {
  const { toasts, removeToast } = useApp();

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-5 right-5 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none">
      {toasts.map((toast) => {
        const isError = toast.type === 'error';
        const isSuccess = toast.type === 'success';

        return (
          <div
            key={toast.id}
            className={`pointer-events-auto flex items-start gap-3 p-3.5 rounded-xl shadow-lg border backdrop-blur-sm transition-all animate-in slide-in-from-bottom-2 ${
              isError
                ? 'bg-rose-50/95 border-rose-200 text-rose-900'
                : isSuccess
                ? 'bg-emerald-50/95 border-emerald-200 text-emerald-900'
                : 'bg-white/95 border-slate-200 text-slate-800'
            }`}
          >
            {isError ? (
              <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
            ) : isSuccess ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
            ) : (
              <Info className="w-5 h-5 text-indigo-600 shrink-0 mt-0.5" />
            )}

            <div className="flex-1 text-sm font-medium leading-snug">{toast.message}</div>

            <button
              onClick={() => removeToast(toast.id)}
              className="text-slate-400 hover:text-slate-600 p-0.5 rounded cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
