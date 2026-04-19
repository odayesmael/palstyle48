import { memo } from 'react'
import { Star, Zap, formatDistanceToNow } from 'lucide-react'
import { format } from 'date-fns'
import { enUS } from 'date-fns/locale'

/**
 * MessageListItem Component
 * Memoized component for each message in the list
 * Prevents unnecessary re-renders of list items
 */
const MessageListItem = memo(function MessageListItem({
  msg,
  isSelected,
  PLATFORMS,
  INTENT_BADGES,
  onSelect
}) {
  const P = PLATFORMS[msg.platform] || PLATFORMS.gmail
  const Icon = P.icon
  const isUnread = msg.status === 'unread'
  const intent = INTENT_BADGES[msg.intent]
  const isVIP = msg.customer?.segment === 'vip'

  return (
    <button
      onClick={() => onSelect(msg)}
      className={`w-full text-left p-4 rounded-2xl flex items-start gap-4 transition-all duration-300 relative group ${
        isSelected
          ? 'bg-accent/10 border border-accent/20 shadow-premium'
          : 'hover:bg-white/5 border border-transparent'
      }`}
    >
      <div className="relative shrink-0">
        <div className={`w-12 h-12 rounded-2xl ${P.bg} border ${P.border} flex items-center justify-center transition-transform group-hover:scale-105`}>
          <Icon size={20} className={P.color} />
        </div>
        {isUnread && (
          <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-blue-500 border-2 border-[#07080a] shadow-[0_0_10px_rgba(59,130,246,0.5)]"></span>
        )}
      </div>

      <div className="flex-1 min-w-0 text-left">
        <div className="flex items-center justify-between mb-1">
          <span className="font-bold text-text text-sm truncate flex items-center gap-2">
            {isVIP && <Star size={12} className="text-yellow-400 fill-yellow-400 shrink-0 animate-pulse" />}
            {msg.customer?.name || msg.senderName || msg.senderHandle || 'Unknown customer'}
          </span>
          <span className="text-[10px] text-text-muted shrink-0 font-medium">
            {formatDistanceToNow(new Date(msg.createdAt), { locale: enUS, addSuffix: false })}
          </span>
        </div>

        <p className={`text-xs truncate ${isUnread ? 'text-text font-bold' : 'text-text-muted font-medium'}`}>
          {msg.content}
        </p>

        <div className="flex items-center gap-2 mt-2">
          {intent && (
            <span className={`text-[10px] px-2 py-0.5 rounded-full border font-black uppercase tracking-tighter ${intent.cls}`}>
              {intent.label}
            </span>
          )}
          {msg.agentResponse && msg.status !== 'replied' && (
            <span className="text-[10px] px-2 py-0.5 rounded-full border border-yellow-500/20 bg-yellow-500/10 text-yellow-500 font-black flex items-center gap-1">
              <Zap size={10} /> Suggested
            </span>
          )}
        </div>
      </div>

      {isSelected && (
        <div className="absolute right-0 top-1/2 -translate-y-1/2 w-1 h-8 bg-accent rounded-l-full shadow-[0_0_15px_rgba(201,165,90,0.5)]"></div>
      )}
    </button>
  )
}, (prevProps, nextProps) => {
  // Custom comparison: only re-render if these specific props change
  return (
    prevProps.msg.id === nextProps.msg.id &&
    prevProps.isSelected === nextProps.isSelected &&
    prevProps.msg.status === nextProps.msg.status &&
    prevProps.msg.content === nextProps.msg.content
  )
})

export default MessageListItem
