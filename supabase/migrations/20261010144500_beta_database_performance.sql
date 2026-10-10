-- Additive optimization; preserves report ownership and existing roles.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '30s';

create index if not exists ai_outbox_proposal_beta_fk_idx
  on public.picgift_ai_notifications_outbox (proposal_id);
create index if not exists ai_proposals_reviewer_beta_fk_idx
  on public.picgift_ai_proposals (reviewed_by);
create index if not exists content_reports_job_beta_fk_idx
  on public.picgift_content_reports (job_id);
create index if not exists credit_ledger_job_beta_fk_idx
  on public.picgift_credit_ledger (job_id);
create index if not exists notification_campaigns_admin_beta_fk_idx
  on public.picgift_notification_campaigns (admin_id);
create index if not exists orders_product_beta_fk_idx
  on public.picgift_orders (product_id);
create index if not exists photo_jobs_scene_beta_fk_idx
  on public.picgift_photo_jobs (scene_id);

alter policy read_own_reports on public.picgift_content_reports
  using (user_id = (select auth.uid()));
alter policy report_own_portrait on public.picgift_content_reports
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.picgift_photo_jobs j
      where j.id = picgift_content_reports.job_id
        and j.user_id = (select auth.uid())
    )
  );
commit;
