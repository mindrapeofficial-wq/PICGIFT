-- One fresh Premium trial for every verified account after this launch cutover.
-- Earlier tester activity remains in the usage ledger but does not consume the launch trial.
alter table public.picgift_premium_settings
  add column if not exists trial_started_at timestamptz not null default now();

create or replace function public.picgift_claim_premium_free_photo(p_user uuid, p_job uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_cutover timestamptz;
  v_used integer;
begin
  if current_user <> 'postgres' and coalesce(auth.role(),'') <> 'service_role' then
    raise exception 'not_authorized';
  end if;
  if not exists(select 1 from auth.users where id = p_user and email_confirmed_at is not null) then
    raise exception 'verified_account_required';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_user::text, 71904715));
  if not exists(select 1 from public.picgift_photo_jobs
     where id = p_job and user_id = p_user and status = 'queued'
       and is_test = true and image_model <> 'cloudflare-flux-2-klein-4b') then
    raise exception 'invalid_free_premium_job';
  end if;
  if exists(select 1 from public.picgift_premium_usage where job_id = p_job and user_id = p_user and is_free = true) then
    return jsonb_build_object('accepted', true, 'already_reserved', true);
  end if;
  select trial_started_at into v_cutover from public.picgift_premium_settings where singleton = true;
  if v_cutover is null then raise exception 'premium_trial_settings_missing'; end if;
  select count(*) into v_used from public.picgift_premium_usage
   where user_id = p_user and created_at >= v_cutover and is_free = true;
  if v_used >= 1 then return jsonb_build_object('accepted', false, 'remaining', 0); end if;
  insert into public.picgift_premium_usage(job_id,user_id,day_utc,is_free)
  values(p_job,p_user,(now() at time zone 'UTC')::date,true);
  return jsonb_build_object('accepted', true, 'remaining', 0);
end;
$$;
revoke all on function public.picgift_claim_premium_free_photo(uuid,uuid) from public, anon, authenticated;
grant execute on function public.picgift_claim_premium_free_photo(uuid,uuid) to service_role;
