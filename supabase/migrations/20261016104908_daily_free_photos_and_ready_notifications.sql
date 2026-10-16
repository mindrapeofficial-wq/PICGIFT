-- Five completed/in-progress free portraits per verified account and UTC day.
update public.picgift_flux_beta_config
set per_tester_daily_limit = 5, updated_at = now()
where singleton = true;

create or replace function public.picgift_claim_flux_free_photo(p_user uuid, p_job uuid, p_format text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_day date := (now() at time zone 'UTC')::date;
  v_limit integer;
  v_used integer;
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
  insert into public.picgift_flux_free_usage(user_id, job_id, day_utc, estimated_neurons)
  values(p_user, p_job, v_day, v_neurons);
  return jsonb_build_object('accepted', true, 'remaining_user_today', v_limit-v_used-1);
end;
$$;
revoke all on function public.picgift_claim_flux_free_photo(uuid,uuid,text) from public, anon, authenticated;
grant execute on function public.picgift_claim_flux_free_photo(uuid,uuid,text) to service_role;

-- Free Premium uses its own daily slot; credit-backed Premium keeps its existing limit.
alter table public.picgift_premium_usage add column if not exists is_free boolean not null default false;
update public.picgift_premium_usage u set is_free = true
from public.picgift_photo_jobs j where j.id = u.job_id and j.is_test = true;
create index if not exists picgift_premium_usage_free_day_idx
 on public.picgift_premium_usage(user_id,day_utc) where is_free = true;

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

create or replace function public.picgift_claim_premium_photo(p_user uuid, p_job uuid)
returns jsonb language plpgsql set search_path = public, pg_temp as $$
declare
 v_day date := (now() at time zone 'UTC')::date;
 v_limit integer;
 v_used integer;
begin
 if current_user <> 'postgres' and coalesce(auth.role(),'') <> 'service_role' then raise exception 'not_authorized'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,71904715));
 if not exists(select 1 from public.picgift_photo_jobs where id=p_job and user_id=p_user and status='queued' and is_test=false and image_model <> 'cloudflare-flux-2-klein-4b') then raise exception 'invalid_premium_job'; end if;
 if exists(select 1 from public.picgift_premium_usage where job_id=p_job and user_id=p_user and is_free=false) then return jsonb_build_object('accepted',true,'already_reserved',true); end if;
 select coalesce(u.daily_limit,s.daily_limit) into v_limit from public.picgift_premium_settings s left join public.picgift_premium_user_limits u on u.user_id=p_user where s.singleton=true;
 if v_limit is null then raise exception 'premium_settings_missing'; end if;
 select count(*) into v_used from public.picgift_premium_usage where user_id=p_user and day_utc=v_day and is_free=false;
 if v_used>=v_limit then return jsonb_build_object('accepted',false,'daily_limit',v_limit,'remaining',0); end if;
 insert into public.picgift_premium_usage(job_id,user_id,day_utc,is_free) values(p_job,p_user,v_day,false);
 return jsonb_build_object('accepted',true,'daily_limit',v_limit,'remaining',v_limit-v_used-1);
end;
$$;
revoke all on function public.picgift_claim_premium_photo(uuid,uuid) from public, anon, authenticated;
grant execute on function public.picgift_claim_premium_photo(uuid,uuid) to service_role;

-- A transition to a downloadable portrait queues one notification for that job.
alter table public.picgift_ai_notifications_outbox add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table public.picgift_ai_notifications_outbox drop constraint if exists picgift_ai_notifications_outbox_target_check;
alter table public.picgift_ai_notifications_outbox add constraint picgift_ai_notifications_outbox_target_check
 check (target in ('admin','all','user') and (target <> 'user' or user_id is not null));
alter table public.picgift_ai_notifications_outbox drop constraint if exists picgift_ai_notifications_outbox_route_check;
alter table public.picgift_ai_notifications_outbox add constraint picgift_ai_notifications_outbox_route_check
 check (route in ('crear','inspiracion','cuenta','precios','mis-fotos'));

create or replace function public.picgift_queue_ready_photo_notification()
returns trigger language plpgsql security invoker set search_path = public, pg_temp as $$
begin
  if new.status = 'completed' and old.status is distinct from 'completed' and new.result_path is not null then
    insert into public.picgift_ai_notifications_outbox(id,target,user_id,title,body,route)
    values(new.id,'user',new.user_id,'Tu foto PicGift está lista',
      'Tu retrato está terminado. Ábrelo en Mis fotos para verlo y descargarlo.','mis-fotos')
    on conflict(id) do nothing;
  end if;
  return new;
end;
$$;
drop trigger if exists picgift_photo_ready_notification on public.picgift_photo_jobs;
create trigger picgift_photo_ready_notification after update of status on public.picgift_photo_jobs
 for each row execute function public.picgift_queue_ready_photo_notification();
revoke all on function public.picgift_queue_ready_photo_notification() from public, anon, authenticated;

select cron.alter_job(jobid, schedule := '* * * * *')
from cron.job where jobname = 'picgift-ai-outbox-dispatch';
