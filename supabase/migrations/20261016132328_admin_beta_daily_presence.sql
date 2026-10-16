-- One server-observed entry time per account. A browser cannot set another user's presence.
create table if not exists public.picgift_user_presence (
  user_id uuid primary key references auth.users(id) on delete cascade,
  last_seen_at timestamptz not null default now()
);
create index if not exists picgift_user_presence_last_seen_idx on public.picgift_user_presence(last_seen_at);
alter table public.picgift_user_presence enable row level security;
revoke all on public.picgift_user_presence from anon, authenticated;
grant select, insert, update on public.picgift_user_presence to service_role;

-- Keep the AI's aggregate decision and the number of reminders actually queued.
create table if not exists public.picgift_beta_reminder_decisions (
  id uuid primary key default gen_random_uuid(),
  day_madrid date not null,
  checked_at timestamptz not null default now(),
  source text not null check (source in ('ai','admin')),
  decision text not null check (decision in ('send','skip')),
  reason text not null default '',
  eligible_count integer not null default 0 check (eligible_count >= 0),
  queued_count integer not null default 0 check (queued_count >= 0),
  admin_id uuid references auth.users(id) on delete set null
);
create index if not exists picgift_beta_reminder_decisions_recent_idx
  on public.picgift_beta_reminder_decisions(checked_at desc);
alter table public.picgift_beta_reminder_decisions enable row level security;
revoke all on public.picgift_beta_reminder_decisions from anon, authenticated;
grant select, insert on public.picgift_beta_reminder_decisions to service_role;

-- The old blanket daily push would duplicate the new, targeted beta reminder.
select cron.unschedule(jobid) from cron.job where jobname = 'picgift-daily-visit-reminder';

select cron.schedule('picgift-beta-activity-review', '0 */6 * * *', $cron$
 select net.http_post(
  url:='https://uimrvgrpenccijumyiek.supabase.co/functions/v1/picgift-ai-director',
  headers:=jsonb_build_object('Content-Type','application/json','x-picgift-cron',
   (select decrypted_secret from vault.decrypted_secrets where name='picgift_ai_director_cron' limit 1)),
  body:='{"action":"beta_reminder"}'::jsonb,
  timeout_milliseconds:=180000
 );
$cron$);
