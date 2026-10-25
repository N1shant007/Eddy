import type { Asset, Category, Guideline, ProjectDoc } from '@eddy/rules';

export interface Folder {
  id: string;
  parentId: string | null;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectMeta {
  id: string;
  folderId: string | null;
  name: string;
  product: string;
  createdAt: string;
  updatedAt: string;
  updatedBy?: string | null;
  /** latest saved version number (0 = none yet) */
  headVersion: number;
  /** length of the edit in seconds, for the project list */
  duration?: number;
}

export interface Project extends ProjectMeta {
  /** autosaved working copy */
  draft: ProjectDoc;
}

export interface VersionMeta {
  id: string;
  projectId: string;
  versionNo: number;
  note: string;
  createdAt: string;
  createdBy?: string | null;
}

export interface Version extends VersionMeta {
  doc: ProjectDoc;
}

export interface UserInfo {
  id: string;
  email: string;
  name: string;
}

/**
 * One storage interface, two implementations:
 *  - LocalBackend: IndexedDB in this browser (works with no accounts; used before Supabase is set up)
 *  - SupabaseBackend: Postgres + Google sign-in, audio files on Cloudflare R2
 */
export interface Backend {
  readonly kind: 'local' | 'cloud';
  user(): Promise<UserInfo | null>;

  listFolders(): Promise<Folder[]>;
  createFolder(name: string, parentId: string | null): Promise<Folder>;
  renameFolder(id: string, name: string): Promise<void>;
  moveFolder(id: string, parentId: string | null): Promise<void>;
  /** deletes the folder, its sub-folders and every project inside */
  deleteFolder(id: string): Promise<void>;

  listProjects(): Promise<ProjectMeta[]>;
  createProject(name: string, folderId: string | null, doc: ProjectDoc): Promise<ProjectMeta>;
  getProject(id: string): Promise<Project | null>;
  renameProject(id: string, name: string): Promise<void>;
  moveProject(id: string, folderId: string | null): Promise<void>;
  deleteProject(id: string): Promise<void>;
  /** autosave the working copy (no new version) */
  saveDraft(id: string, doc: ProjectDoc, duration?: number): Promise<void>;

  saveVersion(projectId: string, doc: ProjectDoc, note: string): Promise<VersionMeta>;
  listVersions(projectId: string): Promise<VersionMeta[]>;
  getVersion(versionId: string): Promise<Version | null>;

  listCategories(): Promise<Category[]>;
  saveCategory(c: Category): Promise<void>;
  deleteCategory(id: string): Promise<void>;
  listAssets(): Promise<Asset[]>;
  /** stores the bytes once (by hash) and the asset record */
  putAsset(meta: Omit<Asset, 'hash' | 'size' | 'mime'>, file: Blob): Promise<Asset>;
  updateAsset(hash: string, patch: Partial<Asset>): Promise<void>;
  deleteAsset(hash: string): Promise<void>;
  /** audio bytes for decoding/playback */
  getAudio(hash: string): Promise<Blob | null>;
  /** stores bytes without a library record (e.g. an episode's main dialogue) */
  putAudio(file: Blob): Promise<string>;

  listGuidelines(): Promise<Guideline[]>;
  saveGuideline(g: Guideline): Promise<void>;
}
