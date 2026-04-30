import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';

type Tab = 'overview' | 'users' | 'servers' | 'messages';

interface Stats { userCount: number; serverCount: number; messageCount: number; }
interface AdminUser { id: string; username: string; email: string; registeredAt: string; lastOnline: string | null; banned: boolean; }
interface AdminServer { id: string; name: string; ownerId: string; memberCount: number; createdAt: string; }
interface AdminMessage { id: string; content: string; authorId: string; authorUsername: string; channelId: string; createdAt: string; }

export default function AdminPage() {
  const router = useRouter();
  const [authed, setAuthed] = useState(false);
  const [loginForm, setLoginForm] = useState({ username: '', password: '' });
  const [loginError, setLoginError] = useState('');
  const [tab, setTab] = useState<Tab>('overview');
  const [stats, setStats] = useState<Stats | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [servers, setServers] = useState<AdminServer[]>([]);
  const [messages, setMessages] = useState<AdminMessage[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [selectedServer, setSelectedServer] = useState<string | null>(null);
  const [notification, setNotification] = useState('');

  function notify(msg: string) {
    setNotification(msg);
    setTimeout(() => setNotification(''), 3000);
  }

  async function login() {
    setLoginError('');
    const r = await fetch('/api/admin/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(loginForm),
    });
    if (r.ok) { setAuthed(true); loadOverview(); }
    else { const d = await r.json(); setLoginError(d.error || 'Invalid credentials'); }
  }

  async function logout() {
    await fetch('/api/admin/login', { method: 'DELETE' });
    setAuthed(false);
  }

  async function loadOverview() {
    setLoading(true);
    const r = await fetch('/api/admin/overview');
    if (r.status === 401) { setAuthed(false); setLoading(false); return; }
    const data = await r.json();
    setStats(data.stats);
    setUsers(data.users || []);
    setServers(data.servers || []);
    setLoading(false);
  }

  async function loadUsers() {
    const r = await fetch('/api/admin/users');
    if (r.ok) { const d = await r.json(); setUsers(d.users || []); }
  }

  async function loadServers() {
    const r = await fetch('/api/admin/servers');
    if (r.ok) { const d = await r.json(); setServers(d.servers || []); }
  }

  async function loadMessages(serverId: string) {
    setSelectedServer(serverId);
    const r = await fetch(`/api/admin/servers?serverId=${serverId}&action=messages`);
    if (r.ok) { const d = await r.json(); setMessages(d.messages || []); setTab('messages'); }
  }

  async function banUser(userId: string) {
    if (!confirm('Site-ban this user? They will not be able to log in.')) return;
    const r = await fetch(`/api/admin/users?userId=${userId}&action=ban`, { method: 'POST' });
    if (r.ok) { notify('User banned'); loadUsers(); }
  }

  async function unbanUser(userId: string) {
    const r = await fetch(`/api/admin/users?userId=${userId}&action=unban`, { method: 'POST' });
    if (r.ok) { notify('User unbanned'); loadUsers(); }
  }

  async function deleteUser(userId: string, username: string) {
    if (!confirm(`Permanently delete user "${username}"? This cannot be undone.`)) return;
    const r = await fetch(`/api/admin/users?userId=${userId}&action=delete`, { method: 'POST' });
    if (r.ok) { notify('User deleted'); loadUsers(); }
  }

  async function deleteServer(serverId: string, name: string) {
    if (!confirm(`Delete server "${name}" and all its messages? This cannot be undone.`)) return;
    const r = await fetch(`/api/admin/servers?serverId=${serverId}&action=delete`, { method: 'POST' });
    if (r.ok) { notify('Server deleted'); loadServers(); }
  }

  async function deleteAllServers() {
    if (!confirm('Delete ALL servers? This CANNOT be undone.')) return;
    if (!confirm('Are you absolutely sure? All servers and messages will be gone.')) return;
    const toDelete = [...servers];
    for (const s of toDelete) {
      await fetch(`/api/admin/servers?serverId=${s.id}&action=delete`, { method: 'POST' });
    }
    notify('All servers deleted');
    loadServers();
  }

  async function deleteServerMessages(serverId: string, name: string) {
    if (!confirm(`Delete ALL messages in "${name}"?`)) return;
    const r = await fetch(`/api/admin/servers?serverId=${serverId}&action=delete-messages`, { method: 'POST' });
    if (r.ok) { notify('Messages deleted'); if (selectedServer === serverId) setMessages([]); }
  }

  useEffect(() => {
    // Check if already admin-authenticated
    fetch('/api/admin/overview').then(r => {
      if (r.ok) { r.json().then(d => { setAuthed(true); setStats(d.stats); setUsers(d.users || []); setServers(d.servers || []); }); }
    });
  }, []);

  const filteredUsers = users.filter(u =>
    u.username.toLowerCase().includes(search.toLowerCase()) ||
    u.email.toLowerCase().includes(search.toLowerCase())
  );
  const filteredServers = servers.filter(s => s.name.toLowerCase().includes(search.toLowerCase()));

  function fmtDate(iso: string | null) {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString([], { year: 'numeric', month: 'short', day: 'numeric' });
  }

  if (!authed) {
    return (
      <>
        <Head><title>Admin — PaleRock</title></Head>
        <div style={{ minHeight: '100dvh', background: '#0a0a0b', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Space Mono', monospace" }}>
          <style>{`
            @import url('https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&display=swap');
            * { box-sizing: border-box; }
            .adm-input { width: 100%; padding: 11px 14px; background: #1a1a1e; border: 1px solid #2a2a30; border-radius: 6px; color: #e0e0e0; font-size: 14px; font-family: 'Space Mono', monospace; outline: none; }
            .adm-input:focus { border-color: #ff3b30; }
            .adm-btn { padding: 11px 20px; border: none; border-radius: 6px; background: #ff3b30; color: #fff; font-family: 'Space Mono', monospace; font-weight: 700; font-size: 13px; cursor: pointer; width: 100%; }
            .adm-btn:hover { background: #e0352a; }
          `}</style>
          <div style={{ background: '#111113', border: '1px solid #2a2a30', borderRadius: 12, padding: 40, width: 360, boxShadow: '0 20px 60px rgba(0,0,0,0.8)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 28 }}>
              <div style={{ width: 36, height: 36, background: '#ff3b30', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
              </div>
              <div>
                <div style={{ color: '#ff3b30', fontSize: 11, letterSpacing: '0.12em', fontWeight: 700 }}>PALEROCK</div>
                <div style={{ color: '#e0e0e0', fontSize: 16, fontWeight: 700 }}>Admin Panel</div>
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <input className="adm-input" placeholder="Username" value={loginForm.username}
                onChange={e => setLoginForm(f => ({ ...f, username: e.target.value }))}
                onKeyDown={e => e.key === 'Enter' && login()} />
              <input className="adm-input" type="password" placeholder="Password" value={loginForm.password}
                onChange={e => setLoginForm(f => ({ ...f, password: e.target.value }))}
                onKeyDown={e => e.key === 'Enter' && login()} />
              {loginError && <div style={{ color: '#ff3b30', fontSize: 12 }}>{loginError}</div>}
              <button className="adm-btn" onClick={login}>Sign In</button>
            </div>
            <div style={{ marginTop: 16, color: '#555', fontSize: 11, textAlign: 'center' }}>Restricted access. Unauthorized entry is prohibited.</div>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <Head><title>Admin — PaleRock</title></Head>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: #0a0a0b; color: #e0e0e0; font-family: 'Space Mono', monospace; }
        .adm-tab { padding: 8px 16px; border: none; background: transparent; cursor: pointer; font-family: 'Space Mono', monospace; font-size: 11px; font-weight: 700; letter-spacing: 0.1em; color: #555; border-bottom: 2px solid transparent; transition: all 0.15s; }
        .adm-tab.active { color: #ff3b30; border-bottom-color: #ff3b30; }
        .adm-tab:hover { color: #e0e0e0; }
        .adm-stat { background: #111113; border: 1px solid #2a2a30; border-radius: 10px; padding: 20px 24px; flex: 1; min-width: 140px; }
        .adm-table { width: 100%; border-collapse: collapse; font-size: 13px; }
        .adm-table th { text-align: left; padding: 10px 14px; color: #555; font-size: 10px; letter-spacing: 0.12em; border-bottom: 1px solid #2a2a30; }
        .adm-table td { padding: 11px 14px; border-bottom: 1px solid #1a1a1e; color: #c0c0c0; vertical-align: middle; }
        .adm-table tr:hover td { background: #111113; }
        .adm-action { padding: 4px 10px; border-radius: 4px; border: none; cursor: pointer; font-family: 'Space Mono', monospace; font-size: 10px; font-weight: 700; }
        .adm-search { padding: 9px 14px; background: #111113; border: 1px solid #2a2a30; border-radius: 6px; color: #e0e0e0; font-family: 'Space Mono', monospace; font-size: 13px; outline: none; width: 280px; }
        .adm-search:focus { border-color: #ff3b30; }
        .adm-danger-btn { padding: 8px 16px; border: 1px solid #ff3b30; border-radius: 6px; background: transparent; color: #ff3b30; cursor: pointer; font-family: 'Space Mono', monospace; font-size: 11px; font-weight: 700; }
        .adm-danger-btn:hover { background: rgba(255,59,48,0.1); }
        ::-webkit-scrollbar { width: 6px; } ::-webkit-scrollbar-track { background: transparent; } ::-webkit-scrollbar-thumb { background: #2a2a30; border-radius: 3px; }
      `}</style>

      {/* Notification toast */}
      {notification && (
        <div style={{ position: 'fixed', top: 20, right: 20, background: '#1a1a1e', border: '1px solid #2a2a30', borderRadius: 8, padding: '12px 20px', color: '#23a55a', fontFamily: 'Space Mono', fontSize: 13, fontWeight: 700, zIndex: 9999, boxShadow: '0 8px 32px rgba(0,0,0,0.5)' }}>
          ✓ {notification}
        </div>
      )}

      <div style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column' }}>
        {/* Topbar */}
        <div style={{ background: '#111113', borderBottom: '1px solid #2a2a30', padding: '0 24px', display: 'flex', alignItems: 'center', gap: 16, height: 56, flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 28, height: 28, background: '#ff3b30', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
            </div>
            <span style={{ color: '#ff3b30', fontSize: 12, fontWeight: 700, letterSpacing: '0.1em' }}>ADMIN PANEL</span>
          </div>
          <div style={{ flex: 1 }} />
          <button onClick={() => router.push('/friends/all')} style={{ padding: '6px 12px', border: '1px solid #2a2a30', borderRadius: 6, background: 'transparent', color: '#555', cursor: 'pointer', fontFamily: 'Space Mono', fontSize: 11, fontWeight: 700 }}>← App</button>
          <button onClick={logout} style={{ padding: '6px 12px', border: '1px solid #2a2a30', borderRadius: 6, background: 'transparent', color: '#ff3b30', cursor: 'pointer', fontFamily: 'Space Mono', fontSize: 11, fontWeight: 700 }}>Logout</button>
        </div>

        {/* Tabs */}
        <div style={{ background: '#111113', borderBottom: '1px solid #2a2a30', padding: '0 24px', display: 'flex', gap: 4 }}>
          {(['overview', 'users', 'servers', 'messages'] as Tab[]).map(t => (
            <button key={t} className={`adm-tab ${tab === t ? 'active' : ''}`}
              onClick={() => {
                setTab(t); setSearch('');
                if (t === 'users') loadUsers();
                if (t === 'servers') loadServers();
              }}>
              {t.toUpperCase()}
            </button>
          ))}
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 24 }}>

          {/* OVERVIEW */}
          {tab === 'overview' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
              <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                {[
                  { label: 'TOTAL USERS', value: stats?.userCount ?? '—', icon: '👤' },
                  { label: 'TOTAL SERVERS', value: stats?.serverCount ?? '—', icon: '🖥' },
                  { label: 'TOTAL MESSAGES', value: stats?.messageCount ?? '—', icon: '💬' },
                ].map(s => (
                  <div key={s.label} className="adm-stat">
                    <div style={{ fontSize: 10, color: '#555', letterSpacing: '0.12em', marginBottom: 8 }}>{s.label}</div>
                    <div style={{ fontSize: 28, fontWeight: 700, color: '#e0e0e0' }}>{s.value}</div>
                  </div>
                ))}
              </div>

              <div>
                <div style={{ fontSize: 11, color: '#555', letterSpacing: '0.12em', marginBottom: 12, fontWeight: 700 }}>RECENT USERS</div>
                <div style={{ background: '#111113', border: '1px solid #2a2a30', borderRadius: 10, overflow: 'hidden' }}>
                  <table className="adm-table">
                    <thead><tr><th>USERNAME</th><th>EMAIL</th><th>REGISTERED</th><th>STATUS</th></tr></thead>
                    <tbody>
                      {users.slice(0, 10).map(u => (
                        <tr key={u.id}>
                          <td style={{ color: u.banned ? '#ff3b30' : '#e0e0e0', fontWeight: 700 }}>{u.username}{u.banned ? ' 🚫' : ''}</td>
                          <td style={{ color: '#888' }}>{u.email}</td>
                          <td style={{ color: '#666' }}>{fmtDate(u.registeredAt)}</td>
                          <td><span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 4, background: u.banned ? 'rgba(255,59,48,0.1)' : 'rgba(35,165,90,0.1)', color: u.banned ? '#ff3b30' : '#23a55a', fontWeight: 700 }}>{u.banned ? 'BANNED' : 'ACTIVE'}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                  <div style={{ fontSize: 11, color: '#555', letterSpacing: '0.12em', fontWeight: 700 }}>RECENT SERVERS</div>
                  <button className="adm-danger-btn" onClick={deleteAllServers}>Delete All Servers</button>
                </div>
                <div style={{ background: '#111113', border: '1px solid #2a2a30', borderRadius: 10, overflow: 'hidden' }}>
                  <table className="adm-table">
                    <thead><tr><th>NAME</th><th>MEMBERS</th><th>CREATED</th><th>ACTIONS</th></tr></thead>
                    <tbody>
                      {servers.slice(0, 10).map(s => (
                        <tr key={s.id}>
                          <td style={{ fontWeight: 700 }}>{s.name}</td>
                          <td style={{ color: '#888' }}>{s.memberCount}</td>
                          <td style={{ color: '#666' }}>{fmtDate(s.createdAt)}</td>
                          <td>
                            <div style={{ display: 'flex', gap: 6 }}>
                              <button className="adm-action" style={{ background: 'rgba(59,130,246,0.1)', color: '#60a5fa' }} onClick={() => loadMessages(s.id)}>Messages</button>
                              <button className="adm-action" style={{ background: 'rgba(255,59,48,0.1)', color: '#ff3b30' }} onClick={() => deleteServer(s.id, s.name)}>Delete</button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* USERS */}
          {tab === 'users' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <input className="adm-search" placeholder="Search users..." value={search} onChange={e => setSearch(e.target.value)} />
                <span style={{ color: '#555', fontSize: 12 }}>{filteredUsers.length} users</span>
              </div>
              <div style={{ background: '#111113', border: '1px solid #2a2a30', borderRadius: 10, overflow: 'hidden' }}>
                <table className="adm-table">
                  <thead><tr><th>USERNAME</th><th>EMAIL</th><th>REGISTERED</th><th>LAST ONLINE</th><th>STATUS</th><th>ACTIONS</th></tr></thead>
                  <tbody>
                    {filteredUsers.map(u => (
                      <tr key={u.id}>
                        <td style={{ color: u.banned ? '#ff3b30' : '#e0e0e0', fontWeight: 700 }}>{u.username}</td>
                        <td style={{ color: '#888' }}>{u.email}</td>
                        <td style={{ color: '#666' }}>{fmtDate(u.registeredAt)}</td>
                        <td style={{ color: '#666' }}>{fmtDate(u.lastOnline)}</td>
                        <td><span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 4, background: u.banned ? 'rgba(255,59,48,0.1)' : 'rgba(35,165,90,0.1)', color: u.banned ? '#ff3b30' : '#23a55a', fontWeight: 700 }}>{u.banned ? 'BANNED' : 'ACTIVE'}</span></td>
                        <td>
                          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                            {u.banned ? (
                              <button className="adm-action" style={{ background: 'rgba(35,165,90,0.1)', color: '#23a55a' }} onClick={() => unbanUser(u.id)}>Unban</button>
                            ) : (
                              <button className="adm-action" style={{ background: 'rgba(255,160,0,0.1)', color: '#ffa000' }} onClick={() => banUser(u.id)}>Ban</button>
                            )}
                            <button className="adm-action" style={{ background: 'rgba(255,59,48,0.1)', color: '#ff3b30' }} onClick={() => deleteUser(u.id, u.username)}>Delete</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* SERVERS */}
          {tab === 'servers' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <input className="adm-search" placeholder="Search servers..." value={search} onChange={e => setSearch(e.target.value)} />
                <span style={{ color: '#555', fontSize: 12 }}>{filteredServers.length} servers</span>
                <div style={{ flex: 1 }} />
                <button className="adm-danger-btn" onClick={deleteAllServers}>Delete All Servers</button>
              </div>
              <div style={{ background: '#111113', border: '1px solid #2a2a30', borderRadius: 10, overflow: 'hidden' }}>
                <table className="adm-table">
                  <thead><tr><th>SERVER NAME</th><th>MEMBERS</th><th>CREATED</th><th>ACTIONS</th></tr></thead>
                  <tbody>
                    {filteredServers.map(s => (
                      <tr key={s.id}>
                        <td style={{ fontWeight: 700 }}>{s.name}</td>
                        <td style={{ color: '#888' }}>{s.memberCount}</td>
                        <td style={{ color: '#666' }}>{fmtDate(s.createdAt)}</td>
                        <td>
                          <div style={{ display: 'flex', gap: 6 }}>
                            <button className="adm-action" style={{ background: 'rgba(59,130,246,0.1)', color: '#60a5fa' }} onClick={() => loadMessages(s.id)}>View Messages</button>
                            <button className="adm-action" style={{ background: 'rgba(255,160,0,0.1)', color: '#ffa000' }} onClick={() => deleteServerMessages(s.id, s.name)}>Clear Messages</button>
                            <button className="adm-action" style={{ background: 'rgba(255,59,48,0.1)', color: '#ff3b30' }} onClick={() => deleteServer(s.id, s.name)}>Delete</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* MESSAGES */}
          {tab === 'messages' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ color: '#e0e0e0', fontSize: 13, fontWeight: 700 }}>
                  {selectedServer ? `Messages — ${servers.find(s => s.id === selectedServer)?.name || selectedServer}` : 'Select a server from the Servers tab'}
                </div>
                <span style={{ color: '#555', fontSize: 12 }}>{messages.length} messages</span>
              </div>
              {messages.length === 0 && !selectedServer && (
                <div style={{ color: '#555', fontSize: 13 }}>Go to the Servers tab and click "View Messages" on a server.</div>
              )}
              <div style={{ background: '#111113', border: '1px solid #2a2a30', borderRadius: 10, overflow: 'hidden' }}>
                <table className="adm-table">
                  <thead><tr><th>AUTHOR</th><th>CONTENT</th><th>CHANNEL</th><th>DATE</th></tr></thead>
                  <tbody>
                    {messages.map(m => (
                      <tr key={m.id}>
                        <td style={{ fontWeight: 700, color: '#e0e0e0', whiteSpace: 'nowrap' }}>{m.authorUsername}</td>
                        <td style={{ color: '#c0c0c0', maxWidth: 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.content}</td>
                        <td style={{ color: '#666', whiteSpace: 'nowrap' }}>{m.channelId?.slice(-6)}</td>
                        <td style={{ color: '#666', whiteSpace: 'nowrap' }}>{fmtDate(m.createdAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
