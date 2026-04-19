import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowRight, Mail, Phone, MapPin, Calendar, ShoppingBag, MessageSquare, Plus, Edit2, Send, Tag } from 'lucide-react'
import optimizedAPI from '../services/optimizedAPI'
import { format, formatDistanceToNow } from 'date-fns'
import { enUS } from 'date-fns/locale'

export default function CustomerDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [customer, setCustomer] = useState(null)
  
  useEffect(() => {
    async function loadDetail() {
      try {
        const data = await optimizedAPI.get(`/customers/${id}`, {}, true, 300000)
        if (data?.success) {
          setCustomer(data.data)
        }
      } catch (err) {
        console.error('Failed to load customer:', err)
      } finally {
        setLoading(false)
      }
    }
    loadDetail()
  }, [id])

  if (loading) {
    return <div className="p-8 text-center text-text-muted">Loading customer data...</div>
  }

  if (!customer) {
    return (
      <div className="p-8 text-center text-red-500">
        <p className="mb-4">Customer not found</p>
        <button onClick={() => navigate('/customers')} className="btn-secondary">Back to Customers</button>
      </div>
    )
  }

  const getSegmentBadge = (seg) => {
    const styles = {
      vip: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20',
      active: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20',
      idle: 'bg-orange-500/10 text-orange-500 border-orange-500/20',
      lost: 'bg-red-500/10 text-red-500 border-red-500/20',
      new: 'bg-blue-500/10 text-blue-500 border-blue-500/20'
    }
    const labels = { vip: 'VIP', active: 'Active', idle: 'Idle', lost: 'Lost', new: 'New' }
    return (
      <span className={`px-2.5 py-1 rounded-full text-xs font-semibold border ${styles[seg] || styles.new}`}>
        {labels[seg] || 'New'}
      </span>
    )
  }

  // Parse platforms
  const platforms = customer.platformIds ? Object.keys(customer.platformIds) : [customer.source]

  return (
    <div className="page-container max-w-5xl mx-auto space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      
      {/* Top Navigation */}
      <button 
        onClick={() => navigate('/customers')} 
        className="flex items-center gap-2 text-text-muted hover:text-text transition-colors text-sm font-medium"
      >
        <ArrowRight size={16} /> Back to Customers
      </button>

      {/* Header Profile */}
      <div className="card p-6 flex items-start justify-between">
        <div className="flex items-center gap-5">
          <div className="w-20 h-20 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg text-white font-bold text-3xl">
            {customer.name?.slice(0,2)?.toUpperCase() || 'CU'}
          </div>
          <div>
            <h1 className="text-2xl font-bold text-text flex items-center gap-3">
              {customer.name}
              {getSegmentBadge(customer.segment)}
            </h1>
            <div className="flex items-center gap-2 mt-2 text-sm text-text-muted">
              <span>Connected platforms:</span>
              <div className="flex gap-1">
                {platforms.map(p => (
                  <span key={p} className="px-2 py-0.5 bg-surface border border-border rounded text-xs uppercase">{p}</span>
                ))}
              </div>
            </div>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          <button className="btn-secondary flex items-center gap-2"><Tag size={16}/> Move to Segment</button>
          <button className="btn-primary flex items-center gap-2"><Send size={16}/> Send Message</button>
        </div>
      </div>

      {/* Grid Layout: Info & Timeline vs Tables */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left Col: Contact Info & Timeline */}
        <div className="space-y-6">
          
          {/* Info Card */}
          <div className="card p-5 space-y-4">
            <h3 className="font-bold text-text pb-2 border-b border-border">Contact Info</h3>

            <div className="flex items-center gap-3 text-sm text-text-muted">
              <Mail size={16} className="text-indigo-400" />
              <span className="flex-1">{customer.email || 'N/A'}</span>
            </div>

            <div className="flex items-center gap-3 text-sm text-text-muted">
              <Phone size={16} className="text-emerald-400" />
              <span className="flex-1" dir="ltr">{customer.phone || 'N/A'}</span>
            </div>

            <div className="flex items-center gap-3 text-sm text-text-muted">
              <MapPin size={16} className="text-orange-400" />
              <span className="flex-1">{customer.metadata?.city || 'City not available'}</span>
            </div>

            <div className="flex items-center gap-3 text-sm text-text-muted pt-2 border-t border-border">
              <Calendar size={16} />
              <span>Customer since {format(new Date(customer.createdAt), 'dd MMMM yyyy', { locale: enUS })}</span>
            </div>
          </div>

          {/* Timeline Card */}
          <div className="card p-5">
            <h3 className="font-bold text-text mb-6">Activity Timeline</h3>

            <div className="relative border-l-2 border-border pl-5 space-y-6">
              {customer.timeline?.length === 0 ? (
                <p className="text-sm text-text-muted">No activities recorded</p>
              ) : (
                customer.timeline?.map((item, idx) => (
                  <div key={item.id} className="relative">
                    {/* Circle marker */}
                    <div className={`absolute -left-[27px] top-1 w-4 h-4 rounded-full border-4 border-background ${item.type === 'order' ? 'bg-emerald-500' : 'bg-indigo-500'}`}></div>
                    
                    <div className="bg-surface/50 border border-border p-3 rounded-lg">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-bold text-text flex items-center gap-1">
                          {item.type === 'order' ? <ShoppingBag size={12}/> : <MessageSquare size={12}/>} 
                          {item.title}
                        </span>
                        <span className="text-[10px] text-text-muted">{formatDistanceToNow(new Date(item.date), { addSuffix: true, locale: enUS })}</span>
                      </div>
                      <p className="text-xs text-text-muted">{item.description}</p>
                      <span className="inline-block mt-2 text-[10px] uppercase font-bold text-indigo-400 bg-indigo-500/10 px-1.5 rounded">{item.platform}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Right Col: Orders & Messages Tables */}
        <div className="lg:col-span-2 space-y-6">
          
          {/* Orders Section */}
          <div className="card p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-text flex items-center gap-2"><ShoppingBag size={18} className="text-emerald-500"/> Order History</h3>
              <span className="text-sm font-bold bg-surface border border-border px-3 py-1 rounded">
                Total spent: <span className="text-emerald-500 ml-1">${customer.totalSpent?.toFixed(2)}</span>
              </span>
            </div>
            
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="text-text-muted border-b border-border">
                  <tr>
                    <th className="pb-3 font-medium">Order #</th>
                    <th className="pb-3 font-medium">Platform</th>
                    <th className="pb-3 font-medium">Date</th>
                    <th className="pb-3 font-medium">Status</th>
                    <th className="pb-3 font-medium">Value</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {customer.orders?.length === 0 ? (
                    <tr><td colSpan="5" className="py-4 text-center text-text-muted">No orders yet</td></tr>
                  ) : (
                    customer.orders?.map(order => (
                      <tr key={order.id}>
                        <td className="py-3 font-mono text-xs">{order.platformOrderId}</td>
                        <td className="py-3 capitalize text-text-muted">{order.platform}</td>
                        <td className="py-3 text-text-muted">{format(new Date(order.createdAt), 'yyyy/MM/dd')}</td>
                        <td className="py-3">
                          <span className="px-2 py-0.5 rounded text-[10px] bg-surface border border-border block w-max">{order.status}</span>
                        </td>
                        <td className="py-3 font-bold text-emerald-500">${order.total?.toFixed(2)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Messages Section */}
          <div className="card p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-text flex items-center gap-2"><MessageSquare size={18} className="text-indigo-500"/> Recent Messages</h3>
              <button className="text-xs font-bold flex items-center gap-1 text-indigo-400 hover:text-indigo-300">
                <Plus size={14}/> Internal Note
              </button>
            </div>
            
            <div className="space-y-3">
              {customer.messages?.length === 0 ? (
                <p className="text-sm text-text-muted text-center py-4">No messages recorded via Inbox yet</p>
              ) : (
                customer.messages?.map(msg => (
                  <div key={msg.id} className="bg-surface rounded-lg p-3 border border-border">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-xs font-bold text-text capitalize">{msg.platform}</span>
                      <span className="text-[10px] text-text-muted">{formatDistanceToNow(new Date(msg.createdAt), { addSuffix: true, locale: enUS })}</span>
                    </div>
                    <p className="text-sm text-text-muted">{msg.content}</p>
                  </div>
                ))
              )}

              {/* Just a demo internal note from the prompt logic */}
              {customer.notes && (
                <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-3">
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-xs font-bold text-yellow-500 flex items-center gap-1"><Edit2 size={12}/> System Notes</span>
                  </div>
                  <p className="text-sm text-yellow-600/80 whitespace-pre-wrap">{customer.notes}</p>
                </div>
              )}
            </div>
          </div>
          
        </div>
      </div>
    </div>
  )
}
