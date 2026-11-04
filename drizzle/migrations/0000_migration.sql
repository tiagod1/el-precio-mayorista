create type public.app_role as enum ('admin','user');
create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  role app_role not null,
  unique (user_id, role)
);
grant select on public.user_roles to authenticated;
grant all on public.user_roles to service_role;
alter table public.user_roles enable row level security;

create or replace function public.has_role(_user_id uuid, _role app_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = _role)
$$;

create policy "own roles readable" on public.user_roles for select to authenticated using (user_id = auth.uid());

-- First registered user becomes admin
create or replace function public.handle_first_admin()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.user_roles where role = 'admin') then
    insert into public.user_roles(user_id, role) values (new.id, 'admin');
  end if;
  return new;
end $$;
create trigger on_auth_user_created_admin after insert on auth.users
for each row execute function public.handle_first_admin();

create table public.products (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique,
  nombre text not null,
  familia text,
  categoria text not null default 'SIN CATEGORIA',
  proveedor text,
  precio numeric(14,2) not null default 0,
  stock numeric(14,2) not null default 0,
  sin_stock_manual boolean not null default false,
  oculto boolean not null default false,
  foto_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index products_categoria_idx on public.products(categoria);
grant select on public.products to anon, authenticated;
grant insert, update, delete on public.products to authenticated;
grant all on public.products to service_role;
alter table public.products enable row level security;
create policy "public read visible" on public.products for select to anon, authenticated using (oculto = false or public.has_role(auth.uid(),'admin'));
create policy "admin insert" on public.products for insert to authenticated with check (public.has_role(auth.uid(),'admin'));
create policy "admin update" on public.products for update to authenticated using (public.has_role(auth.uid(),'admin'));
create policy "admin delete" on public.products for delete to authenticated using (public.has_role(auth.uid(),'admin'));

create table public.settings (
  id int primary key default 1 check (id = 1),
  whatsapp text,
  ocultar_sin_stock boolean not null default false,
  ultima_actualizacion timestamptz,
  ultimo_archivo text,
  familias_excluidas text[] not null default '{}',
  updated_at timestamptz not null default now()
);
insert into public.settings(id) values (1);
grant select on public.settings to anon, authenticated;
grant update on public.settings to authenticated;
grant all on public.settings to service_role;
alter table public.settings enable row level security;
create policy "public read settings" on public.settings for select to anon, authenticated using (true);
create policy "admin update settings" on public.settings for update to authenticated using (public.has_role(auth.uid(),'admin'));

create policy "admin upload photos" on storage.objects for insert to authenticated with check (bucket_id = 'product-photos' and public.has_role(auth.uid(),'admin'));
create policy "admin update photos" on storage.objects for update to authenticated using (bucket_id = 'product-photos' and public.has_role(auth.uid(),'admin'));
create policy "admin delete photos" on storage.objects for delete to authenticated using (bucket_id = 'product-photos' and public.has_role(auth.uid(),'admin'));
create policy "public read photos" on storage.objects for select using (bucket_id = 'product-photos');