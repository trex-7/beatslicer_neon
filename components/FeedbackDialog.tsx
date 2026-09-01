import React, { useState } from 'react';
import { X, MessageSquare, Send, CheckCircle2, AlertCircle } from 'lucide-react';
import { sendFeedback } from '../utils/db';

interface FeedbackDialogProps {
    isOpen: boolean;
    onClose: () => void;
    user?: any;
}

export const FeedbackDialog: React.FC<FeedbackDialogProps> = ({ isOpen, onClose, user }) => {
    const [message, setMessage] = useState('');
    const [category, setCategory] = useState<'general' | 'bug' | 'feature'>('general');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [submitted, setSubmitted] = useState(false);
    const [error, setError] = useState<string | null>(null);

    if (!isOpen) return null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!message.trim()) return;

        setIsSubmitting(true);
        setError(null);

        try {
            const success = await sendFeedback(message, category);
            if (success) {
                setSubmitted(true);
                setTimeout(() => {
                    setSubmitted(false);
                    setMessage('');
                    onClose();
                }, 1800);
            } else {
                setError('Failed to submit feedback. Please try again.');
            }
        } catch (err: any) {
            setError(err.message || 'An error occurred while sending feedback');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
            <div className="bg-neutral-900 border border-neutral-800 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-200">
                <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-800 bg-neutral-850">
                    <div className="flex items-center gap-2 text-cyan-400">
                        <MessageSquare className="w-5 h-5" />
                        <h2 className="text-base font-bold text-neutral-100">Send Feedback & Report Issues</h2>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="text-neutral-400 hover:text-white transition-colors p-1 rounded-lg hover:bg-neutral-800"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {submitted ? (
                    <div className="p-8 text-center flex flex-col items-center gap-3">
                        <CheckCircle2 className="w-12 h-12 text-emerald-400 animate-bounce" />
                        <h3 className="text-lg font-semibold text-white">Thank You!</h3>
                        <p className="text-sm text-neutral-400">Your feedback has been received and will help improve Beat Slicer.</p>
                    </div>
                ) : (
                    <form onSubmit={handleSubmit} className="p-6 flex flex-col gap-4">
                        <div>
                            <label className="block text-xs font-semibold text-neutral-400 mb-1.5 uppercase tracking-wider">Category</label>
                            <div className="grid grid-cols-3 gap-2">
                                {(['general', 'bug', 'feature'] as const).map((cat) => (
                                    <button
                                        type="button"
                                        key={cat}
                                        onClick={() => setCategory(cat)}
                                        className={`px-3 py-2 rounded-lg text-xs font-medium capitalize border transition-all ${
                                            category === cat
                                                ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/60 shadow-sm'
                                                : 'bg-neutral-800/60 text-neutral-400 border-neutral-700/60 hover:bg-neutral-800'
                                        }`}
                                    >
                                        {cat === 'bug' ? '🐛 Bug' : cat === 'feature' ? '💡 Feature' : '💬 General'}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div>
                            <label className="block text-xs font-semibold text-neutral-400 mb-1.5 uppercase tracking-wider">Message</label>
                            <textarea
                                value={message}
                                onChange={(e) => setMessage(e.target.value)}
                                placeholder="Describe your suggestions, ideas, or what happened..."
                                rows={4}
                                required
                                className="w-full bg-neutral-950 border border-neutral-800 rounded-xl p-3 text-sm text-neutral-200 placeholder-neutral-500 focus:outline-none focus:border-cyan-500 transition-colors resize-none"
                            />
                        </div>

                        {error && (
                            <div className="flex items-center gap-2 p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-400 text-xs">
                                <AlertCircle className="w-4 h-4 shrink-0" />
                                <span>{error}</span>
                            </div>
                        )}

                        <div className="flex items-center justify-end gap-3 mt-2">
                            <button
                                type="button"
                                onClick={onClose}
                                className="px-4 py-2 rounded-xl text-sm font-medium text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                type="submit"
                                disabled={isSubmitting || !message.trim()}
                                className="px-5 py-2 rounded-xl text-sm font-medium bg-cyan-500 text-neutral-950 hover:bg-cyan-400 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center gap-2 font-semibold shadow-lg shadow-cyan-500/20"
                            >
                                {isSubmitting ? (
                                    <div className="w-4 h-4 border-2 border-neutral-950 border-t-transparent rounded-full animate-spin" />
                                ) : (
                                    <Send className="w-4 h-4" />
                                )}
                                <span>Submit</span>
                            </button>
                        </div>
                    </form>
                )}
            </div>
        </div>
    );
};

export default FeedbackDialog;
