
import React, { useState } from 'react';
import { submitFeedback } from '../utils/db';

interface FeedbackDialogProps {
    isOpen: boolean;
    onClose: () => void;
    user: any;
}

const FeedbackDialog: React.FC<FeedbackDialogProps> = ({ isOpen, onClose, user }) => {
    const [message, setMessage] = useState('');
    const [category, setCategory] = useState<'bug' | 'feature' | 'other'>('bug');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');
    const [errorMessage, setErrorMessage] = useState<string>('');

    if (!isOpen) return null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!message.trim()) return;

        setIsSubmitting(true);
        setStatus('idle');
        setErrorMessage('');

        const result = await submitFeedback(user?.id, message, category);

        setIsSubmitting(false);
        if (result.success) {
            setStatus('success');
            setTimeout(() => {
                onClose();
                setMessage('');
                setStatus('idle');
            }, 1500);
        } else {
            setStatus('error');
            setErrorMessage(result.error || "Database error");
        }
    };

    return (
        <div className="fixed inset-0 z-[300] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in zoom-in-95">
            <div className="bg-[#1a1f2b] border border-white/10 rounded-xl p-6 w-full max-w-md shadow-2xl relative">
                <button 
                    onClick={onClose} 
                    className="absolute top-4 right-4 text-white/30 hover:text-white transition-colors"
                >
                    ✕
                </button>

                <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                    <span className="text-hyper-cyan">📣</span> Feedback
                </h2>

                {!user && (
                    <div className="mb-4 p-3 bg-yellow-500/10 border border-yellow-500/20 rounded text-yellow-200 text-xs">
                        You are submitting feedback anonymously. Please include your email in the message if you want a response.
                    </div>
                )}

                {status === 'success' ? (
                    <div className="flex flex-col items-center justify-center py-8 text-green-400">
                        <div className="text-4xl mb-2">✅</div>
                        <p className="font-bold">Feedback Sent!</p>
                        <p className="text-sm opacity-70">Thank you for helping us improve.</p>
                    </div>
                ) : (
                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div>
                            <label className="text-xs font-bold text-star-dust uppercase mb-1 block">Category</label>
                            <div className="flex gap-2">
                                {(['bug', 'feature', 'other'] as const).map(cat => (
                                    <button
                                        key={cat}
                                        type="button"
                                        onClick={() => setCategory(cat)}
                                        className={`flex-1 py-2 text-xs font-bold rounded border transition-all uppercase ${category === cat ? 'bg-hyper-cyan/20 border-hyper-cyan text-hyper-cyan' : 'bg-black/20 border-white/10 text-star-dust hover:bg-white/5'}`}
                                    >
                                        {cat}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div>
                            <label className="text-xs font-bold text-star-dust uppercase mb-1 block">Message</label>
                            <textarea
                                value={message}
                                onChange={(e) => setMessage(e.target.value)}
                                placeholder={category === 'bug' ? "Describe what happened..." : "What would you like to see?"}
                                className="w-full h-32 bg-black/40 border border-white/20 rounded px-3 py-2 text-white focus:border-hyper-cyan outline-none text-sm resize-none"
                                required
                            />
                        </div>

                        {status === 'error' && (
                            <div className="text-red-400 text-xs text-center bg-red-900/20 p-2 rounded border border-red-500/30">
                                <span className="font-bold">Error:</span> {errorMessage}
                            </div>
                        )}

                        <button
                            type="submit"
                            disabled={isSubmitting || !message.trim()}
                            className="w-full py-2 bg-hyper-cyan hover:bg-hyper-cyan/80 text-deep-space font-bold text-sm rounded transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                        >
                            {isSubmitting ? 'Sending...' : 'Submit Feedback'}
                        </button>
                    </form>
                )}
            </div>
        </div>
    );
};

export default FeedbackDialog;
