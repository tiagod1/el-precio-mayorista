do $$
begin
  create type public.order_status as enum ('pending', 'confirmed', 'cancelled');
exception
  when duplicate_object then null;
end $$;

create table if not exists public.promotions (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null unique references public.products(id) on delete cascade,
  tipo text not null check (tipo in ('precio_fijo', 'porcentaje')),
  valor numeric(12,2) not null check (valor >= 0),
  starts_at timestamptz,
  ends_at timestamptz,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (tipo <> 'porcentaje' or valor <= 100),
  check (starts_at is null or ends_at is null or ends_at > starts_at)
);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  customer_name text not null,
  customer_phone text not null check (customer_phone ~ '^\d{8,15}$'),
  customer_number text,
  delivery_address text,
  status public.order_status not null default 'pending',
  total numeric(14,2) not null default 0 check (total >= 0),
  notes text,
  access_token text,
  created_at timestamptz not null default now(),
  confirmed_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.orders add column if not exists access_token text;
alter table public.orders add column if not exists customer_number text;
alter table public.orders add column if not exists delivery_address text;

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  promotion_id uuid references public.promotions(id) on delete set null,
  codigo text not null,
  nombre text not null,
  precio_base numeric(14,2) not null check (precio_base >= 0),
  precio_unitario numeric(14,2) not null check (precio_unitario > 0),
  qty integer not null check (qty > 0 and qty <= 9999),
  line_total numeric(14,2) not null check (line_total >= 0),
  created_at timestamptz not null default now()
);

create index if not exists promotions_active_idx on public.promotions (active, starts_at, ends_at);
create index if not exists orders_status_created_idx on public.orders (status, created_at desc);
create index if not exists orders_phone_idx on public.orders (customer_phone);
create index if not exists orders_access_idx on public.orders (customer_phone, access_token);
create index if not exists order_items_order_idx on public.order_items (order_id);
create index if not exists order_items_product_idx on public.order_items (product_id);

alter table public.promotions enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;

drop policy if exists promotions_public_read on public.promotions;
create policy promotions_public_read on public.promotions
  for select to anon, authenticated
  using (
    active
    and (starts_at is null or starts_at <= now())
    and (ends_at is null or ends_at >= now())
  );

drop policy if exists promotions_admin_all on public.promotions;
create policy promotions_admin_all on public.promotions
  for all to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));

drop policy if exists orders_admin_all on public.orders;
create policy orders_admin_all on public.orders
  for all to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));

drop policy if exists order_items_admin_all on public.order_items;
create policy order_items_admin_all on public.order_items
  for all to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));

grant select on public.promotions to anon;
grant select, insert, update, delete on public.promotions to authenticated;

revoke all on public.orders from public, anon, authenticated;
revoke all on public.order_items from public, anon, authenticated;
grant select on public.orders to authenticated;
grant select on public.order_items to authenticated;

drop function if exists public.create_customer_order(text, text, jsonb, text);

create or replace function public.create_customer_order(
  p_name text,
  p_phone text,
  p_items jsonb,
  p_token text,
  p_customer_number text,
  p_delivery_address text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text := trim(coalesce(p_name, ''));
  v_phone text := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
  v_token_in text := trim(coalesce(p_token, ''));
  v_token text;
  v_order_id uuid;
  v_total numeric(14,2) := 0;
  v_item jsonb;
  v_product_id uuid;
  v_promotion_id uuid;
  v_codigo text;
  v_nombre text;
  v_qty integer;
  v_base numeric(14,2);
  v_unit numeric(14,2);
  v_catalog_price numeric(14,2);
  v_stock numeric;
  v_oculto boolean;
  v_manual boolean;
  v_reserved numeric;
  v_prev integer;
  v_qty_map jsonb := '{}'::jsonb;
  v_promo_tipo text;
  v_promo_valor numeric;
  v_expected numeric(14,2);
  v_customer_number text := nullif(left(trim(coalesce(p_customer_number, '')), 60), '');
  v_delivery_address text := nullif(left(trim(coalesce(p_delivery_address, '')), 200), '');
begin
  if char_length(v_name) < 2 or char_length(v_name) > 120 then
    raise exception 'Nombre inválido';
  end if;
  if char_length(trim(coalesce(p_customer_number, ''))) > 60
     or char_length(trim(coalesce(p_delivery_address, ''))) > 200 then
    raise exception 'Datos de entrega inválidos';
  end if;
  if v_phone !~ '^\d{8,15}$' then
    raise exception 'WhatsApp inválido';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 or jsonb_array_length(p_items) > 100 then
    raise exception 'Pedido inválido';
  end if;

  if char_length(v_token_in) >= 16 and exists (
    select 1 from public.orders o
    where o.customer_phone = v_phone
      and lower(trim(o.customer_name)) = lower(v_name)
      and o.access_token = v_token_in
  ) then
    v_token := v_token_in;
  else
    v_token := replace(gen_random_uuid()::text, '-', '');
  end if;

  insert into public.orders (customer_name, customer_phone, customer_number, delivery_address, status, total, access_token)
  values (v_name, v_phone, v_customer_number, v_delivery_address, 'pending', 0, v_token)
  returning id into v_order_id;

  for v_item in
    select * from jsonb_array_elements(p_items)
    order by value->>'product_id'
  loop
    begin
      v_product_id := nullif(v_item->>'product_id', '')::uuid;
      v_promotion_id := nullif(v_item->>'promotion_id', '')::uuid;
    exception when others then
      raise exception 'Producto inválido';
    end;

    v_qty := coalesce((v_item->>'qty')::integer, 0);
    v_base := coalesce((v_item->>'precio_base')::numeric, 0);
    v_unit := coalesce((v_item->>'precio_unitario')::numeric, 0);

    if v_product_id is null then
      raise exception 'Item inválido';
    end if;
    if v_qty < 1 or v_qty > 9999 or v_base < 0 or v_unit <= 0 then
      raise exception 'Cantidad o precio inválido';
    end if;

    select coalesce(p.stock, 0), p.precio, p.oculto, p.sin_stock_manual,
           p.codigo, p.nombre
    into v_stock, v_catalog_price, v_oculto, v_manual, v_codigo, v_nombre
    from public.products p
    where p.id = v_product_id
    for update;

    if not found then
      raise exception 'Producto no encontrado';
    end if;
    if v_oculto or v_manual then
      raise exception 'Producto no disponible: %', v_codigo;
    end if;

    select coalesce(sum(i.qty), 0) into v_reserved
    from public.order_items i
    join public.orders o on o.id = i.order_id
    where i.product_id = v_product_id
      and o.status = 'pending'
      and o.id <> v_order_id;

    v_prev := coalesce((v_qty_map ->> v_product_id::text)::integer, 0);
    if v_qty + v_prev + v_reserved > v_stock then
      raise exception 'Stock insuficiente para %', v_codigo;
    end if;
    v_qty_map := jsonb_set(v_qty_map, array[v_product_id::text], to_jsonb(v_prev + v_qty));

    v_expected := v_catalog_price;
    if v_promotion_id is not null then
      select pr.tipo, pr.valor into v_promo_tipo, v_promo_valor
      from public.promotions pr
      where pr.id = v_promotion_id
        and pr.product_id = v_product_id
        and pr.active
        and (pr.starts_at is null or pr.starts_at <= now())
        and (pr.ends_at is null or pr.ends_at >= now());

      if not found then
        raise exception 'Promoción inválida o no vigente';
      end if;
      if v_promo_tipo = 'porcentaje' then
        v_expected := round(v_catalog_price * (1 - v_promo_valor / 100), 2);
      else
        v_expected := least(v_promo_valor, v_catalog_price);
      end if;
    end if;

    if v_expected <= 0 then
      raise exception 'Promoción inválida';
    end if;
    if abs(v_unit - v_expected) > 0.01 then
      raise exception 'Precio inválido para %', v_codigo;
    end if;

    insert into public.order_items (
      order_id, product_id, promotion_id, codigo, nombre,
      precio_base, precio_unitario, qty, line_total
    ) values (
      v_order_id, v_product_id, v_promotion_id, v_codigo, v_nombre,
      v_catalog_price, v_unit, v_qty, v_qty * v_unit
    );

    v_total := v_total + (v_qty * v_unit);
  end loop;

  update public.orders set total = v_total, updated_at = now() where id = v_order_id;
  return jsonb_build_object('order_id', v_order_id, 'access_token', v_token);
end;
$$;

create or replace function public.get_customer_order_history(p_phone text, p_name text, p_token text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_phone text := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
  v_name text := lower(trim(coalesce(p_name, '')));
  v_token text := trim(coalesce(p_token, ''));
  v_result jsonb;
begin
  if v_phone !~ '^\d{8,15}$' or char_length(v_name) < 2 or char_length(v_token) < 16 then
    return '[]'::jsonb;
  end if;

  select coalesce(jsonb_agg(t.payload), '[]'::jsonb) into v_result
  from (
    select jsonb_build_object(
      'id', o.id,
      'created_at', o.created_at,
      'total', o.total,
      'items', coalesce((
        select jsonb_agg(jsonb_build_object(
          'product_id', i.product_id,
          'codigo', i.codigo,
          'nombre', i.nombre,
          'qty', i.qty,
          'precio_unitario', i.precio_unitario
        ) order by i.created_at)
        from public.order_items i
        where i.order_id = o.id
      ), '[]'::jsonb)
    ) as payload
    from public.orders o
    where o.status = 'confirmed'
      and o.customer_phone = v_phone
      and lower(trim(o.customer_name)) = v_name
      and o.access_token = v_token
    order by o.created_at desc
    limit 20
  ) t;

  return v_result;
end;
$$;

create or replace function public.get_best_sellers(p_limit integer default 12)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_limit integer := greatest(1, least(coalesce(p_limit, 12), 50));
  v_result jsonb;
begin
  select coalesce(jsonb_agg(t.payload), '[]'::jsonb) into v_result
  from (
    select jsonb_build_object(
      'codigo', g.codigo,
      'nombre', max(g.nombre),
      'units', sum(g.qty)
    ) as payload
    from public.order_items g
    join public.orders o on o.id = g.order_id
    where o.status = 'confirmed'
    group by g.codigo
    order by sum(g.qty) desc
    limit v_limit
  ) t;

  return v_result;
end;
$$;

create or replace function public.confirm_order(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status public.order_status;
  v_item record;
begin
  if not public.has_role(auth.uid(), 'admin') then
    raise exception 'No autorizado';
  end if;

  select o.status into v_status
  from public.orders o
  where o.id = p_order_id
  for update;

  if not found then
    raise exception 'Pedido no encontrado';
  end if;
  if v_status <> 'pending' then
    raise exception 'Solo se pueden confirmar pedidos pendientes';
  end if;

  for v_item in
    select i.product_id, i.qty
    from public.order_items i
    where i.order_id = p_order_id
    order by i.product_id
  loop
    if v_item.product_id is not null then
      update public.products
      set stock = coalesce(stock, 0) - v_item.qty, updated_at = now()
      where id = v_item.product_id and coalesce(stock, 0) >= v_item.qty;
      if not found then
        raise exception 'Stock insuficiente para confirmar el pedido';
      end if;
    end if;
  end loop;

  update public.orders
  set status = 'confirmed', confirmed_at = now(), updated_at = now()
  where id = p_order_id;
end;
$$;

drop function if exists public.cancel_order(uuid);

-- cancel_order(p_order_id, p_restock): si el pedido estaba 'confirmed', repone
-- stock (stock + qty por item) SOLO cuando p_restock = true, es decir, cuando el
-- administrador confirma explícitamente que la mercadería volvió a estar
-- disponible para la venta. Con p_restock = false el pedido se cancela sin
-- tocar stock (la mercadería no volvió y las unidades quedan descontadas).
-- Si products.stock es NULL se trata como 0 tanto al descontar (confirm_order)
-- como al reponer (cancel_order), evitando resultados NULL silenciosos.
-- Si estaba 'pending', p_restock se ignora: nunca se descontó stock, cancelar
-- solo libera la reserva lógica.
-- Nota: la importación de Excel fija stock de forma absoluta. Si el Excel se
-- importó después de confirmar el pedido, reponer suma las unidades de vuelta
-- sobre ese valor absoluto; el criterio es que los pedidos confirmados son la
-- fuente de verdad de las ventas y el Excel debe importar el stock físico real
-- restante (el admin debe contemplar las ventas al cargarlo).
create or replace function public.cancel_order(p_order_id uuid, p_restock boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status public.order_status;
  v_item record;
begin
  if not public.has_role(auth.uid(), 'admin') then
    raise exception 'No autorizado';
  end if;

  select o.status into v_status
  from public.orders o
  where o.id = p_order_id
  for update;

  if not found then
    raise exception 'Pedido no encontrado';
  end if;
  if v_status = 'cancelled' then
    raise exception 'El pedido ya está cancelado';
  end if;

  if v_status = 'confirmed' and p_restock then
    for v_item in
      select i.product_id, i.qty
      from public.order_items i
      where i.order_id = p_order_id
      order by i.product_id
    loop
      if v_item.product_id is not null then
        update public.products
        set stock = coalesce(stock, 0) + v_item.qty, updated_at = now()
        where id = v_item.product_id;
      end if;
    end loop;
  end if;

  update public.orders
  set status = 'cancelled', confirmed_at = null, updated_at = now()
  where id = p_order_id;
end;
$$;

revoke all on function public.create_customer_order(text, text, jsonb, text, text, text) from public, anon, authenticated;
revoke all on function public.get_customer_order_history(text, text, text) from public, anon, authenticated;
revoke all on function public.get_best_sellers(integer) from public, anon, authenticated;
revoke all on function public.confirm_order(uuid) from public, anon, authenticated;
revoke all on function public.cancel_order(uuid, boolean) from public, anon, authenticated;

grant execute on function public.create_customer_order(text, text, jsonb, text, text, text) to anon, authenticated;
grant execute on function public.get_customer_order_history(text, text, text) to anon, authenticated;
grant execute on function public.get_best_sellers(integer) to anon, authenticated;
grant execute on function public.confirm_order(uuid) to authenticated;
grant execute on function public.cancel_order(uuid, boolean) to authenticated;
