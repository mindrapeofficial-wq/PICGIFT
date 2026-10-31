-- Restore the October 25 daily Premium offer for the existing code-21 bundle.
-- The first launch after 2026-10-30 used a single-trial cutover; keep the
-- historical ledger and return to a per-UTC-day quota without deleting uses.
create or replace function public.picgift_claim_premium_free_photo(p_user uuid, p_job uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_day date := (now() at time zone 'UTC')::date;
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
  select count(*) into v_used from public.picgift_premium_usage
   where user_id = p_user and day_utc = v_day and is_free = true;
  if v_used >= 1 then return jsonb_build_object('accepted', false, 'remaining', 0); end if;
  insert into public.picgift_premium_usage(job_id,user_id,day_utc,is_free)
  values(p_job,p_user,v_day,true);
  return jsonb_build_object('accepted', true, 'remaining', 0);
end;
$$;
revoke all on function public.picgift_claim_premium_free_photo(uuid,uuid) from public, anon, authenticated;
grant execute on function public.picgift_claim_premium_free_photo(uuid,uuid) to service_role;

-- Protect the public Halloween offer from unbounded use: at most 20 active
-- free FLUX reservations per UTC day across all accounts. Use one global
-- transaction advisory lock so concurrent accounts cannot exceed the cap.
create or replace function public.picgift_claim_flux_free_photo(p_user uuid, p_job uuid, p_format text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_day date := (now() at time zone 'UTC')::date;
  v_limit integer;
  v_used integer;
  v_global_used integer;
  v_neurons numeric(12,2);
  v_old public.picgift_flux_free_usage%rowtype;
begin
  if current_user <> 'postgres' and coalesce(auth.role(),'') <> 'service_role' then
    raise exception 'not_authorized';
  end if;
  if not exists(select 1 from auth.users where id = p_user and email_confirmed_at is not null) then
    raise exception 'verified_account_required';
  end if;
  select per_tester_daily_limit into v_limit from public.picgift_flux_beta_config
   where singleton = true and enabled = true;
  if v_limit is null then raise exception 'free_generation_not_enabled'; end if;
  if not exists(select 1 from public.picgift_photo_jobs
     where id = p_job and user_id = p_user and status = 'queued'
       and is_test = true and image_model = 'cloudflare-flux-2-klein-4b') then
    raise exception 'invalid_free_job';
  end if;
  v_neurons := case p_format when 'square' then 114.94
    when 'vertical' then 167.04 when 'horizontal' then 167.04 else null end;
  if v_neurons is null then raise exception 'invalid_image_format'; end if;
  perform pg_advisory_xact_lock(7190471420261031);
  perform pg_advisory_xact_lock(hashtextextended(p_user::text, 71904714));
  select * into v_old from public.picgift_flux_free_usage where job_id = p_job;
  if found then
    if v_old.user_id <> p_user then raise exception 'job_owner_mismatch'; end if;
    return jsonb_build_object('accepted', true, 'already_reserved', true);
  end if;
  select count(*) into v_used from public.picgift_flux_free_usage
   where user_id = p_user and day_utc = v_day and status <> 'failed';
  if v_used >= v_limit then
    return jsonb_build_object('accepted', false, 'remaining_user_today', 0);
  end if;
  select count(*) into v_global_used from public.picgift_flux_free_usage
   where day_utc = v_day and status <> 'failed';
  if v_global_used >= 20 then
    return jsonb_build_object('accepted', false, 'remaining_global_today', 0);
  end if;
  insert into public.picgift_flux_free_usage(user_id, job_id, day_utc, estimated_neurons)
  values(p_user, p_job, v_day, v_neurons);
  return jsonb_build_object('accepted', true, 'remaining_user_today', v_limit-v_used-1,
    'remaining_global_today', 20-v_global_used-1);
end;
$$;
revoke all on function public.picgift_claim_flux_free_photo(uuid,uuid,text) from public, anon, authenticated;
grant execute on function public.picgift_claim_flux_free_photo(uuid,uuid,text) to service_role;
