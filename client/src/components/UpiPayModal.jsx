import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { api } from '../services/api';
import { 
  X, 
  QrCode, 
  Copy, 
  Check, 
  ExternalLink, 
  CheckCircle2, 
  Smartphone, 
  Banknote, 
  Building,
  ShieldCheck,
  ChevronDown
} from 'lucide-react';

export default function UpiPayModal({ onPaymentDone }) {
  const { upiModalInfo, closeUpiModal, addToast } = useApp();
  const [copied, setCopied] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Payment Confirmation Form State
  const [paymentMethod, setPaymentMethod] = useState('UPI'); // 'UPI' | 'Cash' | 'Bank Transfer'
  const [transactionRef, setTransactionRef] = useState('');
  const [settlementStatus, setSettlementStatus] = useState('Paid'); // 'Paid' | 'Pending'
  const [customNote, setCustomNote] = useState('');

  if (!upiModalInfo) return null;

  const {
    fromMemberId,
    fromMemberName,
    toMemberId,
    toMemberName,
    toMemberUpi,
    amount,
    upiLink,
    notes,
    paymentId
  } = upiModalInfo;

  const handleCopyUpi = () => {
    if (toMemberUpi) {
      navigator.clipboard.writeText(toMemberUpi);
      setCopied(true);
      addToast('UPI ID copied to clipboard!', 'success');
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleConfirmPayment = async (e) => {
    e.preventDefault();
    try {
      setIsSubmitting(true);
      const todayStr = new Date().toISOString().split('T')[0];
      const finalNote = customNote.trim() || notes || `Settlement from ${fromMemberName || 'Flatmate'} to ${toMemberName}`;

      if (paymentId) {
        await api.updatePayment(paymentId, { 
          status: settlementStatus,
          payment_method: paymentMethod,
          transaction_reference: transactionRef.trim() || null,
          notes: finalNote
        });
      } else {
        await api.createPayment({
          from_member: fromMemberId,
          to_member: toMemberId,
          amount: parseFloat(amount),
          payment_date: todayStr,
          status: settlementStatus,
          payment_method: paymentMethod,
          transaction_reference: transactionRef.trim() || null,
          notes: finalNote
        });
      }

      const msg = settlementStatus === 'Paid'
        ? `Payment of ₹${parseFloat(amount).toLocaleString('en-IN')} marked as Settled!`
        : `Payment of ₹${parseFloat(amount).toLocaleString('en-IN')} recorded as Pending confirmation.`;
      
      addToast(msg, 'success');
      closeUpiModal();
      if (onPaymentDone) onPaymentDone();
    } catch (err) {
      console.error('Error recording payment:', err);
      addToast(err.message || 'Failed to update payment status', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const formattedAmount = parseFloat(amount || 0).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  const qrUrl = upiLink
    ? `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(upiLink)}`
    : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/70 backdrop-blur-sm animate-in fade-in overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden border border-slate-100 my-auto animate-in zoom-in-95 max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="bg-gradient-to-r from-indigo-600 via-indigo-700 to-violet-700 p-4 sm:p-5 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center">
              <QrCode className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="font-bold text-base sm:text-lg leading-tight">Payment Gateway & Settlement</h3>
              <p className="text-[11px] text-indigo-200">UPI Intent • QR Code • Manual Settlement</p>
            </div>
          </div>
          <button
            onClick={closeUpiModal}
            className="p-1 rounded-lg text-white/80 hover:text-white hover:bg-white/10 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="p-4 sm:p-6 space-y-4 overflow-y-auto flex-1">
          {/* Amount and Payee details */}
          <div className="text-center bg-slate-50 p-3.5 rounded-xl border border-slate-200/80">
            <div className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Settlement Amount</div>
            <div className="text-2xl sm:text-3xl font-black text-slate-900 mt-0.5 tracking-tight">
              ₹{formattedAmount}
            </div>
            <div className="text-xs font-semibold text-slate-700 mt-1">
              Transfer to <span className="text-indigo-600 font-bold">{toMemberName}</span>
            </div>
            {fromMemberName && (
              <div className="text-[11px] text-slate-500 mt-0.5">
                Payer: <span className="font-medium text-slate-700">{fromMemberName}</span>
              </div>
            )}
          </div>

          {/* Payment Method Selector Tabs */}
          <div className="space-y-1.5">
            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600">
              Select Payment Mode
            </label>
            <div className="grid grid-cols-3 gap-1.5 p-1 rounded-xl bg-slate-100 border border-slate-200 text-xs font-semibold">
              <button
                type="button"
                onClick={() => setPaymentMethod('UPI')}
                className={`py-1.5 rounded-lg flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                  paymentMethod === 'UPI'
                    ? 'bg-white text-indigo-700 shadow-xs font-bold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Smartphone className="w-3.5 h-3.5" />
                <span>UPI App</span>
              </button>
              <button
                type="button"
                onClick={() => setPaymentMethod('Cash')}
                className={`py-1.5 rounded-lg flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                  paymentMethod === 'Cash'
                    ? 'bg-white text-emerald-700 shadow-xs font-bold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Banknote className="w-3.5 h-3.5" />
                <span>Cash</span>
              </button>
              <button
                type="button"
                onClick={() => setPaymentMethod('Bank Transfer')}
                className={`py-1.5 rounded-lg flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                  paymentMethod === 'Bank Transfer'
                    ? 'bg-white text-violet-700 shadow-xs font-bold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Building className="w-3.5 h-3.5" />
                <span>Bank/NEFT</span>
              </button>
            </div>
          </div>

          {/* UPI Mode Details (Gateway) */}
          {paymentMethod === 'UPI' && (
            <div className="space-y-3">
              {toMemberUpi ? (
                <>
                  {/* Payee UPI ID with 1-click Copy */}
                  <div className="flex items-center justify-between p-2.5 rounded-xl bg-indigo-50/70 border border-indigo-100">
                    <div>
                      <div className="text-[10px] font-bold text-indigo-900 uppercase">Payee UPI ID</div>
                      <div className="text-xs sm:text-sm font-bold text-slate-800 font-mono">{toMemberUpi}</div>
                    </div>
                    <button
                      type="button"
                      onClick={handleCopyUpi}
                      className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-lg bg-white border border-indigo-200 text-indigo-700 hover:bg-indigo-50 shadow-xs cursor-pointer"
                    >
                      {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copied ? 'Copied' : 'Copy'}</span>
                    </button>
                  </div>

                  {/* 1-Tap Mobile Gateway Button */}
                  {upiLink && (
                    <a
                      href={upiLink}
                      className="flex items-center justify-center gap-2 w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 text-white font-bold text-xs shadow-sm transition-all text-center active:scale-[0.98]"
                    >
                      <ExternalLink className="w-4 h-4" />
                      <span>Launch UPI App (GPay / PhonePe / Paytm / BHIM)</span>
                    </a>
                  )}

                  {/* QR Code for Desktop or Scanner */}
                  {qrUrl && (
                    <div className="flex flex-col items-center justify-center p-3 bg-white border border-slate-200 rounded-xl">
                      <img
                        src={qrUrl}
                        alt="UPI QR Code"
                        className="w-36 h-36 object-contain rounded-lg shadow-2xs"
                        loading="lazy"
                      />
                      <span className="text-[11px] text-slate-500 mt-1.5 font-medium">
                        Scan with your UPI App camera or scanner
                      </span>
                    </div>
                  )}
                </>
              ) : (
                <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs">
                  <span className="font-semibold">{toMemberName}</span> hasn't configured a UPI ID yet. You can transfer directly and record the payment below.
                </div>
              )}
            </div>
          )}

          {/* Cash Mode Details */}
          {paymentMethod === 'Cash' && (
            <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs space-y-1">
              <div className="font-bold flex items-center gap-1.5">
                <Banknote className="w-4 h-4 text-emerald-600" />
                <span>Cash Payment Settlement</span>
              </div>
              <p className="text-emerald-700 leading-relaxed text-[11px]">
                Handed physical cash of ₹{formattedAmount} to {toMemberName}. Confirm below to clear this balance.
              </p>
            </div>
          )}

          {/* Bank Transfer Details */}
          {paymentMethod === 'Bank Transfer' && (
            <div className="p-3.5 rounded-xl bg-violet-50 border border-violet-200 text-violet-900 text-xs space-y-1">
              <div className="font-bold flex items-center gap-1.5">
                <Building className="w-4 h-4 text-violet-600" />
                <span>Direct Bank / IMPS / NEFT Transfer</span>
              </div>
              <p className="text-violet-700 leading-relaxed text-[11px]">
                Transferred via net banking to {toMemberName}. You can enter your bank transaction UTR/Reference below.
              </p>
            </div>
          )}

          {/* Manual Confirmation Details Form */}
          <form onSubmit={handleConfirmPayment} className="space-y-3 pt-2 border-t border-slate-100">
            <div>
              <label className="block text-[11px] font-bold text-slate-700 mb-1">
                Transaction Ref / UTR / Note <span className="text-slate-400 font-normal">(Optional)</span>
              </label>
              <input
                type="text"
                placeholder={paymentMethod === 'UPI' ? 'e.g. 423456789012 (12-digit UPI Ref)' : 'e.g. Handed cash in room 2'}
                value={transactionRef}
                onChange={(e) => setTransactionRef(e.target.value)}
                className="w-full text-xs py-2 px-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  Settlement Status
                </label>
                <select
                  value={settlementStatus}
                  onChange={(e) => setSettlementStatus(e.target.value)}
                  className="w-full text-xs py-2 px-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                >
                  <option value="Paid">Mark as Paid (Clear Debt)</option>
                  <option value="Pending">Pending (Awaits Receiver Verification)</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  Custom Note
                </label>
                <input
                  type="text"
                  placeholder="Optional memo"
                  value={customNote}
                  onChange={(e) => setCustomNote(e.target.value)}
                  className="w-full text-xs py-2 px-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>

            {/* Settle Action Buttons */}
            <div className="pt-2 flex items-center gap-2">
              <button
                type="button"
                onClick={closeUpiModal}
                className="w-1/3 py-2.5 px-3 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="flex-1 flex items-center justify-center gap-1.5 py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-xs transition-colors cursor-pointer disabled:opacity-50"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>{isSubmitting ? 'Recording...' : 'Confirm & Record as Settled'}</span>
              </button>
            </div>
            <p className="text-[10px] text-center text-slate-500">
              Recording as settled immediately updates roommate balances and clears the debt in the flat ledger.
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}
