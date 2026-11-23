import test from 'node:test';
import assert from 'node:assert/strict';
import { ITEM_KINDS, KINDS_BY_PRODUCT, LIMITS, MAX_ITEMS, MAX_OWNED, addComment, addItem, createVault, deleteVault, displayNameFor, featureFor, joinVault, leaveVault, listVaults, newCode, normalizeCode, removeItem, removeMember, rotateCode, showCode, validateItem, vaultDetail, type CommentRow, type ItemRow, type MemberRow, type VaultRow, type VaultStore } from './vaults.ts';

function memStore() {
  const vaults: VaultRow[] = []; const members: Array<MemberRow & { vaultId: string }> = []; const items: Array<ItemRow & { vaultId: string }> = []; const comments: Array<CommentRow & { vaultId: string }> = [];
  let n = 0; const id = () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`;
  const store: VaultStore = {
    vault: async (i) => vaults.find((v) => v.id === i) ?? null,
    vaultByCode: async (p, c) => vaults.find((v) => v.product === p && v.code === c) ?? null,
    vaultsOf: async (u, p) => vaults.filter((v) => v.product === p).flatMap((v) => { const m = members.find((x) => x.vaultId === v.id && x.userId === u); return m ? [{ vault: v, role: m.role }] : []; }),
    members: async (v) => members.filter((m) => m.vaultId === v),
    insertVault: async (v, name) => { const row = { ...v, id: id(), createdAt: new Date().toISOString() }; vaults.push(row); members.push({ vaultId: row.id, userId: v.ownerId, role: 'owner', displayName: name, joinedAt: row.createdAt }); return row; },
    addMember: async (v, u, name) => { members.push({ vaultId: v.id, userId: u, role: 'member', displayName: name, joinedAt: new Date().toISOString() }); },
    removeMember: async (v, u) => { const i = members.findIndex((m) => m.vaultId === v && m.userId === u); if (i >= 0) members.splice(i, 1); },
    deleteVault: async (i) => { vaults.splice(vaults.findIndex((v) => v.id === i), 1); for (const arr of [members, items, comments] as Array<Array<{ vaultId: string }>>) for (let k = arr.length - 1; k >= 0; k--) if (arr[k].vaultId === i) arr.splice(k, 1); },
    setCode: async (i, c) => { vaults.find((v) => v.id === i)!.code = c; },
    items: async (v) => items.filter((i) => i.vaultId === v),
    insertItem: async (v, u, i) => { const row = { ...i, id: id(), userId: u, vaultId: v.id, createdAt: new Date().toISOString() }; items.push(row); return row; },
    deleteItem: async (v, i) => { const k = items.findIndex((x) => x.vaultId === v && x.id === i); if (k >= 0) items.splice(k, 1); },
    comments: async (v) => comments.filter((c) => c.vaultId === v),
    insertComment: async (v, u, item, name, body) => { const row = { id: id(), itemId: item, userId: u, displayName: name, body, createdAt: new Date().toISOString(), vaultId: v.id }; comments.push(row); return row; },
  };
  return { store, vaults, members, items, comments };
}
const mk = (s: VaultStore, o: Partial<Parameters<typeof createVault>[1]> = {}) => createVault(s, { userId: 'owner', email: 'olive@x.com', product: 'tapestry', plan: 'pro', kind: 'family', name: 'Our family', ...o });
const WELL = { kind: 'well', name: 'Rest', description: 'Quiet passages', refs: ['PSA.23', 'NOPE.1', 'MAT.11.28-30'] };

test('rules are what was approved', () => {
  assert.deepEqual(LIMITS, { partner: 2, family: 8, group: 25 });
  assert.deepEqual(ITEM_KINDS, { earshelf: ['link', 'note'], tapestry: ['well'] });
  assert.deepEqual(KINDS_BY_PRODUCT.earshelf, ['partner', 'group']);
  assert.equal(featureFor('tapestry', 'partner'), 'partner_sharing');
  assert.equal(featureFor('tapestry', 'family'), 'family_vaults');
  assert.equal(featureFor('tapestry', 'group'), 'family_vaults');
  assert.equal(featureFor('earshelf', 'partner'), 'shared_vaults');
});

test('invite codes are 8 characters with nothing easy to mix up, and typing them loosely works', () => {
  for (let i = 0; i < 200; i++) assert.match(newCode(), /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$/);
  assert.equal(showCode('ABCD2345'), 'ABCD-2345');
  assert.equal(normalizeCode(' abcd-2345 '), 'ABCD2345');
  assert.equal(normalizeCode('ABCD234'), null);
  assert.equal(normalizeCode('ABCD234O'), null, 'the letter O is never in a code');
  assert.equal(normalizeCode(undefined), null);
});

test('other members see a first name or nickname, never an email address', () => {
  assert.equal(displayNameFor('  Sam  ', 'sam@x.com'), 'Sam');
  assert.equal(displayNameFor('', 'olive.green@example.com'), 'olive.green');
  assert.equal(displayNameFor('x'.repeat(80)).length, 30);
  assert.equal(displayNameFor(undefined, undefined), 'Someone');
});

test('Tapestry shares wells only; earshelf shares article links and notes, never anything else', () => {
  const w = validateItem('tapestry', WELL);
  assert.deepEqual(w.payload, { description: 'Quiet passages', refs: ['PSA.23', 'MAT.11.28-30'] }, 'an invented passage is dropped');
  assert.throws(() => validateItem('tapestry', { kind: 'note', text: 'hi' }), /Only wells/);
  assert.throws(() => validateItem('tapestry', { kind: 'well', name: 'x', refs: ['NOPE.1'] }), /at least one passage/);
  assert.throws(() => validateItem('tapestry', { kind: 'well', name: '', refs: ['PSA.23'] }), /name/);
  const l = validateItem('earshelf', { kind: 'link', url: 'https://news.site/a?x=1', tags: ['#History', 'history', 'a b'] });
  assert.deepEqual(l.payload, { url: 'https://news.site/a?x=1', tags: ['history', 'a b'] });
  assert.equal(l.title, 'news.site');
  assert.throws(() => validateItem('earshelf', { kind: 'link', url: 'javascript:alert(1)' }), /web address/);
  assert.throws(() => validateItem('earshelf', { kind: 'well', name: 'x', refs: ['PSA.23'] }), /links and short notes/);
  const n = validateItem('earshelf', { kind: 'note', text: '  A thought about chapter 3  ', about: 'The Long Book' });
  assert.deepEqual([n.title, n.payload.text], ['The Long Book', 'A thought about chapter 3']);
  assert.equal((validateItem('earshelf', { kind: 'note', text: 'x'.repeat(5000) }).payload.text as string).length, 1000);
  assert.throws(() => validateItem('earshelf', { kind: 'note', text: '   ' }), /Write something/);
});

test('who may start a vault depends on the plan; people who join need none', async () => {
  const { store } = memStore();
  await assert.rejects(mk(store, { plan: 'free' }), (e: Error & { status: number }) => e.status === 402);
  await assert.rejects(mk(store, { plan: 'plus', kind: 'family' }), /pro plan/);
  assert.equal((await mk(store, { plan: 'plus', kind: 'partner' })).kind, 'partner', 'a partner vault needs only Plus in Tapestry');
  await assert.rejects(mk(store, { product: 'earshelf', plan: 'plus', kind: 'group' }), /pro plan/);
  await assert.rejects(mk(store, { product: 'earshelf', kind: 'family' }), /what kind/, 'no family vaults in earshelf');
  await assert.rejects(mk(store, { name: '   ' }), /name/);
});

test('an owner can have at most five vaults', async () => {
  const { store } = memStore();
  for (let i = 0; i < MAX_OWNED; i++) await mk(store, { name: `V${i}` });
  await assert.rejects(mk(store, { name: 'one too many' }), /up to 5 vaults/);
});

test('joining: a code is needed, limits hold, repeats are harmless, and a code works only in its own app', async () => {
  const { store, members } = memStore();
  const partner = await mk(store, { kind: 'partner' });
  await joinVault(store, { userId: 'p1', product: 'tapestry', code: partner.code.toLowerCase() });
  await joinVault(store, { userId: 'p1', product: 'tapestry', code: partner.code });
  assert.equal(members.length, 2, 'joining twice changes nothing');
  await assert.rejects(joinVault(store, { userId: 'p2', product: 'tapestry', code: partner.code }), /full \(2 people\)/);
  await assert.rejects(joinVault(store, { userId: 'p2', product: 'tapestry', code: 'ZZZZ2222' }), /invite code did not work/);
  await assert.rejects(joinVault(store, { userId: 'p2', product: 'earshelf', code: partner.code }), /invite code did not work/);
  const group = await mk(store, { kind: 'group', name: 'Group' });
  for (let i = 0; i < 24; i++) await joinVault(store, { userId: `g${i}`, product: 'tapestry', code: group.code });
  await assert.rejects(joinVault(store, { userId: 'late', product: 'tapestry', code: group.code }), /full \(25 people\)/);
});

test('only members can see a vault, and only the owner sees the code and the ids needed to remove people', async () => {
  const { store } = memStore();
  const v = await mk(store);
  await joinVault(store, { userId: 'm1', email: 'mia@x.com', product: 'tapestry', code: v.code });
  await assert.rejects(vaultDetail(store, 'stranger', v.id), (e: Error & { status: number }) => e.status === 404);
  const asOwner = await vaultDetail(store, 'owner', v.id);
  const asMember = await vaultDetail(store, 'm1', v.id);
  assert.match(asOwner.vault.code!, /^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
  assert.equal(asMember.vault.code, null);
  assert.ok(asOwner.members.some((m) => 'userId' in m));
  assert.ok(!asMember.members.some((m) => 'userId' in m));
  assert.ok(!JSON.stringify(asOwner).includes('@x.com'), 'no email addresses leave the server');
  assert.deepEqual((await listVaults(store, 'm1', 'tapestry')).map((x) => [x.name, x.role, x.memberCount]), [['Our family', 'member', 2]]);
  assert.deepEqual(await listVaults(store, 'm1', 'earshelf'), []);
});

test('sharing, removing and commenting follow who owns what', async () => {
  const { store } = memStore();
  const v = await mk(store);
  await joinVault(store, { userId: 'm1', product: 'tapestry', code: v.code });
  await joinVault(store, { userId: 'm2', product: 'tapestry', code: v.code });
  const item = await addItem(store, 'm1', v.id, WELL);
  await assert.rejects(addItem(store, 'stranger', v.id, WELL), (e: Error & { status: number }) => e.status === 404);
  await assert.rejects(removeItem(store, 'm2', v.id, item.id), /person who shared it/);
  await addComment(store, 'm2', v.id, item.id, '  Lovely set of passages  ');
  await assert.rejects(addComment(store, 'm2', v.id, item.id, '   '), /short comment/);
  await assert.rejects(addComment(store, 'm2', v.id, 'no-item', 'hi'), /not found/);
  const view = await vaultDetail(store, 'owner', v.id);
  assert.equal(view.items[0].comments[0].body, 'Lovely set of passages');
  assert.equal(view.items[0].by, 'Someone');
  await removeItem(store, 'owner', v.id, item.id); // the owner may remove anything
  assert.equal((await vaultDetail(store, 'owner', v.id)).items.length, 0);
});

test('a vault holds a limited number of shared things', async () => {
  const { store } = memStore();
  const v = await mk(store);
  for (let i = 0; i < MAX_ITEMS; i++) await addItem(store, 'owner', v.id, { ...WELL, name: `W${i}` });
  await assert.rejects(addItem(store, 'owner', v.id, WELL), /up to 200/);
});

test('leaving, removing, new codes and deleting', async () => {
  const { store, vaults } = memStore();
  const v = await mk(store);
  await joinVault(store, { userId: 'm1', product: 'tapestry', code: v.code });
  await joinVault(store, { userId: 'm2', product: 'tapestry', code: v.code });
  await assert.rejects(leaveVault(store, 'owner', v.id), /Delete it instead/);
  await leaveVault(store, 'm1', v.id);
  await assert.rejects(vaultDetail(store, 'm1', v.id), /not found/);
  await assert.rejects(removeMember(store, 'm2', v.id, 'owner'), /Only the owner/);
  await assert.rejects(removeMember(store, 'owner', v.id, 'owner'), /Delete the vault/);
  await assert.rejects(removeMember(store, 'owner', v.id, 'ghost'), /not in this vault/);
  await removeMember(store, 'owner', v.id, 'm2');
  const old = v.code;
  const fresh = await rotateCode(store, 'owner', v.id);
  assert.notEqual(fresh.replace('-', ''), old);
  await assert.rejects(joinVault(store, { userId: 'late', product: 'tapestry', code: old }), /invite code did not work/, 'the old code stops working');
  await assert.rejects(rotateCode(store, 'stranger', v.id), /not found/);
  await assert.rejects(deleteVault(store, 'stranger', v.id), /not found/);
  await deleteVault(store, 'owner', v.id);
  assert.equal(vaults.length, 0);
});
