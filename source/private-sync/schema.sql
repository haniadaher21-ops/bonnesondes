-- Run in a new Supabase project after creating/inviting the owner's Auth user.
create extension if not exists pgcrypto with schema extensions;
create schema if not exists bonnes_ondes_private;
revoke all on schema bonnes_ondes_private from public, anon, authenticated;

create table if not exists bonnes_ondes_private.owners (
  user_id uuid primary key references auth.users(id) on delete cascade
);
create table if not exists bonnes_ondes_private.profile (
  user_id uuid primary key references auth.users(id) on delete cascade,
  revision bigint not null default 0,
  document jsonb not null,
  updated_at timestamptz not null default now()
);
create table if not exists bonnes_ondes_private.runner (
  user_id uuid primary key references auth.users(id) on delete cascade,
  token_hash bytea not null unique,
  state jsonb not null default '{"version":1,"candidates":[],"history":[],"dryRuns":[]}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table bonnes_ondes_private.owners enable row level security;
alter table bonnes_ondes_private.profile enable row level security;
alter table bonnes_ondes_private.runner enable row level security;
revoke all on all tables in schema bonnes_ondes_private from public, anon, authenticated;

create or replace function public.bo_profile_read()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare p bonnes_ondes_private.profile%rowtype;
begin
  if not exists (select 1 from bonnes_ondes_private.owners where user_id = auth.uid())
    then raise exception 'Access denied'; end if;
  select * into p from bonnes_ondes_private.profile where user_id = auth.uid();
  return jsonb_build_object('revision', coalesce(p.revision,0), 'document',p.document,'updatedAt',p.updated_at);
end $$;

create or replace function public.bo_profile_save(document jsonb, expected_revision bigint)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare next_revision bigint;
begin
  if not exists (select 1 from bonnes_ondes_private.owners where user_id = auth.uid())
    then raise exception 'Access denied'; end if;
  if document->>'version' is distinct from '1' or octet_length(document::text) > 524288
    then raise exception 'Invalid document'; end if;
  -- Lock the owner row even for first creation, so revisions cannot race.
  perform 1 from bonnes_ondes_private.owners where user_id = auth.uid() for update;
  if coalesce((select revision from bonnes_ondes_private.profile where user_id=auth.uid()),0) <> expected_revision
    then raise exception 'Revision conflict'; end if;
  insert into bonnes_ondes_private.profile(user_id,document,revision) values(auth.uid(),document,1)
    on conflict(user_id) do update set document=excluded.document,
      revision=bonnes_ondes_private.profile.revision+1, updated_at=now()
    returning revision into next_revision;
  return jsonb_build_object('revision',next_revision);
end $$;

create or replace function public.bo_profile_delete()
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from bonnes_ondes_private.owners where user_id = auth.uid())
    then raise exception 'Access denied'; end if;
  perform 1 from bonnes_ondes_private.owners where user_id=auth.uid() for update;
  delete from bonnes_ondes_private.profile where user_id=auth.uid();
  delete from bonnes_ondes_private.runner where user_id=auth.uid();
end $$;

create or replace function public.bo_runner_read()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare identity uuid;
  token text := coalesce(current_setting('request.headers',true)::jsonb->>'x-bo-runner','');
begin
  if length(token) < 40 then raise exception 'Access denied'; end if;
  select r.user_id into identity from bonnes_ondes_private.runner r
    join bonnes_ondes_private.owners o on o.user_id=r.user_id
    where r.token_hash=extensions.digest(token,'sha256');
  if identity is null then raise exception 'Access denied'; end if;
  return jsonb_build_object(
    'profile',(select document from bonnes_ondes_private.profile where user_id=identity),
    'profileUpdatedAt',(select updated_at from bonnes_ondes_private.profile where user_id=identity),
    'revision',(select revision from bonnes_ondes_private.profile where user_id=identity),
    'state',(select state from bonnes_ondes_private.runner where user_id=identity));
end $$;

create or replace function public.bo_runner_state_save(document jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare identity uuid;
  token text := coalesce(current_setting('request.headers',true)::jsonb->>'x-bo-runner','');
begin
  if length(token) < 40 or document->>'version' is distinct from '1'
    or octet_length(document::text) > 5000000 then raise exception 'Access denied'; end if;
  select r.user_id into identity from bonnes_ondes_private.runner r
    join bonnes_ondes_private.owners o on o.user_id=r.user_id
    where r.token_hash=extensions.digest(token,'sha256') for update of r;
  if identity is null then raise exception 'Access denied'; end if;
  update bonnes_ondes_private.runner set state=document,updated_at=now() where user_id=identity;
end $$;

revoke all on function public.bo_profile_read(),public.bo_profile_save(jsonb,bigint),public.bo_profile_delete() from public,anon;
grant execute on function public.bo_profile_read(),public.bo_profile_save(jsonb,bigint),public.bo_profile_delete() to authenticated;
revoke all on function public.bo_runner_read(),public.bo_runner_state_save(jsonb) from public;
grant execute on function public.bo_runner_read(),public.bo_runner_state_save(jsonb) to anon;
