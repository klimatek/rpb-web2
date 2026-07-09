-- Soft delete for saved history rows.
alter table public.rpb_saved_summaries
add column if not exists is_deleted boolean not null default false;

create index if not exists idx_rpb_saved_summaries_user_deleted_updated_at
on public.rpb_saved_summaries (user_id, is_deleted, updated_at desc);

drop policy if exists "rpb_saved_summaries_update_own" on public.rpb_saved_summaries;
create policy "rpb_saved_summaries_update_own"
on public.rpb_saved_summaries for update
to authenticated
using (user_id = auth.uid() or public.is_admin())
with check (user_id = auth.uid() or public.is_admin());
