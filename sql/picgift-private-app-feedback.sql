-- Already applied to project uimrvgrpenccijumyiek on 2026-10-24 through
-- migration picgift_private_app_feedback. Do not reapply to that project.
-- No photos, tokens or automatic device diagnostics are collected here.
create table public.picgift_app_feedback (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 category text not null check (category in ('bug','suggestion','login','performance')),
 message text not null check (char_length(btrim(message)) between 10 and 2000),
 locale text not null default 'es' check (locale in ('es','en')),
 created_at timestamptz not null default now()
);
create index picgift_app_feedback_owner_created on public.picgift_app_feedback(user_id,created_at desc);
alter table public.picgift_app_feedback enable row level security;
revoke all on public.picgift_app_feedback from public,anon,authenticated;
grant select on public.picgift_app_feedback to authenticated,service_role;
grant insert(category,message,locale) on public.picgift_app_feedback to authenticated;
create policy picgift_feedback_read_own on public.picgift_app_feedback for select to authenticated using ((select auth.uid())=user_id);
create policy picgift_feedback_insert_own on public.picgift_app_feedback for insert to authenticated with check ((select auth.uid())=user_id and coalesce(((select auth.jwt())->>'is_anonymous')::boolean,false)=false);
create function public.picgift_limit_app_feedback() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'feedback_auth_required' using errcode='42501'; end if;
 new.user_id := auth.uid();
 new.created_at := now();
 new.message := btrim(new.message);
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(new.user_id::text,20261024));
 if (select count(*) from public.picgift_app_feedback where user_id=new.user_id and created_at>now()-interval '10 minutes')>=3
 or (select count(*) from public.picgift_app_feedback where user_id=new.user_id and created_at>now()-interval '1 day')>=10 then
  raise exception 'feedback_rate_limit' using errcode='P0001';
 end if;
 return new;
end;
$$;
revoke all on function public.picgift_limit_app_feedback() from public,anon,authenticated;
create trigger picgift_feedback_limit before insert on public.picgift_app_feedback for each row execute function public.picgift_limit_app_feedback();
comment on table public.picgift_app_feedback is 'Private in-app bug reports and suggestions. No photos, tokens or automatic diagnostics. Owner-only access; deletion cascades with the account.';
