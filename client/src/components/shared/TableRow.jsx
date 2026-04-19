import { memo } from 'react'

/**
 * Reusable Table Row Component
 * Memoized to prevent unnecessary re-renders
 * Used in: Customers, Inventory, Finance, Tasks, etc.
 */
const TableRow = memo(function TableRow({
  item,
  columns,
  onSelect,
  isSelected,
  actions
}) {
  return (
    <tr className={`border-b border-white/5 hover:bg-white/5 transition-colors ${
      isSelected ? 'bg-accent/10' : ''
    }`}>
      {columns.map((col, idx) => (
        <td key={idx} className="px-4 py-3 text-sm text-text">
          {col.render ? col.render(item) : item[col.key]}
        </td>
      ))}
      {actions && (
        <td className="px-4 py-3">
          <div className="flex items-center gap-2">
            {actions.map((action, idx) => (
              <button
                key={idx}
                onClick={() => action.onClick(item)}
                className={action.className}
                title={action.title}
              >
                {action.label}
              </button>
            ))}
          </div>
        </td>
      )}
    </tr>
  )
}, (prev, next) => {
  // Custom comparison: only re-render if item or selection changes
  return (
    prev.item.id === next.item.id &&
    prev.isSelected === next.isSelected &&
    JSON.stringify(prev.item) === JSON.stringify(next.item)
  )
})

export default TableRow
