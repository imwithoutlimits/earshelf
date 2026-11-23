import { randomInt } from 'node:crypto';
import { cleanUrl, normalizeTag } from '../../../packages/core/src/index.ts';
import { keepValidRefs } from '../../../packages/scripture/src/index.ts';
import { hasFeature, minimumPlanFor, type Feature, type Plan } from '../../../packages/billing/src/plans.ts';
import { HttpError } from './entitlements.ts';
import { rest } from './supa.ts';

/**
 * Shared vaults (owner-approved design). A vault is a small private group: a couple, a family or a study group.
 * Tapestry shares WELLS only (passage lists with a name and short comments). Private notes stay private.
 * earshelf shares web-article LINKS and short NOTES, never files. Joining needs an 8 character invite code.
 * The owner needs the paid plan; people who join do not. The API server is the only thing that reads or writes these tables,
 * so every rule below is enforced here, not in the app.
 */
export type VaultProduct = 'earshelf' | 'tapestry';
export type VaultKind = 'partner' | 'family' | 'group';
export type ItemKind = 'well' | 'link' | 'note';

export const LIMITS: Record<VaultKind, number> = { partner: 2, family: 8, group: 25 };
export const KINDS_BY_PRODUCT: Record<VaultProduct, VaultKind[]> = { earshelf: ['partner', 'group'], tapestry: ['partner', 'family', 'group'] };
export const ITEM_KINDS: Record<VaultProduct, ItemKind[]> = { earshelf: ['link', 'note'], tapestry: ['well'] };
export const MAX_OWNED = 5, MAX_ITEMS = 200, MAX_COMMENTS = 50, MAX_COMMENT_CHARS = 280;

/** Who may start a vault. A partner vault is a Plus feature in Tapestry; family and group vaults are Pro; earshelf vaults are Pro. */
export function featureFor(product: VaultProduct, kind: VaultKind): Feature {
  if (product === 'earshelf') return 'shared_vaults';
  return kind === 'partner' ? 'partner_sharing' : 'family_vaults';
}

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0, O, 1 or I: nothing to mix up when read aloud
export const newCode = (): string => Array.from({ length: 8 }, () => ALPHABET[randomInt(ALPHABET.length)]).join('');
export const showCode = (c: string): string => `${c.slice(0, 4)}-${c.slice(4)}`;
export function normalizeCode(raw: unknown): string | null {
  const c = String(raw ?? '').toUpperCase().replace(/[\s-]/g, '');
  return /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$/.test(c) ? c : null;
}

const oneLine = (v: unknown, max: number): string => String(v ?? '').replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
/** What other members see. Never an email address. */
export const displayNameFor = (given: unknown, email?: string): string => oneLine(given, 30) || oneLine(email?.split('@')[0], 30) || 'Someone';

export interface ItemInput { kind: ItemKind; title: string; payload: Record<string, unknown> }
const bad = (m: string) => new HttpError(400, 'bad_request', m);

export function validateItem(product: VaultProduct, input: Record<string, unknown>): ItemInput {
  const kind = input.kind as ItemKind;
  if (!ITEM_KINDS[product].includes(kind)) throw bad(product === 'tapestry' ? 'Only wells can be shared here.' : 'Only article links and short notes can be shared here.');
  if (kind === 'well') {
    const name = oneLine(input.name, 80);
    const refs = keepValidRefs(input.refs).slice(0, 30);
    if (!name) throw bad('Give the well a name.');
    if (!refs.length) throw bad('A shared well needs at least one passage.');
    return { kind, title: name, payload: { description: oneLine(input.description, 200), refs } };
  }
  if (kind === 'link') {
    const url = cleanUrl(String(input.url ?? ''));
    if (!url) throw bad('That does not look like a web address.');
    const tags = (Array.isArray(input.tags) ? input.tags : []).map((t) => normalizeTag(String(t))).filter(Boolean).slice(0, 5);
    return { kind, title: oneLine(input.title, 120) || new URL(url).hostname, payload: { url, tags: [...new Set(tags)] } };
  }
  const text = String(input.text ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim().slice(0, 1000);
  if (!text) throw bad('Write something to share.');
  const about = oneLine(input.about, 120);
  return { kind: 'note', title: about || text.replace(/\s+/g, ' ').slice(0, 50), payload: { text, about } };
}

// ---------- rules, with the database behind a small interface so they can be tested ----------
export interface VaultRow { id: string; product: VaultProduct; kind: VaultKind; name: string; ownerId: string; code: string; createdAt: string }
export interface MemberRow { userId: string; role: 'owner' | 'member'; displayName: string; joinedAt: string }
export interface ItemRow { id: string; kind: ItemKind; title: string; payload: Record<string, unknown>; userId: string; createdAt: string }
export interface CommentRow { id: string; itemId: string; userId: string; displayName: string; body: string; createdAt: string }

export interface VaultStore {
  vault(id: string): Promise<VaultRow | null>;
  vaultByCode(product: VaultProduct, code: string): Promise<VaultRow | null>;
  vaultsOf(userId: string, product: VaultProduct): Promise<Array<{ vault: VaultRow; role: 'owner' | 'member' }>>;
  members(vaultId: string): Promise<MemberRow[]>;
  insertVault(v: Omit<VaultRow, 'id' | 'createdAt'>, ownerName: string): Promise<VaultRow>; // also makes the owner the first member
  addMember(vault: VaultRow, userId: string, displayName: string): Promise<void>;
  removeMember(vaultId: string, userId: string): Promise<void>;
  deleteVault(id: string): Promise<void>;
  setCode(id: string, code: string): Promise<void>;
  items(vaultId: string): Promise<ItemRow[]>;
  insertItem(vault: VaultRow, userId: string, i: ItemInput): Promise<ItemRow>;
  deleteItem(vaultId: string, itemId: string): Promise<void>;
  comments(vaultId: string): Promise<CommentRow[]>;
  insertComment(vault: VaultRow, userId: string, itemId: string, displayName: string, body: string): Promise<CommentRow>;
}

const notFound = () => new HttpError(404, 'no_such_vault', 'That vault was not found.');
const forbidden = (m: string) => new HttpError(403, 'not_allowed', m);

/** Loads a vault only for someone who belongs to it. Everyone else gets "not found", so a vault's existence is never revealed. */
async function asMember(store: VaultStore, userId: string, vaultId: string) {
  const vault = await store.vault(vaultId);
  const members = vault ? await store.members(vault.id) : [];
  const me = members.find((m) => m.userId === userId);
  if (!vault || !me) throw notFound();
  return { vault, members, me };
}

export async function createVault(store: VaultStore, o: { userId: string; email?: string; product: VaultProduct; plan: Plan; kind: unknown; name: unknown; displayName?: unknown }): Promise<VaultRow> {
  const kind = o.kind as VaultKind;
  if (!KINDS_BY_PRODUCT[o.product].includes(kind)) throw bad('Choose what kind of vault this is.');
  const feature = featureFor(o.product, kind);
  if (!hasFeature(o.plan, feature)) throw new HttpError(402, 'upgrade_required', `Starting a ${kind} vault needs the ${minimumPlanFor(feature)} plan. People you invite do not need a plan.`);
  const name = oneLine(o.name, 60);
  if (!name) throw bad('Give the vault a name.');
  const owned = (await store.vaultsOf(o.userId, o.product)).filter((v) => v.role === 'owner').length;
  if (owned >= MAX_OWNED) throw new HttpError(409, 'too_many_vaults', `You can own up to ${MAX_OWNED} vaults. Delete one first.`);
  return store.insertVault({ product: o.product, kind, name, ownerId: o.userId, code: newCode() }, displayNameFor(o.displayName, o.email));
}

export async function joinVault(store: VaultStore, o: { userId: string; email?: string; product: VaultProduct; code: unknown; displayName?: unknown }): Promise<VaultRow> {
  const code = normalizeCode(o.code);
  const vault = code ? await store.vaultByCode(o.product, code) : null;
  if (!vault) throw new HttpError(404, 'bad_code', 'That invite code did not work. Check it with the person who sent it.');
  const members = await store.members(vault.id);
  if (members.some((m) => m.userId === o.userId)) return vault;
  if (members.length >= LIMITS[vault.kind]) throw new HttpError(409, 'vault_full', `This ${vault.kind} vault is full (${LIMITS[vault.kind]} people).`);
  await store.addMember(vault, o.userId, displayNameFor(o.displayName, o.email));
  return vault;
}

export async function listVaults(store: VaultStore, userId: string, product: VaultProduct) {
  const mine = await store.vaultsOf(userId, product);
  return Promise.all(mine.map(async ({ vault, role }) => ({ id: vault.id, name: vault.name, kind: vault.kind, role, limit: LIMITS[vault.kind], memberCount: (await store.members(vault.id)).length })));
}

export async function vaultDetail(store: VaultStore, userId: string, vaultId: string) {
  const { vault, members, me } = await asMember(store, userId, vaultId);
  const owner = me.role === 'owner';
  const [items, comments] = await Promise.all([store.items(vault.id), store.comments(vault.id)]);
  const names = new Map(members.map((m) => [m.userId, m.displayName]));
  return {
    vault: { id: vault.id, product: vault.product, name: vault.name, kind: vault.kind, role: me.role, limit: LIMITS[vault.kind], code: owner ? showCode(vault.code) : null },
    members: members.map((m) => ({ name: m.displayName, role: m.role, you: m.userId === userId, ...(owner && m.role !== 'owner' ? { userId: m.userId } : {}) })),
    items: items.map((i) => ({ id: i.id, kind: i.kind, title: i.title, payload: i.payload, by: names.get(i.userId) ?? 'Former member', mine: i.userId === userId, createdAt: i.createdAt,
      comments: comments.filter((c) => c.itemId === i.id).map((c) => ({ id: c.id, name: c.displayName, body: c.body, mine: c.userId === userId, createdAt: c.createdAt })) })),
  };
}

export async function addItem(store: VaultStore, userId: string, vaultId: string, input: Record<string, unknown>) {
  const { vault } = await asMember(store, userId, vaultId);
  const item = validateItem(vault.product, input);
  if ((await store.items(vault.id)).length >= MAX_ITEMS) throw new HttpError(409, 'vault_full_items', `A vault holds up to ${MAX_ITEMS} shared things. Remove some first.`);
  return store.insertItem(vault, userId, item);
}

export async function removeItem(store: VaultStore, userId: string, vaultId: string, itemId: string) {
  const { vault, me } = await asMember(store, userId, vaultId);
  const item = (await store.items(vault.id)).find((i) => i.id === itemId);
  if (!item) throw new HttpError(404, 'no_such_item', 'That item was not found.');
  if (item.userId !== userId && me.role !== 'owner') throw forbidden('Only the person who shared it, or the owner, can remove it.');
  await store.deleteItem(vault.id, itemId);
}

export async function addComment(store: VaultStore, userId: string, vaultId: string, itemId: string, body: unknown) {
  const { vault, me } = await asMember(store, userId, vaultId);
  const text = oneLine(body, MAX_COMMENT_CHARS);
  if (!text) throw bad('Write a short comment.');
  const items = await store.items(vault.id);
  if (!items.some((i) => i.id === itemId)) throw new HttpError(404, 'no_such_item', 'That item was not found.');
  const existing = (await store.comments(vault.id)).filter((c) => c.itemId === itemId).length;
  if (existing >= MAX_COMMENTS) throw new HttpError(409, 'too_many_comments', 'This item already has the most comments it can hold.');
  return store.insertComment(vault, userId, itemId, me.displayName, text);
}

export async function leaveVault(store: VaultStore, userId: string, vaultId: string) {
  const { vault, me } = await asMember(store, userId, vaultId);
  if (me.role === 'owner') throw forbidden('You own this vault. Delete it instead of leaving.');
  await store.removeMember(vault.id, userId);
}
export async function removeMember(store: VaultStore, ownerId: string, vaultId: string, target: string) {
  const { vault, me, members } = await asMember(store, ownerId, vaultId);
  if (me.role !== 'owner') throw forbidden('Only the owner can remove people.');
  if (target === ownerId) throw bad('Delete the vault instead of removing yourself.');
  if (!members.some((m) => m.userId === target)) throw new HttpError(404, 'no_such_member', 'That person is not in this vault.');
  await store.removeMember(vault.id, target);
}
export async function rotateCode(store: VaultStore, ownerId: string, vaultId: string): Promise<string> {
  const { vault, me } = await asMember(store, ownerId, vaultId);
  if (me.role !== 'owner') throw forbidden('Only the owner can make a new code.');
  const code = newCode();
  await store.setCode(vault.id, code);
  return showCode(code);
}
export async function deleteVault(store: VaultStore, ownerId: string, vaultId: string) {
  const { vault, me } = await asMember(store, ownerId, vaultId);
  if (me.role !== 'owner') throw forbidden('Only the owner can delete the vault.');
  await store.deleteVault(vault.id);
}

// ---------- the real database ----------
type VRow = { id: string; product: VaultProduct; kind: VaultKind; name: string; user_id: string; invite_code: string; created_at: string };
const toVault = (r: VRow): VaultRow => ({ id: r.id, product: r.product, kind: r.kind, name: r.name, ownerId: r.user_id, code: r.invite_code, createdAt: r.created_at });
const VCOLS = 'id,product,kind,name,user_id,invite_code,created_at';
const uuid = (s: string) => { if (!/^[0-9a-f-]{36}$/i.test(s)) throw new HttpError(400, 'bad_request', 'That id does not look right.'); return s; };

export const supaVaultStore: VaultStore = {
  async vault(id) { const r = (await rest<VRow[]>(`vaults?id=eq.${uuid(id)}&select=${VCOLS}`))[0]; return r ? toVault(r) : null; },
  async vaultByCode(product, code) { const r = (await rest<VRow[]>(`vaults?product=eq.${product}&invite_code=eq.${encodeURIComponent(code)}&select=${VCOLS}`))[0]; return r ? toVault(r) : null; },
  async vaultsOf(userId, product) {
    const mine = await rest<Array<{ vault_id: string; role: 'owner' | 'member' }>>(`vault_members?user_id=eq.${userId}&product=eq.${product}&select=vault_id,role`);
    if (!mine.length) return [];
    const rows = await rest<VRow[]>(`vaults?id=in.(${mine.map((m) => uuid(m.vault_id)).join(',')})&select=${VCOLS}&order=created_at.desc`);
    return rows.map((r) => ({ vault: toVault(r), role: mine.find((m) => m.vault_id === r.id)!.role }));
  },
  async members(vaultId) { return (await rest<Array<{ user_id: string; role: 'owner' | 'member'; display_name: string; joined_at: string }>>(`vault_members?vault_id=eq.${uuid(vaultId)}&select=user_id,role,display_name,joined_at&order=joined_at`)).map((m) => ({ userId: m.user_id, role: m.role, displayName: m.display_name, joinedAt: m.joined_at })); },
  async insertVault(v, ownerName) {
    const [r] = await rest<VRow[]>('vaults', { method: 'POST', prefer: 'return=representation', body: { product: v.product, kind: v.kind, name: v.name, user_id: v.ownerId, invite_code: v.code } });
    await rest('vault_members', { method: 'POST', prefer: 'return=minimal', body: { vault_id: r.id, user_id: v.ownerId, product: v.product, role: 'owner', display_name: ownerName } });
    return toVault(r);
  },
  async addMember(vault, userId, displayName) { await rest('vault_members?on_conflict=vault_id,user_id', { method: 'POST', prefer: 'resolution=ignore-duplicates,return=minimal', body: { vault_id: vault.id, user_id: userId, product: vault.product, role: 'member', display_name: displayName } }); },
  async removeMember(vaultId, userId) { await rest(`vault_members?vault_id=eq.${uuid(vaultId)}&user_id=eq.${userId}`, { method: 'DELETE', prefer: 'return=minimal' }); },
  async deleteVault(id) { await rest(`vaults?id=eq.${uuid(id)}`, { method: 'DELETE', prefer: 'return=minimal' }); },
  async setCode(id, code) { await rest(`vaults?id=eq.${uuid(id)}`, { method: 'PATCH', prefer: 'return=minimal', body: { invite_code: code } }); },
  async items(vaultId) { return (await rest<Array<{ id: string; kind: ItemKind; title: string; payload: Record<string, unknown>; user_id: string; created_at: string }>>(`vault_items?vault_id=eq.${uuid(vaultId)}&select=id,kind,title,payload,user_id,created_at&order=created_at.desc&limit=${MAX_ITEMS + 1}`)).map((i) => ({ id: i.id, kind: i.kind, title: i.title, payload: i.payload, userId: i.user_id, createdAt: i.created_at })); },
  async insertItem(vault, userId, i) {
    const [r] = await rest<Array<{ id: string; created_at: string }>>('vault_items', { method: 'POST', prefer: 'return=representation', body: { vault_id: vault.id, user_id: userId, product: vault.product, kind: i.kind, title: i.title, payload: i.payload } });
    return { id: r.id, kind: i.kind, title: i.title, payload: i.payload, userId, createdAt: r.created_at };
  },
  async deleteItem(vaultId, itemId) { await rest(`vault_items?id=eq.${uuid(itemId)}&vault_id=eq.${uuid(vaultId)}`, { method: 'DELETE', prefer: 'return=minimal' }); },
  async comments(vaultId) { return (await rest<Array<{ id: string; item_id: string; user_id: string; display_name: string; body: string; created_at: string }>>(`vault_comments?vault_id=eq.${uuid(vaultId)}&select=id,item_id,user_id,display_name,body,created_at&order=created_at&limit=2000`)).map((c) => ({ id: c.id, itemId: c.item_id, userId: c.user_id, displayName: c.display_name, body: c.body, createdAt: c.created_at })); },
  async insertComment(vault, userId, itemId, displayName, body) {
    const [r] = await rest<Array<{ id: string; created_at: string }>>('vault_comments', { method: 'POST', prefer: 'return=representation', body: { vault_id: vault.id, item_id: uuid(itemId), user_id: userId, product: vault.product, display_name: displayName, body } });
    return { id: r.id, itemId, userId, displayName, body, createdAt: r.created_at };
  },
};
