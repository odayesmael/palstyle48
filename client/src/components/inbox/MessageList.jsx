import { memo, useMemo } from 'react'
import { MessageSquare } from 'lucide-react'
import MessageListItem from './MessageListItem'

/**
 * MessageList Component
 * Optimized list rendering with memoization
 * Prevents unnecessary re-renders of the entire list
 */
const MessageList = memo(function MessageList({
  filteredMessages,
  selectedMsg,
  PLATFORMS,
  INTENT_BADGES,
  onSelectMessage
}) {
  // Memoize the rendered items to prevent re-rendering
  const renderedItems = useMemo(
    () =>
      filteredMessages.map(msg => (
        <MessageListItem
          key={msg.id}
          msg={msg}
          isSelected={selectedMsg?.id === msg.id}
          PLATFORMS={PLATFORMS}
          INTENT_BADGES={INTENT_BADGES}
          onSelect={onSelectMessage}
        />
      )),
    [filteredMessages, selectedMsg?.id, PLATFORMS, INTENT_BADGES, onSelectMessage]
  )

  if (filteredMessages.length === 0) {
    return (
      <div className="text-center py-20 text-text-muted animate-fade-in">
        <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mx-auto mb-4">
          <MessageSquare size={32} className="opacity-20" />
        </div>
        <p className="text-sm font-medium">No messages found</p>
      </div>
    )
  }

  return (
    <div className="pr-6 py-2 space-y-1">
      {renderedItems}
    </div>
  )
})

export default MessageList
