import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Asset, Category, Guideline, ProjectDoc } from '@eddy/rules';
import type { Backend, Folder, Project, ProjectMeta, UserInfo, Version, VersionMeta } from './types';
import { sha256 } from './util';

/* Postgres (Supabase) for folders, projects, versions and the library; audio bytes on Cloudflare R2
   through the /api/audio function, addressed by SHA-256 so each file is stored once. */

const PROJECT_META = 'id,folder_id,name,product,created_at,updated_at,updated_by,head_version,duration';

const toFolder = (r: any): Folder => ({ id: r.id, parentId: r.parent_id, name: r.name, createdAt: r.created_at, updatedAt: r.updated_at });
const toMeta = (r: any): ProjectMeta => ({
  id: r.id, folderId: r.folder_id, name: r.name, product: r.product, createdAt: r.created_at, updatedAt: r.updated_at,
  updatedBy: r.updated_by, headVersion: r.head_version, duration: r.duration ?? undefined,
});
const toVersionMeta = (r: any): VersionMeta => ({
  id: r.id, projectId: r.project_id, versionNo: r.version_no, note: r.note, createdAt: r.created_at, createdBy: r.created_by,
});
const toAsset = (r: any): Asset => ({
  hash: r.hash, name: r.name, categoryId: r.category_id, role: r.role, tags: r.tags || [], dur: r.dur, size: r.size,
  mime: r.mime, product: r.product || undefined, createdAt: r.created_at,
});

function check<T>(res: { data: T | null; error: any }): T {
  if (res.error) throw new Error(res.error.message || String(res.error));
  return res.data as T;
}

export class SupabaseBackend implements Backend {
  readonly kind = 'cloud' as const;
  readonly sb: SupabaseClient;
  private blobCache = new Map<string, Blob>();

  constructor(url: string, anonKey: string, private audioBase = '/api/audio') {
    this.sb = createClient(url, anonKey, { auth: { persistSession: true, autoRefreshToken: true } });
  }

  async signInWithGoogle() {
    await this.sb.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: location.origin + location.pathname } });
  }
  async signOut() {
    await this.sb.auth.signOut();
  }
  async user(): Promise<UserInfo | null> {
    const { data } = await this.sb.auth.getSession();
    const u = data.session?.user;
    if (!u) return null;
    return { id: u.id, email: u.email || '', name: (u.user_metadata?.full_name as string) || u.email || '' };
  }
  private async token() {
    const { data } = await this.sb.auth.getSession();
    return data.session?.access_token || '';
  }

  /* ---------- folders ---------- */
  async listFolders() {
    return check(await this.sb.from('folders').select('*').order('name')).map(toFolder);
  }
  async createFolder(name: string, parentId: string | null) {
    return toFolder(check(await this.sb.from('folders').insert({ name, parent_id: parentId }).select().single()));
  }
  async renameFolder(id: string, name: string) {
    check(await this.sb.from('folders').update({ name, updated_at: new Date().toISOString() }).eq('id', id));
  }
  async moveFolder(id: string, parentId: string | null) {
    if (parentId === id) throw new Error('A folder can’t go inside itself.');
    check(await this.sb.from('folders').update({ parent_id: parentId, updated_at: new Date().toISOString() }).eq('id', id));
  }
  async deleteFolder(id: string) {
    check(await this.sb.from('folders').delete().eq('id', id)); // sub-folders, projects and versions cascade
  }

  /* ---------- projects ---------- */
  async listProjects() {
    return check(await this.sb.from('projects').select(PROJECT_META).order('updated_at', { ascending: false })).map(toMeta);
  }
  async createProject(name: string, folderId: string | null, doc: ProjectDoc) {
    return toMeta(check(await this.sb.from('projects').insert({ name, folder_id: folderId, product: doc.product || '', draft: doc }).select(PROJECT_META).single()));
  }
  async getProject(id: string): Promise<Project | null> {
    const r = check(await this.sb.from('projects').select('*').eq('id', id).maybeSingle()) as any;
    return r ? { ...toMeta(r), draft: r.draft } : null;
  }
  async renameProject(id: string, name: string) {
    check(await this.sb.from('projects').update({ name, updated_at: new Date().toISOString() }).eq('id', id));
  }
  async moveProject(id: string, folderId: string | null) {
    check(await this.sb.from('projects').update({ folder_id: folderId, updated_at: new Date().toISOString() }).eq('id', id));
  }
  async deleteProject(id: string) {
    check(await this.sb.from('projects').delete().eq('id', id));
  }
  async saveDraft(id: string, doc: ProjectDoc, duration?: number) {
    const u = await this.user();
    check(await this.sb.from('projects').update({
      draft: doc, product: doc.product || '', updated_at: new Date().toISOString(), updated_by: u?.email || null,
      ...(duration != null ? { duration } : {}),
    }).eq('id', id));
  }

  /* ---------- versions ---------- */
  async saveVersion(projectId: string, doc: ProjectDoc, note: string) {
    return toVersionMeta(check(await this.sb.rpc('save_version', { p_project: projectId, p_doc: doc, p_note: note })));
  }
  async listVersions(projectId: string) {
    return check(await this.sb.from('project_versions').select('id,project_id,version_no,note,created_by,created_at')
      .eq('project_id', projectId).order('version_no', { ascending: false })).map(toVersionMeta);
  }
  async getVersion(versionId: string): Promise<Version | null> {
    const r = check(await this.sb.from('project_versions').select('*').eq('id', versionId).maybeSingle()) as any;
    return r ? { ...toVersionMeta(r), doc: r.doc } : null;
  }

  /* ---------- library ---------- */
  async listCategories(): Promise<Category[]> {
    return check(await this.sb.from('categories').select('*').order('sort')) as Category[];
  }
  async saveCategory(c: Category) {
    check(await this.sb.from('categories').upsert({ id: c.id, name: c.name, role: c.role, sort: c.sort ?? 0 }));
  }
  async deleteCategory(id: string) {
    check(await this.sb.from('categories').delete().eq('id', id));
  }
  async listAssets() {
    return check(await this.sb.from('assets').select('*').order('name')).map(toAsset);
  }
  async putAsset(meta: Omit<Asset, 'hash' | 'size' | 'mime'>, file: Blob) {
    const hash = await this.putAudio(file);
    const row = { hash, name: meta.name, category_id: meta.categoryId, role: meta.role, tags: meta.tags, dur: meta.dur, size: file.size, mime: file.type || 'audio/mpeg', product: meta.product ?? null };
    return toAsset(check(await this.sb.from('assets').upsert(row).select().single()));
  }
  async updateAsset(hash: string, patch: Partial<Asset>) {
    const row: any = {};
    if (patch.name != null) row.name = patch.name;
    if (patch.categoryId != null) row.category_id = patch.categoryId;
    if (patch.role != null) row.role = patch.role;
    if (patch.tags != null) row.tags = patch.tags;
    if (patch.product !== undefined) row.product = patch.product ?? null;
    check(await this.sb.from('assets').update(row).eq('hash', hash));
  }
  async deleteAsset(hash: string) {
    check(await this.sb.from('assets').delete().eq('hash', hash)); // R2 bytes kept: old versions may use them
  }
  async getAudio(hash: string): Promise<Blob | null> {
    const hit = this.blobCache.get(hash);
    if (hit) return hit;
    const cache = 'caches' in self ? await caches.open('eddy-audio') : null;
    const url = `${this.audioBase}/${hash}`;
    let res = cache ? await cache.match(url) : undefined;
    if (!res) {
      res = await fetch(url, { headers: { Authorization: `Bearer ${await this.token()}` } });
      if (!res.ok) return null;
      if (cache) await cache.put(url, res.clone()); // content-addressed: safe to cache forever
    }
    const b = await res.blob();
    this.blobCache.set(hash, b);
    return b;
  }
  async putAudio(file: Blob): Promise<string> {
    const hash = await sha256(file);
    const url = `${this.audioBase}/${hash}`;
    const auth = { Authorization: `Bearer ${await this.token()}` };
    const head = await fetch(url, { method: 'HEAD', headers: auth });
    if (!head.ok) {
      const res = await fetch(url, { method: 'PUT', headers: { ...auth, 'Content-Type': file.type || 'application/octet-stream' }, body: file });
      if (!res.ok) throw new Error(`Upload failed (${res.status}): ${await res.text()}`);
    }
    this.blobCache.set(hash, file);
    return hash;
  }

  async listGuidelines(): Promise<Guideline[]> {
    return check(await this.sb.from('guidelines').select('*')).map((r: any) => ({ id: r.id, name: r.name, text: r.text, isDefault: r.is_default, updatedAt: r.updated_at }));
  }
  async saveGuideline(g: Guideline) {
    const u = await this.user();
    check(await this.sb.from('guidelines').upsert({ id: g.id, name: g.name, text: g.text, is_default: !!g.isDefault, updated_by: u?.email, updated_at: new Date().toISOString() }));
  }
}
