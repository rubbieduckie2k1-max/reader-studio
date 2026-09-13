-- Reader Studio Cloud Sync
-- Chạy toàn bộ file này một lần trong Supabase > SQL Editor.

create table if not exists public.reader_records (
  user_id uuid not null references auth.users(id) on delete cascade,
  store text not null check (store in ('books', 'annotations', 'bookmarks', 'notebooks')),
  item_id text not null,
  book_id text,
  data jsonb,
  file_path text,
  updated_at bigint not null,
  deleted boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (user_id, store, item_id)
);

create index if not exists reader_records_user_book_idx
  on public.reader_records (user_id, book_id);

alter table public.reader_records enable row level security;

drop policy if exists "reader_records_owner_all" on public.reader_records;
create policy "reader_records_owner_all"
  on public.reader_records
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

grant select, insert, update, delete on public.reader_records to authenticated;

insert into storage.buckets (id, name, public, allowed_mime_types)
values (
  'reader-books',
  'reader-books',
  false,
  array['application/pdf', 'application/epub+zip']
)
on conflict (id) do update set
  public = false,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "reader_books_owner_select" on storage.objects;
create policy "reader_books_owner_select"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'reader-books'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "reader_books_owner_insert" on storage.objects;
create policy "reader_books_owner_insert"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'reader-books'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "reader_books_owner_update" on storage.objects;
create policy "reader_books_owner_update"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'reader-books'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'reader-books'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "reader_books_owner_delete" on storage.objects;
create policy "reader_books_owner_delete"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'reader-books'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
