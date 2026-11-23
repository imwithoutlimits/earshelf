import { useState } from 'react';
import { Sheet, VaultsPanel, openPlans, type VaultItemView, type VaultKindOption } from '@wells/ui';
import { makeShareLink } from '@wells/core';
import { hasFeature } from '@wells/billing/src/plans.ts';
import { apiGet, apiPost } from '../supabase';
import { useUser } from '../auth';
import { usePlan } from '../hooks';
import { UpgradeNote } from './UpgradeNote';

const api = { get: apiGet, post: apiPost } as const;

/** Pro: shared vaults for a couple or a study group. They hold article links and short notes. Files and book text are never shared. */
export function VaultsCard() {
  const plan = usePlan(); const user = useUser(); const pro = hasFeature(plan, 'shared_vaults');
  const [open, setOpen] = useState(false);
  const meta = user?.user.user_metadata as { full_name?: string; name?: string } | undefined;
  const kinds: VaultKindOption[] = [
    { id: 'partner', label: 'Partner', hint: 'Two people sharing articles and notes.', allowed: pro, needs: 'Pro' },
    { id: 'group', label: 'Book club or study group', hint: 'Up to 25 people sharing articles and notes.', allowed: pro, needs: 'Pro' },
  ];
  return (
    <div className="card stack">
      <h2 className="sub">Shared vaults</h2>
      <p className="hint">Share web articles and short notes with a partner, a book club or a study group. Only links and notes are shared, never your files or the text of your books.</p>
      {!pro && <UpgradeNote>Starting a shared vault is included with Pro. You can join one with an invite code on any plan.</UpgradeNote>}
      <button className="btn" onClick={() => setOpen(true)}>{pro ? 'Open shared vaults' : 'Join a vault with a code'}</button>
      {open && (
        <Sheet label="Shared vaults" onClose={() => setOpen(false)}>
          <h2 className="sub">Shared vaults</h2>
          <VaultsPanel product="earshelf" api={api} kinds={kinds} signedIn={!!user} displayName={meta?.full_name ?? meta?.name} onUpgrade={() => { setOpen(false); openPlans(); }}
            renderItem={(it) => <VaultItem item={it} />}
            renderAdd={({ vaultId, reload }) => <AddToVault vaultId={vaultId} reload={reload} />} />
        </Sheet>
      )}
    </div>
  );
}

function VaultItem({ item }: { item: VaultItemView }) {
  if (item.kind === 'link') {
    const url = String(item.payload.url ?? ''); const tags = (item.payload.tags as string[] | undefined) ?? [];
    const mine = makeShareLink(location.origin, url);
    return (
      <div className="stack">
        <strong>{item.title}</strong>
        <a href={url} target="_blank" rel="noopener noreferrer" className="hint">{url}</a>
        {tags.length > 0 && <p className="hint">{tags.map((t) => `#${t}`).join(' ')}</p>}
        {mine && <a className="btn" href={mine}>Add to my library</a>}
      </div>
    );
  }
  return <div className="stack">{item.payload.about ? <strong>{String(item.payload.about)}</strong> : null}<p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{String(item.payload.text ?? '')}</p></div>;
}

function AddToVault({ vaultId, reload }: { vaultId: string; reload: () => void }) {
  const [kind, setKind] = useState<'link' | 'note'>('link');
  const [url, setUrl] = useState(''); const [title, setTitle] = useState(''); const [text, setText] = useState(''); const [about, setAbout] = useState('');
  const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const send = async () => {
    setBusy(true); setErr('');
    try {
      await apiPost('/v1/vaults/items', kind === 'link' ? { id: vaultId, kind, url, title } : { id: vaultId, kind, text, about });
      setUrl(''); setTitle(''); setText(''); setAbout(''); reload();
    } catch (e) { setErr(e instanceof Error ? e.message : 'Could not share that. Try again.'); } finally { setBusy(false); }
  };
  return (
    <div className="stack">
      <div className="vt-row" role="group" aria-label="What to share">
        {(['link', 'note'] as const).map((k) => <button key={k} type="button" className="vt-pill" aria-pressed={kind === k} onClick={() => setKind(k)}>{k === 'link' ? 'Article link' : 'Note'}</button>)}
      </div>
      {kind === 'link' ? (
        <>
          <input className="vt-input" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Paste a web address" aria-label="Web address" inputMode="url" />
          <input className="vt-input" value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} placeholder="Title (optional)" aria-label="Title" />
        </>
      ) : (
        <>
          <input className="vt-input" value={about} maxLength={120} onChange={(e) => setAbout(e.target.value)} placeholder="About (a book or article, optional)" aria-label="What the note is about" />
          <textarea className="vt-input" style={{ minHeight: 90, padding: 12 }} value={text} maxLength={1000} onChange={(e) => setText(e.target.value)} placeholder="Write a short note" aria-label="Note" />
        </>
      )}
      {err && <p role="alert" className="vt-error">{err}</p>}
      <button type="button" className="btn primary" disabled={busy || !(kind === 'link' ? url.trim() : text.trim())} onClick={() => void send()}>Share with the vault</button>
    </div>
  );
}
