-- Pega todo esto en Supabase > SQL Editor > Run
create table profiles (
  id uuid primary key references auth.users on delete cascade,
  name text,
  role text not null default 'cliente' check (role in ('cliente','master'))
);
create table products (
  id bigint generated always as identity primary key,
  name text not null, category text default 'Otros',
  price numeric(8,2) default 0, description text,
  available boolean default true
);
create table orders (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users,
  who text not null, note text,
  status text not null default 'nuevo' check (status in ('nuevo','preparando','listo','entregado')),
  created_at timestamptz default now()
);
create table order_items (
  id bigint generated always as identity primary key,
  order_id bigint not null references orders on delete cascade,
  product_name text not null, qty int not null check (qty > 0), price numeric(8,2)
);

-- Crea el perfil automáticamente al registrarse
create function handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$
begin insert into profiles (id, name) values (new.id, split_part(new.email,'@',1)); return new; end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function handle_new_user();

create function is_master() returns boolean language sql security definer stable set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'master') $$;

alter table profiles enable row level security;
alter table products enable row level security;
alter table orders enable row level security;
alter table order_items enable row level security;

create policy "ver perfil propio" on profiles for select using (id = auth.uid() or is_master());
create policy "ver menu" on products for select to authenticated using (true);
create policy "master edita menu" on products for all using (is_master()) with check (is_master());
create policy "ver pedidos" on orders for select using (user_id = auth.uid() or is_master());
create policy "crear pedido" on orders for insert to authenticated with check (user_id = auth.uid() and status = 'nuevo');
create policy "master cambia estado" on orders for update using (is_master());
create policy "borrar pedido" on orders for delete using (is_master() or (user_id = auth.uid() and status = 'nuevo'));
create policy "ver lineas" on order_items for select using (exists (select 1 from orders o where o.id = order_id and (o.user_id = auth.uid() or is_master())));
create policy "crear lineas" on order_items for insert with check (exists (select 1 from orders o where o.id = order_id and o.user_id = auth.uid() and o.status = 'nuevo'));

alter publication supabase_realtime add table orders;

-- Hazte master (cambia el correo por el tuyo, DESPUÉS de registrarte en la app):
-- update profiles set role = 'master' where id = (select id from auth.users where email = 'tu@correo.com');
