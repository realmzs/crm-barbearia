-- CRM Barbearia: estrutura do banco no Supabase.
-- Cole tudo no SQL Editor do seu projeto e clique em "Run". Pode rodar de novo sem problema.

create table if not exists barbeiros (
  id   text primary key default gen_random_uuid()::text,
  nome text not null
);

create table if not exists servicos (
  id      text primary key default gen_random_uuid()::text,
  nome    text not null,
  preco   numeric(10,2) not null default 0,
  duracao int not null default 30
);

create table if not exists clientes (
  id         text primary key default gen_random_uuid()::text,
  nome       text not null,
  telefone   text,
  nascimento date,
  obs        text,
  criado_em  timestamptz default now()
);

create table if not exists agendamentos (
  id          text primary key default gen_random_uuid()::text,
  cliente_id  text references clientes(id)  on delete set null,
  barbeiro_id text references barbeiros(id) on delete set null,
  servico_id  text references servicos(id)  on delete set null,
  data        date not null,
  hora        text not null,
  valor       numeric(10,2) not null default 0,
  status      text not null default 'agendado'
              check (status in ('agendado', 'concluido', 'faltou', 'cancelado')),
  obs         text,
  criado_em   timestamptz default now()
);
create index if not exists agendamentos_data_idx on agendamentos (data);

-- Quem pode usar o sistema: só os e-mails cadastrados aqui.
create table if not exists equipe (email text primary key);
alter table equipe enable row level security;   -- sem políticas: ninguém lê esta tabela pela internet

create or replace function eh_equipe() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from equipe where email = lower(auth.jwt() ->> 'email'))
$$;
grant execute on function eh_equipe() to authenticated;

do $$
declare t text;
begin
  foreach t in array array['barbeiros', 'servicos', 'clientes', 'agendamentos'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists equipe_acesso on %I', t);
    execute format('create policy equipe_acesso on %I for all to authenticated using (eh_equipe()) with check (eh_equipe())', t);
    -- atualização em tempo real entre os aparelhos
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = t) then
      execute format('alter publication supabase_realtime add table %I', t);
    end if;
  end loop;
end $$;

-- Libere os e-mails da equipe (troque pelos e-mails reais e rode esta linha):
-- insert into equipe (email) values ('dono@exemplo.com'), ('barbeiro@exemplo.com') on conflict do nothing;
