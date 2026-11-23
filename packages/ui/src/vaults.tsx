import { useCallback, useEffect, useState, type ReactNode } from 'react';

/**
 * Shared vaults screen, used by both apps: a list of your vaults, create one, join with a code, and inside a vault the members,
 * the shared items and short comments. What an item looks like, and how to add one, is up to each app (renderItem, renderAdd).
 * Every rule (plan, limits, who may remove what) is enforced by the server; this screen only shows the result.
 */
export interface VaultsApi { get<T>(path: string): Promise<T>; post<T>(path: string, body: unknown): Promise<T> }
export type VaultKindId = 'partner' | 'family' | 'group';
export interface VaultListItem { id: string; name: string; kind: VaultKindId; role: 'owner' | 'member'; limit: number; memberCount: number }
export interface VaultComment { id: string; name: string; body: string; mine: boolean; createdAt: string }
export interface VaultItemView { id: string; kind: 'well' | 'link' | 'note'; title: string; payload: Record<string, unknown>; by: string; mine: boolean; createdAt: string; comments: VaultComment[] }
export interface VaultDetailView {
  vault: { id: string; product: string; name: string; kind: VaultKindId; role: 'owner' | 'member'; limit: number; code: string | null };
  members: Array<{ name: string; role: 'owner' | 'member'; you: boolean; userId?: string }>;
  items: VaultItemView[];
}
export interface VaultKindOption { id: VaultKindId; label: string; hint: string; allowed: boolean; needs: string }

const say = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong. Try again.');

export function VaultsPanel({ product, api, kinds, signedIn, displayName, renderItem, renderAdd, onUpgrade }: {
  product: 'earshelf' | 'tapestry';
  api: VaultsApi;
  kinds: VaultKindOption[];
  signedIn: boolean;
  displayName?: string;
  renderItem: (item: VaultItemView) => ReactNode;
  renderAdd?: (ctx: { vaultId: string; reload: () => void }) => ReactNode;
  onUpgrade?: () => void;
}) {
  const [list, setList] = useState<VaultListItem[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [detail, setDetail] = useState<VaultDetailView | null>(null);
  const [err, setErr] = useState(''); const [note, setNote] = useState(''); const [busy, setBusy] = useState(false);
  const [name, setName] = useState(''); const [kind, setKind] = useState<VaultKindId>(kinds.find((k) => k.allowed)?.id ?? kinds[0].id); const [code, setCode] = useState('');
  const [text, setText] = useState<Record<string, string>>({});

  const loadList = useCallback(async () => { try { setList((await api.get<{ vaults: VaultListItem[] }>(`/v1/vaults?product=${product}`)).vaults); } catch (e) { setErr(say(e)); } }, [api, product]);
  const loadDetail = useCallback(async (id: string) => { try { setDetail(await api.get<VaultDetailView>(`/v1/vaults/detail?id=${encodeURIComponent(id)}`)); } catch (e) { setErr(say(e)); setOpen(null); void loadList(); } }, [api, loadList]);
  useEffect(() => { if (signedIn) void loadList(); }, [signedIn, loadList]);
  useEffect(() => { if (open) void loadDetail(open); else setDetail(null); }, [open, loadDetail]);

  const act = async (fn: () => Promise<void>) => { setBusy(true); setErr(''); setNote(''); try { await fn(); } catch (e) { setErr(say(e)); } finally { setBusy(false); } };
  const reload = () => { if (open) void loadDetail(open); void loadList(); };

  if (!signedIn) return <p className="vt-hint">Sign in to share with a partner, your family or a group.</p>;

  if (open && detail) {
    const v = detail.vault; const owner = v.role === 'owner';
    return (
      <div className="vt">
        <button type="button" className="btn" onClick={() => { setOpen(null); void loadList(); }}>Back to my vaults</button>
        <h3 className="vt-title">{v.name}</h3>
        <p className="vt-hint">{kinds.find((k) => k.id === v.kind)?.label ?? v.kind} · {detail.members.length} of {v.limit} people</p>
        {err && <p role="alert" className="vt-error">{err}</p>}
        {note && <p role="status" className="vt-hint">{note}</p>}
        {owner && v.code && (
          <div className="vt-box">
            <div className="vt-label">Invite code</div>
            <div className="vt-code" aria-label={`Invite code ${v.code}`}>{v.code}</div>
            <div className="vt-row">
              <button type="button" className="btn" onClick={() => { void navigator.clipboard?.writeText(v.code!).then(() => setNote('Code copied. Send it to the people you want to invite.')).catch(() => setNote('Press and hold the code to copy it.')); }}>Copy code</button>
              <button type="button" className="btn" disabled={busy} onClick={() => { if (confirm('Make a new code? The old code stops working. People already in the vault stay.')) void act(async () => { await api.post('/v1/vaults/rotate-code', { id: v.id }); reload(); }); }}>New code</button>
            </div>
          </div>
        )}
        <div className="vt-box">
          <div className="vt-label">People</div>
          <ul className="vt-list">{detail.members.map((m, i) => (
            <li key={m.userId ?? `${m.name}-${i}`} className="vt-row vt-between"><span>{m.name}{m.you ? ' (you)' : ''}{m.role === 'owner' ? ' · owner' : ''}</span>
              {owner && m.userId && <button type="button" className="btn" disabled={busy} aria-label={`Remove ${m.name}`} onClick={() => { if (confirm(`Remove ${m.name} from this vault?`)) void act(async () => { await api.post('/v1/vaults/remove-member', { id: v.id, userId: m.userId }); reload(); }); }}>Remove</button>}
            </li>))}</ul>
        </div>
        <div className="vt-box">
          <div className="vt-label">Shared</div>
          {renderAdd?.({ vaultId: v.id, reload })}
          {detail.items.length === 0 && <p className="vt-hint">Nothing shared yet.</p>}
          <ul className="vt-list">{detail.items.map((it) => (
            <li key={it.id} className="vt-item">
              {renderItem(it)}
              <p className="vt-hint">Shared by {it.mine ? 'you' : it.by}</p>
              {it.comments.length > 0 && <ul className="vt-comments">{it.comments.map((c) => <li key={c.id}><strong>{c.mine ? 'You' : c.name}:</strong> {c.body}</li>)}</ul>}
              <div className="vt-row">
                <input className="vt-input" value={text[it.id] ?? ''} maxLength={280} placeholder="Add a short comment" aria-label={`Comment on ${it.title}`} onChange={(e) => setText((t) => ({ ...t, [it.id]: e.target.value }))} />
                <button type="button" className="btn" disabled={busy || !(text[it.id] ?? '').trim()} onClick={() => void act(async () => { await api.post('/v1/vaults/comments', { id: v.id, itemId: it.id, body: text[it.id] }); setText((t) => ({ ...t, [it.id]: '' })); reload(); })}>Send</button>
                {(it.mine || owner) && <button type="button" className="btn" disabled={busy} onClick={() => { if (confirm('Remove this from the vault for everyone?')) void act(async () => { await api.post('/v1/vaults/items/remove', { id: v.id, itemId: it.id }); reload(); }); }}>Remove</button>}
              </div>
            </li>))}</ul>
        </div>
        {owner
          ? <button type="button" className="btn" disabled={busy} onClick={() => { if (confirm('Delete this vault and everything shared in it, for everyone? This cannot be undone.')) void act(async () => { await api.post('/v1/vaults/delete', { id: v.id }); setOpen(null); void loadList(); }); }}>Delete vault</button>
          : <button type="button" className="btn" disabled={busy} onClick={() => { if (confirm('Leave this vault?')) void act(async () => { await api.post('/v1/vaults/leave', { id: v.id }); setOpen(null); void loadList(); }); }}>Leave vault</button>}
      </div>
    );
  }

  const chosen = kinds.find((k) => k.id === kind);
  return (
    <div className="vt">
      {err && <p role="alert" className="vt-error">{err}</p>}
      <div className="vt-box">
        <div className="vt-label">My vaults</div>
        {list === null ? <p className="vt-hint">Loading…</p> : list.length === 0 ? <p className="vt-hint">You are not in any vault yet.</p> : (
          <ul className="vt-list">{list.map((v) => <li key={v.id}><button type="button" className="vt-open" onClick={() => setOpen(v.id)}><strong>{v.name}</strong><span className="vt-hint">{kinds.find((k) => k.id === v.kind)?.label ?? v.kind} · {v.memberCount} of {v.limit} · {v.role === 'owner' ? 'you own it' : 'you joined'}</span></button></li>)}</ul>
        )}
      </div>
      <div className="vt-box">
        <div className="vt-label">Join with a code</div>
        <div className="vt-row">
          <input className="vt-input" value={code} onChange={(e) => setCode(e.target.value)} placeholder="ABCD-2345" aria-label="Invite code" autoCapitalize="characters" autoComplete="off" />
          <button type="button" className="btn primary" disabled={busy || !code.trim()} onClick={() => void act(async () => { const r = await api.post<{ id: string }>('/v1/vaults/join', { product, code, displayName }); setCode(''); await loadList(); setOpen(r.id); })}>Join</button>
        </div>
        <p className="vt-hint">You do not need a paid plan to join.</p>
      </div>
      <div className="vt-box">
        <div className="vt-label">Start a vault</div>
        <div className="vt-row" role="group" aria-label="Kind of vault">{kinds.map((k) => <button key={k.id} type="button" className="vt-pill" aria-pressed={kind === k.id} onClick={() => setKind(k.id)}>{k.label}</button>)}</div>
        {chosen && <p className="vt-hint">{chosen.hint}{!chosen.allowed && ` Starting one needs the ${chosen.needs} plan.`}</p>}
        <div className="vt-row">
          <input className="vt-input" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} placeholder="Name, like Our family" aria-label="Vault name" />
          {chosen && !chosen.allowed
            ? <button type="button" className="btn primary" onClick={onUpgrade}>See plans</button>
            : <button type="button" className="btn primary" disabled={busy || !name.trim()} onClick={() => void act(async () => { const r = await api.post<{ id: string }>('/v1/vaults/create', { product, kind, name, displayName }); setName(''); await loadList(); setOpen(r.id); })}>Create</button>}
        </div>
      </div>
    </div>
  );
}
