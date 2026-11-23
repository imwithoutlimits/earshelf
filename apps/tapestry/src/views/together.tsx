import { useEffect, useState } from 'react';
import { Sheet, VaultsPanel, openPlans, type VaultItemView, type VaultKindOption } from '@wells/ui';
import { useUser } from '@wells/auth';
import { formatReference, parseRefKey } from '@wells/scripture';
import { hasFeature } from '@wells/billing/src/plans.ts';
import { api } from '../api';
import { createWell, type WellView } from '../data';
import { usePlan } from '../billing';
import { useNav } from '../nav';

const vaultApi = { get: api.apiGet, post: api.apiPost };
const label = (k: string) => { const r = parseRefKey(k); return r ? formatReference(r) : k; };

function WellItem({ item, onClose }: { item: VaultItemView; onClose: () => void }) {
  const nav = useNav(); const [saved, setSaved] = useState(false);
  const refs = (item.payload.refs as string[] | undefined) ?? []; const desc = String(item.payload.description ?? '');
  return (
    <div>
      <div className="b">{item.title}</div>
      {desc && <p className="sm mut">{desc}</p>}
      <p className="sm">{refs.map(label).join(' · ')}</p>
      <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
        {refs[0] && <button className="btn" onClick={() => { onClose(); nav.go({ t: 'passage', key: refs[0] }); }}>Read first passage</button>}
        <button className="btn" disabled={saved} onClick={async () => { await createWell(item.title, desc, refs); setSaved(true); nav.toast('Saved to your wells'); }}>{saved ? 'Saved' : 'Save as my well'}</button>
      </div>
    </div>
  );
}

/** Partner, family and group vaults. They share wells only: passage lists with a name and short comments. Private notes stay private. */
export function TogetherSheet({ onClose }: { onClose: () => void }) {
  const plan = usePlan(); const user = useUser();
  const meta = user?.user.user_metadata as { full_name?: string; name?: string } | undefined;
  const kinds: VaultKindOption[] = [
    { id: 'partner', label: 'Partner', hint: 'Two people sharing wells.', allowed: hasFeature(plan, 'partner_sharing'), needs: 'Plus' },
    { id: 'family', label: 'Family', hint: 'Up to 8 people for family devotions.', allowed: hasFeature(plan, 'family_vaults'), needs: 'Pro' },
    { id: 'group', label: 'Small group', hint: 'Up to 25 people for a study or small group.', allowed: hasFeature(plan, 'family_vaults'), needs: 'Pro' },
  ];
  return (
    <Sheet label="Together" onClose={onClose}>
      <h2>Together</h2>
      <p className="mut">Share wells with a partner, your family or a group. Only wells are shared: the passages and their names, plus short comments. Your private notes stay private.</p>
      <VaultsPanel product="tapestry" api={vaultApi} kinds={kinds} signedIn={!!user} displayName={meta?.full_name ?? meta?.name} onUpgrade={() => { onClose(); openPlans(); }}
        renderItem={(it) => <WellItem item={it} onClose={onClose} />}
        renderAdd={() => <p className="sm mut">To share a well, open it and choose Share to a vault.</p>} />
    </Sheet>
  );
}

/** Pick one of your vaults and share this well with it. */
export function ShareWellSheet({ well, onClose }: { well: WellView; onClose: () => void }) {
  const user = useUser();
  const [vaults, setVaults] = useState<Array<{ id: string; name: string; kind: string; memberCount: number }> | null>(null);
  const [msg, setMsg] = useState(''); const [busy, setBusy] = useState(false);
  useEffect(() => { if (user) api.apiGet<{ vaults: NonNullable<typeof vaults> }>('/v1/vaults?product=tapestry').then((r) => setVaults(r.vaults)).catch((e) => setMsg(e instanceof Error ? e.message : 'Could not load your vaults.')); }, [user?.user.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const share = async (id: string, name: string) => {
    setBusy(true); setMsg('');
    try { await api.apiPost('/v1/vaults/items', { id, kind: 'well', name: well.name, description: well.description, refs: well.items.map((i) => i.key) }); setMsg(`Shared with ${name}.`); }
    catch (e) { setMsg(e instanceof Error ? e.message : 'Could not share. Try again.'); } finally { setBusy(false); }
  };
  return (
    <Sheet label="Share to a vault" onClose={onClose}>
      <h2>Share to a vault</h2>
      <p className="mut">{well.name} · {well.items.length} {well.items.length === 1 ? 'passage' : 'passages'}. Everyone in the vault will be able to read it and save a copy.</p>
      {!user ? <p className="mut">Sign in to share wells.</p>
        : vaults === null ? <p className="mut">{msg || 'Loading…'}</p>
        : vaults.length === 0 ? <p className="mut">You are not in a vault yet. Open Profile, then Together, to start one or join with a code.</p>
        : vaults.map((v) => <button key={v.id} type="button" className="btn big" style={{ marginTop: 8, width: '100%' }} disabled={busy} onClick={() => void share(v.id, v.name)}>{v.name} <span className="sm mut">({v.memberCount} people)</span></button>)}
      {msg && vaults && <p role="status" className="sm tx" style={{ marginTop: 10 }}>{msg}</p>}
    </Sheet>
  );
}
