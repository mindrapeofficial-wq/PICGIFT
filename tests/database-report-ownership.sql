-- Run with a database administrator connection on an isolated/testable backend.
-- Requires an unreported photo and two users who have photo jobs.
-- All fixture writes are rolled back. No IDs or personal information returned.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '30s';
do $$
declare fixture record; outsider uuid;
begin
  select j.id, j.user_id into fixture
  from public.picgift_photo_jobs j
  where not exists (select 1 from public.picgift_content_reports r where r.job_id = j.id)
  order by j.id limit 1;
  if fixture.id is null then raise exception 'An unreported photo is required'; end if;
  select user_id into outsider from public.picgift_photo_jobs
  where user_id <> fixture.user_id limit 1;
  if outsider is null then raise exception 'A second user is required'; end if;
  perform set_config('picgift.test_job', fixture.id::text, true);
  perform set_config('picgift.test_owner', fixture.user_id::text, true);
  perform set_config('picgift.test_outsider', outsider::text, true);
  perform set_config('request.jwt.claim.sub', fixture.user_id::text, true);
end $$;
set local role authenticated;
do $$
declare denied boolean := false; fixture uuid := current_setting('picgift.test_job')::uuid;
begin
  insert into public.picgift_content_reports(user_id, job_id, reason)
  values(auth.uid(), fixture, 'other');
  if (select count(*) from public.picgift_content_reports where job_id = fixture) <> 1
  then raise exception 'Owner cannot read their report'; end if;

  perform set_config('request.jwt.claim.sub', current_setting('picgift.test_outsider'), true);
  if (select count(*) from public.picgift_content_reports where job_id = fixture) <> 0
  then raise exception 'Another user can read the report'; end if;
  begin
    insert into public.picgift_content_reports(user_id, job_id, reason)
    values(auth.uid(), fixture, 'other');
  exception when insufficient_privilege then denied := true;
  end;
  if not denied then raise exception 'Another user can report the owner photo'; end if;

  denied := false;
  begin
    insert into public.picgift_content_reports(user_id, job_id, reason)
    values(current_setting('picgift.test_owner')::uuid, fixture, 'other');
  exception when insufficient_privilege then denied := true;
  end;
  if not denied then raise exception 'Another user can impersonate the owner'; end if;
end $$;
reset role;
select true as owner_insert_and_read, true as outsider_read_hidden,
       true as outsider_insert_denied, true as impersonation_denied;
rollback;
