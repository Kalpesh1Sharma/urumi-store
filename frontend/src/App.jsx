import { useState, useEffect, useRef } from 'react'
import axios from 'axios'
import './App.css'

function App() {
  const [stores, setStores] = useState([])
  const [logs, setLogs] = useState([])
  const [storeName, setStoreName] = useState('')
  const [loading, setLoading] = useState(false)
  
  // Auto-scroll logs
  const logsEndRef = useRef(null)

  const fetchData = async () => {
    try {
      const [storesRes, logsRes] = await Promise.all([
        axios.get('http://localhost:3001/api/stores'),
        axios.get('http://localhost:3001/api/logs')
      ])
      setStores(Array.isArray(storesRes.data) ? storesRes.data : [])
      setLogs(logsRes.data)
    } catch (error) { console.error(error) }
  }

  useEffect(() => {
    fetchData()
    const interval = setInterval(fetchData, 2000)
    return () => clearInterval(interval)
  }, [])

  // Auto-scroll to top of logs when new ones arrive
  useEffect(() => {
    if (logsEndRef.current) {
        logsEndRef.current.scrollTop = 0;
    }
  }, [logs]);

  const createStore = async () => {
    if (!storeName) return alert("Please enter a name");
    setLoading(true);
    try {
      await axios.post('http://localhost:3001/api/stores', { storeName });
      setStoreName(''); fetchData();
    } catch (e) { alert(`Error: ${e.response?.data?.message}`); } finally { setLoading(false); }
  }

  const performAction = async (storeId, method, endpointSuffix = '') => {
    setLoading(true);
    try {
        const url = `http://localhost:3001/api/stores/${storeId}${endpointSuffix}`;
        if (method === 'delete') await axios.delete(url);
        else await axios.post(url);
        fetchData();
    } catch (error) { alert(error.message); } finally { setLoading(false); }
  }

  const formatDate = (dateString) => {
    if (!dateString) return 'Just now';
    try {
      const parts = dateString.split(' ');
      if (parts.length < 2) return dateString;
      const date = new Date(`${parts[0]}T${parts[1].split('.')[0]}`);
      return date.toLocaleString('en-IN', {
        month: 'short', day: 'numeric',
        hour: 'numeric', minute: 'numeric', hour12: true,
      });
    } catch (e) { return "Just now"; }
  }

  return (
    
    <div className="container">
      <header>
        <div className="brand">
          <img src="/logo.png" alt="Urumi Logo" className="logo-img" />
          <h1>Store Orchestrator</h1>
        </div>
        <div className="system-pill">
          <div className="status-dot"></div>
          <span>System Online</span>
        </div>
      </header>


      <div className="dashboard-layout">
        
        {/* LEFT: MAIN CONTENT */}
        <div className="main-section">
          
          {/* Stats Row (New!) */}
          <div className="stats-row">
            <div className="stat-card">
                <div className="stat-value">{stores.length}</div>
                <div className="stat-label">Active Stores</div>
            </div>
            <div className="stat-card">
                <div className="stat-value">{stores.filter(s => s.status === 'deployed').length}</div>
                <div className="stat-label">Fully Deployed</div>
            </div>
             <div className="stat-card">
                <div className="stat-value">v6.5</div>
                <div className="stat-label">Platform Version</div>
            </div>
          </div>

          <div className="control-panel">
            <input 
              type="text" 
              placeholder="e.g. nike-store-01" 
              value={storeName}
              onChange={(e) => setStoreName(e.target.value)}
              disabled={loading}
              onKeyDown={(e) => e.key === 'Enter' && createStore()}
            />
            <button className="primary-btn" onClick={createStore} disabled={loading}>
              {loading ? 'Provisioning...' : 'Deploy Store'}
            </button>
          </div>

          <div className="store-grid">
            {stores.map((store) => (
              <div key={store.name} className="store-card">
                <div className="store-header">
                  <h3>{store.name}</h3>
                  <span className={`badge ${store.status === 'deployed' ? 'deployed' : 'provisioning'}`}>
                    {store.status}
                  </span>
                </div>
                
                <div className="store-meta">
                    <div className="meta-item">
                        <span>Namespace</span>
                        <span style={{fontFamily:'monospace'}}>{store.namespace}</span>
                    </div>
                    <div className="meta-item">
                        <span>Revision</span>
                        <span>v{store.revision}</span>
                    </div>
                    <div className="meta-item">
                        <span>Last Update</span>
                        <span>{formatDate(store.updated)}</span>
                    </div>
                </div>

                <div className="actions">
                    <div className="btn-group">
                        <button onClick={() => performAction(store.name, 'post', '/upgrade')} className="action-btn btn-upgrade">
                           ⬆ Upgrade
                        </button>
                        <button onClick={() => performAction(store.name, 'post', '/rollback')} className="action-btn btn-undo">
                           ↩ Undo
                        </button>
                    </div>
                    <a href={`http://${store.name}.localhost`} target="_blank" className="action-btn btn-open">
                        Open ↗
                    </a>
                    <button onClick={() => performAction(store.name, 'delete')} className="action-btn btn-delete">
                        Delete
                    </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* RIGHT: TERMINAL */}
        <div className="sidebar-section">
          <div className="logs-panel">
            <div className="logs-header">
              <h3><span>_&gt;</span> System Activity</h3>
              <span style={{fontSize:'0.7rem', color:'#64748b'}}>LIVE</span>
            </div>
            <div className="logs-window" ref={logsEndRef}>
                {logs.length === 0 && <p style={{color:'#475569'}}>Waiting for events...</p>}
                {logs.map((log) => (
                    <div key={log.id} className={`log-entry ${log.type}`}>
                        <div className="log-time">{new Date(log.timestamp).toLocaleTimeString()}</div>
                        <div className="log-msg">{log.message}</div>
                    </div>
                ))}
            </div>
          </div>
        </div>
      
      </div> 
    </div>
  )
}

export default App