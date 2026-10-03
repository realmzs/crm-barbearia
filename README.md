# CRM Barbearia

Sistema online para gerenciar clientes e horários de uma barbearia. Cada barbeiro entra com o próprio e-mail e senha, e todos veem a mesma agenda, que se atualiza sozinha quando alguém muda algo.

## Funcionalidades

- **Painel**: agendamentos de hoje, faturamento e ticket médio do mês, aniversariantes e clientes que sumiram há mais de 30 dias, com botão para chamar no WhatsApp.
- **Agenda**: navegação por dia, filtro por barbeiro, marcar atendimento como concluído ou falta, aviso de horário em conflito.
- **Clientes**: cadastro com telefone, nascimento e observações (ex.: tipo de corte), busca, histórico de visitas e total gasto.
- **Configurações**: serviços (preço e duração), barbeiros e backup (exportar/importar).

## Como funciona

- O site (HTML, CSS e JS) fica no **GitHub Pages**.
- Os dados e o login ficam no **Supabase** (banco Postgres com plano gratuito).
- Só entra quem tem usuário criado no Supabase **e** está com o e-mail na tabela `equipe`.

## Configuração (uma vez só)

1. Crie uma conta em [supabase.com](https://supabase.com) e um projeto novo (região: São Paulo).
2. No projeto, abra **SQL Editor**, cole o conteúdo de [`supabase.sql`](supabase.sql) e clique em **Run**.
3. Ainda no SQL Editor, libere os e-mails da equipe:
   ```sql
   insert into equipe (email) values ('dono@exemplo.com'), ('barbeiro@exemplo.com');
   ```
4. Em **Authentication → URL Configuration**, coloque o endereço do site em **Site URL** (ex.: `https://realmzs.github.io/crm-barbearia/`).
5. Em **Authentication → Users → Add user → Send invitation**, convide cada pessoa pelo e-mail. Ela clica no link recebido e cria a própria senha no site.
6. Em **Authentication → Sign In / Providers**, desligue **Allow new users to sign up**, para ninguém criar conta sozinho.
7. Em **Project Settings → API**, copie a **Project URL** e a chave **anon / publishable** para o arquivo [`config.js`](config.js).
   ⚠️ Nunca use a chave `service_role` / `secret` no site.

## Adicionar ou remover um barbeiro

- **Adicionar**: faça os passos 3 e 5 com o e-mail dele e cadastre o nome em **Configurações → Barbeiros**.
- **Esqueceu a senha**: na tela de login, digite o e-mail e clique em **Esqueci minha senha**.
- **Remover o acesso**: `delete from equipe where email = 'barbeiro@exemplo.com';` e apague o usuário em Authentication.

## Arquivos

| Arquivo        | O que tem                                   |
|----------------|---------------------------------------------|
| `index.html`   | Estrutura das telas                         |
| `style.css`    | Visual (tema claro e escuro)                |
| `app.js`       | Lógica, login e comunicação com o banco     |
| `config.js`    | Endereço e chave pública do Supabase        |
| `supabase.sql` | Criação das tabelas e regras de segurança   |
