import React, { useState } from 'react';

interface ContactDialogProps {
    isOpen: boolean;
    onClose: () => void;
}

const ContactDialog: React.FC<ContactDialogProps> = ({ isOpen, onClose }) => {
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [message, setMessage] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');

<<<<<<< HEAD
    console.log('ContactDialog render, isOpen:', isOpen);
=======
>>>>>>> old-slicer/ai-beat-patterns
    if (!isOpen) return null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!name.trim() || !email.trim() || !message.trim()) return;

        console.log('Contact form submitted:', { name, email, message });
        setIsSubmitting(true);
        setStatus('idle');

        try {
            const response = await fetch('https://formspree.io/f/maqwrdlz', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    name,
                    email,
                    message,
                }),
            });

            console.log('Formspree response status:', response.status);
            if (response.ok) {
                console.log('Message sent successfully');
                setStatus('success');
                setTimeout(() => {
                    onClose();
                    setName('');
                    setEmail('');
                    setMessage('');
                    setStatus('idle');
                }, 1500);
            } else {
                console.log('Failed to send message');
                setStatus('error');
            }
        } catch (error) {
            console.log('Error sending message:', error);
            setStatus('error');
        } finally {
            setIsSubmitting(false);
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
                    <span className="text-hyper-cyan">📧</span> Contact Developer
                </h2>

                <div className="mb-4 text-xs text-star-dust">
                    <p className="font-bold text-white/50">Creator: Sandro Mancino</p>
                    <a href="mailto:sandromancino.sm@gmail.com" className="text-hyper-cyan hover:underline">sandromancino.sm@gmail.com</a>
                </div>

                {status === 'success' ? (
                    <div className="flex flex-col items-center justify-center py-8 text-green-400">
                        <div className="text-4xl mb-2">✅</div>
                        <p className="font-bold">Message Sent!</p>
                        <p className="text-sm opacity-70">Thank you for reaching out.</p>
                    </div>
                ) : (
                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div>
                            <label className="text-xs font-bold text-star-dust uppercase mb-1 block">Name</label>
                            <input
                                type="text"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                placeholder="Your name"
                                className="w-full bg-black/40 border border-white/20 rounded px-3 py-2 text-white focus:border-hyper-cyan outline-none text-sm"
                                required
                            />
                        </div>

                        <div>
                            <label className="text-xs font-bold text-star-dust uppercase mb-1 block">Email</label>
                            <input
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                placeholder="your.email@example.com"
                                className="w-full bg-black/40 border border-white/20 rounded px-3 py-2 text-white focus:border-hyper-cyan outline-none text-sm"
                                required
                            />
                        </div>

                        <div>
                            <label className="text-xs font-bold text-star-dust uppercase mb-1 block">Message</label>
                            <textarea
                                value={message}
                                onChange={(e) => setMessage(e.target.value)}
                                placeholder="Your message..."
                                className="w-full h-32 bg-black/40 border border-white/20 rounded px-3 py-2 text-white focus:border-hyper-cyan outline-none text-sm resize-none"
                                required
                            />
                        </div>

                        {status === 'error' && (
                            <div className="text-red-400 text-xs text-center bg-red-900/20 p-2 rounded border border-red-500/30">
                                <span className="font-bold">Error:</span> Failed to send message. Please try again.
                            </div>
                        )}

                        <button
                            type="submit"
                            disabled={isSubmitting || !name.trim() || !email.trim() || !message.trim()}
                            className="w-full py-2 bg-hyper-cyan hover:bg-hyper-cyan/80 text-deep-space font-bold text-sm rounded transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                        >
                            {isSubmitting ? 'Sending...' : 'Send Message'}
                        </button>
                    </form>
                )}
            </div>
        </div>
    );
};

export default ContactDialog;