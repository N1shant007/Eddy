-- Eddy v2 schema: folders, projects, version history, team audio library, guidelines.
-- Run in Supabase: SQL Editor -> paste -> Run (or `supabase db push`).

create extension if not exists pgcrypto;

-- Who is on the team: any signed-in user whose email is listed, or whose domain is allowed.
create table if not exists team_domains (domain text primary key);
create table if not exists team_members (
  email text primary key,
  role text not null default 'editor' check (role in ('admin','editor','viewer'))
);

create or replace function is_team() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from team_members m where lower(m.email) = lower(auth.jwt() ->> 'email'))
      or exists (select 1 from team_domains d where lower(split_part(auth.jwt() ->> 'email', '@', 2)) = lower(d.domain));
$$;

create or replace function can_edit() returns boolean
language sql stable security definer set search_path = public as $$
  select is_team() and not exists (
    select 1 from team_members m where lower(m.email) = lower(auth.jwt() ->> 'email') and m.role = 'viewer');
$$;

-- Folders (nested)
create table if not exists folders (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid references folders(id) on delete cascade,
  name text not null,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists folders_parent on folders(parent_id);

-- Projects: metadata + the autosaved working copy (draft)
create table if not exists projects (
  id uuid primary key default gen_random_uuid(),
  folder_id uuid references folders(id) on delete cascade,
  name text not null,
  product text not null default '',
  draft jsonb not null,
  duration real,
  head_version int not null default 0,
  created_by uuid default auth.uid(),
  updated_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists projects_folder on projects(folder_id);

-- Version history: an immutable snapshot of the whole edit per saved version
create table if not exists project_versions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  version_no int not null,
  note text not null default '',
  doc jsonb not null,
  created_by text,
  created_at timestamptz not null default now(),
  unique (project_id, version_no)
);
create index if not exists versions_project on project_versions(project_id, version_no desc);

-- Saves a new version atomically (numbers never clash, even with two people saving at once)
create or replace function save_version(p_project uuid, p_doc jsonb, p_note text)
returns project_versions language plpgsql security invoker as $$
declare n int; v project_versions;
begin
  update projects set head_version = head_version + 1, draft = p_doc, updated_at = now(),
         updated_by = auth.jwt() ->> 'email'
   where id = p_project returning head_version into n;
  if n is null then raise exception 'project not found'; end if;
  insert into project_versions(project_id, version_no, note, doc, created_by)
  values (p_project, n, coalesce(nullif(p_note, ''), 'Version ' || n), p_doc, auth.jwt() ->> 'email')
  returning * into v;
  return v;
end $$;

-- Team audio library (bytes live in Cloudflare R2 under audio/<sha256>)
create table if not exists categories (
  id text primary key,
  name text not null,
  role text not null,
  sort int not null default 0
);
create table if not exists assets (
  hash text primary key,
  name text not null,
  category_id text references categories(id) on delete set null,
  role text not null,
  tags text[] not null default '{}',
  dur real not null default 0,
  size bigint not null default 0,
  mime text not null default 'audio/mpeg',
  product text,
  created_by text default (auth.jwt() ->> 'email'),
  created_at timestamptz not null default now()
);
create table if not exists guidelines (
  id text primary key,
  name text not null,
  text text not null,
  is_default boolean not null default false,
  updated_by text,
  updated_at timestamptz not null default now()
);

-- Row level security: team members read everything; editors write.
alter table folders enable row level security;
alter table projects enable row level security;
alter table project_versions enable row level security;
alter table categories enable row level security;
alter table assets enable row level security;
alter table guidelines enable row level security;
alter table team_members enable row level security;
alter table team_domains enable row level security;

do $$ declare t text; begin
  foreach t in array array['folders','projects','categories','assets','guidelines'] loop
    execute format('drop policy if exists team_read on %I', t);
    execute format('create policy team_read on %I for select using (is_team())', t);
    execute format('drop policy if exists team_write on %I', t);
    execute format('create policy team_write on %I for all using (can_edit()) with check (can_edit())', t);
  end loop;
end $$;

-- versions are append-only: read + insert, never update
drop policy if exists v_read on project_versions;
create policy v_read on project_versions for select using (is_team());
drop policy if exists v_insert on project_versions;
create policy v_insert on project_versions for insert with check (can_edit());
drop policy if exists v_delete on project_versions;
create policy v_delete on project_versions for delete using (can_edit());

drop policy if exists tm_read on team_members;
create policy tm_read on team_members for select using (is_team());
drop policy if exists td_read on team_domains;
create policy td_read on team_domains for select using (is_team());

-- First setup (edit and run once):
-- insert into team_members(email, role) values ('nishanthipparagi25@gmail.com', 'admin');
-- insert into team_domains(domain) values ('your-company-domain.com');
