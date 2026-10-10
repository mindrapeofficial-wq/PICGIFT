-- One daily reminder, at 20:00 Europe/Madrid, using the existing private FCM outbox.
create or replace function public.picgift_enqueue_daily_reminder(at_time timestamptz default now())
returns boolean language plpgsql security invoker set search_path = public, pg_temp as $$
declare
 local_time timestamp := at_time at time zone 'Europe/Madrid';
 campaign_id uuid := md5('picgift-daily-visit:' || (at_time at time zone 'Europe/Madrid')::date::text)::uuid;
 message text;
 added integer;
begin
 if extract(hour from local_time) <> 20 or extract(minute from local_time) <> 0 then return false; end if;
 message := (array[
 'Un rato para imaginar: explora los escenarios de Halloween y guarda una idea para tu próximo retrato.',
 'Tu próxima foto empieza con una idea. Entra en PicGift y encuentra un escenario que vaya contigo.',
 'Dale un toque de fantasía a tus recuerdos. Descubre la colección de Halloween en PicGift.',
 '¿Bosque de calabazas o castillo encantado? Encuentra inspiración para tu próxima foto.',
 'Hoy puede ser un buen día para preparar tu próximo retrato. Abre PicGift y explora la colección.',
 'Haz una pausa creativa: descubre escenarios y estilos para convertir tu foto en un recuerdo especial.',
 'Tu momento creativo te espera. Encuentra una idea para tu próxima foto en PicGift.'
 ])[extract(dow from local_time)::integer + 1];
 insert into public.picgift_ai_notifications_outbox(id,target,title,body,route)
 values(campaign_id,'all','Tu momento creativo · PicGift',message,'inspiracion')
 on conflict(id) do nothing;
 get diagnostics added = row_count;
 return added > 0;
end;
$$;
revoke all on function public.picgift_enqueue_daily_reminder(timestamptz) from public, anon, authenticated;
grant execute on function public.picgift_enqueue_daily_reminder(timestamptz) to service_role;
select cron.schedule('picgift-daily-visit-reminder','0 18,19 * * *',
 $job$select public.picgift_enqueue_daily_reminder();$job$);
