import { useState, useRef, useEffect } from 'react'
import { MessageSquare, X, Send, Bot, User, Loader, Zap } from 'lucide-react'
import api from '../../services/api'

export default function MaestroChat() {
  const [isOpen, setIsOpen] = useState(false)
  const [messages, setMessages] = useState([
    { id: 0, sender: 'agent', text: 'Hello! I\'m Maestro, the AI assistant for Palstyle48. How can I help you today?' }
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const messagesEndRef = useRef(null)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages, isOpen])

  useEffect(() => {
    const handleOpen = () => setIsOpen(true)
    window.addEventListener('open-maestro', handleOpen)
    return () => window.removeEventListener('open-maestro', handleOpen)
  }, [])

  const handleSend = async () => {
    if (!input.trim()) return
    const userMsg = input.trim()
    setInput('')
    
    const newMsg = { id: Date.now(), sender: 'user', text: userMsg }
    setMessages(prev => [...prev, newMsg])
    setLoading(true)

    try {
      const { data } = await api.post('/master/chat', { message: userMsg })
      if (data?.success) {
        setMessages(prev => [...prev, {
          id: Date.now() + 1,
          sender: 'agent',
          text: data.data.text,
          data: data.data.tool_data
        }])
      } else {
        throw new Error('Reply failed')
      }
    } catch (err) {
      setMessages(prev => [...prev, { id: Date.now() + 1, sender: 'agent', text: 'Sorry, an error occurred while connecting to the server.' }])
    }
    setLoading(false)
  }

  return (
    <>
      {/* Floating Action Button */}
      <button
        onClick={() => setIsOpen(true)}
        className={`fixed bottom-6 left-6 z-50 w-14 h-14 rounded-full bg-accent text-white shadow-xl shadow-accent/20 flex items-center justify-center transition-transform hover:scale-110 ${isOpen ? 'scale-0 opacity-0 pointer-events-none' : 'scale-100 opacity-100'}`}
      >
        <Zap size={24} />
      </button>

      {/* Chat Window */}
      <div
        className={`fixed bottom-6 left-6 z-50 w-[380px] max-w-[calc(100vw-48px)] h-[550px] max-h-[calc(100vh-48px)] bg-surface border border-border rounded-2xl shadow-2xl flex flex-col transition-all duration-300 origin-bottom-left ${isOpen ? 'scale-100 opacity-100' : 'scale-0 opacity-0 pointer-events-none'}`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border bg-background/50 rounded-t-2xl">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-accent/20 flex items-center justify-center">
              <Zap size={16} className="text-accent" />
            </div>
            <div>
              <h3 className="font-bold text-text text-sm">Maestro (Master Agent)</h3>
              <p className="text-[10px] text-text-muted flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span> Online
              </p>
            </div>
          </div>
          <button onClick={() => setIsOpen(false)} className="text-text-muted hover:text-red-400 transition-colors">
            <X size={20} />
          </button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.map(msg => (
            <div key={msg.id} className={`flex gap-3 ${msg.sender === 'user' ? 'flex-row-reverse' : ''}`}>
              <div className={`w-8 h-8 rounded-full flex shrink-0 items-center justify-center ${msg.sender === 'user' ? 'bg-background border border-border' : 'bg-accent/10 border border-accent/20'}`}>
                {msg.sender === 'user' ? <User size={14} className="text-text-muted" /> : <Bot size={14} className="text-accent" />}
              </div>
              <div style={{ whiteSpace: 'pre-wrap' }} className={`max-w-[80%] p-3 text-sm leading-relaxed ${msg.sender === 'user' ? 'bg-accent text-white rounded-2xl rounded-tl-none' : 'bg-background border border-border text-text rounded-2xl rounded-tr-none'}`}>
                {msg.text.replace(/\*\*(.*?)\*\*/g, '$1')} {/* Strip bold markdown visually for simple render, or render natively */}
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex gap-3">
              <div className="w-8 h-8 rounded-full bg-accent/10 border border-accent/20 flex items-center justify-center">
                <Bot size={14} className="text-accent" />
              </div>
              <div className="bg-background border border-border p-3 rounded-2xl rounded-tr-none flex items-center gap-2">
                <Loader size={14} className="animate-spin text-accent" />
                <span className="text-xs text-text-muted">Analyzing...</span>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="p-3 border-t border-border bg-background/50 rounded-b-2xl">
          <div className="flex items-center gap-2 bg-surface border border-border rounded-xl px-3 py-2 focus-within:border-accent transition-colors">
            <input
              type="text"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSend()}
              placeholder="Ask me about sales, inventory, or alerts..."
              className="flex-1 bg-transparent text-sm text-text focus:outline-none"
            />
            <button
              onClick={handleSend}
              disabled={!input.trim() || loading}
              className="w-8 h-8 flex items-center justify-center bg-accent text-white rounded-lg disabled:opacity-50 transition-opacity"
            >
              <Send size={14} />
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
