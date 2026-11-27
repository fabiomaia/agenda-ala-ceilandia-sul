# Calendário de Atividades Ala Ceilândia Sul 2027

Site para os líderes marcarem as atividades do ano: o líder escolhe o **mês**, a **atividade** e a **organização**; o administrador define o **dia** e aprova os cadastros.

Funciona com **Supabase** (banco de dados PostgreSQL + login por e-mail e Google) e fica hospedado na **Vercel**. Os dois têm plano gratuito.

## Arquivos

| Arquivo | Para que serve |
|---|---|
| `index.html` | O site inteiro (telas, calendário, login). |
| `publico/index.html` | Calendário público (sem login) em `/publico/`, só com atividades que têm dia definido. |
| `supabase/publico.sql` | Libera a leitura pública dessas atividades. Rode uma vez. |
| `privacidade.html` | Política de privacidade (exigida pelo Google para o login com Google). Troque o e-mail de contato se quiser. |
| `config.js` | Onde você cola os dados do seu projeto Supabase. **É o único arquivo que você precisa editar.** |
| `supabase/schema.sql` | Cria as tabelas e as regras de segurança. Rode **uma vez**. |
| `supabase/migracao.sql` | Traz a atividade que já estava marcada na versão do Claude. |
| `supabase/tornar-dono.sql` | Torna você o administrador principal (dono). |
| `supabase/planejamento.sql` | Planejamento, relatórios, verbas, espaços e resumo semanal. |
| `api/agenda.js` | Agenda para assinar no celular (formato .ics). |
| `apps-script/Lembretes.gs` | Robô de e-mails (lembretes, “Como foi?” e resumo semanal), roda na conta Google do dono. |

---

## Passo a passo (cerca de 40 minutos)

### 1. Criar o projeto no Supabase
1. Entre em **supabase.com** e crie uma conta (pode usar o GitHub).
2. Clique em **New project**.
   - **Name:** `agenda-ala-ceilandia-sul`
   - **Database Password:** crie uma senha forte e **guarde-a**.
   - **Region:** *South America (São Paulo)*.
   - Plano **Free**.
3. Espere uns 2 minutos até o projeto ficar pronto.

### 2. Criar as tabelas
1. No menu da esquerda, abra **SQL Editor** → **New query**.
2. Abra o arquivo `supabase/schema.sql`, copie **tudo**, cole e clique em **Run**. Deve aparecer *Success*.
3. Faça o mesmo com `supabase/migracao.sql` (traz a atividade “Futebol” de 28 de janeiro).

### 3. Copiar as chaves para o `config.js`
1. Vá em **Project Settings → API** (em alguns painéis aparece como **API Keys**).
2. Copie a **Project URL** (ex.: `https://abcdxyz.supabase.co`).
3. Copie a chave **publishable** (começa com `sb_publishable_…`). Se o seu painel mostrar só a chave **anon public**, use essa.
4. Abra o `config.js` e substitua os dois valores.

> ⚠️ Nunca use a chave **secret** / **service_role** no site. A chave publishable é pública de propósito: quem protege os dados são as regras do `schema.sql`.

### 4. Login por e-mail (já vem ligado)
- Em **Authentication → Sign In / Providers → Email**, deixe **Confirm email** ligado: quem criar conta recebe um link para confirmar.
- Opcional: em **Authentication → Emails** você pode traduzir os textos dos e-mails para português.
- O envio de e-mails embutido do Supabase tem um limite baixo de mensagens por hora. Serve bem para uma ala. Se muita gente for criar conta no mesmo dia, peça para usarem **“Continuar com Google”**, que não depende de e-mail.

### 5. Login com Google
1. Entre em **console.cloud.google.com** e crie um projeto (ex.: `Agenda Ala`).
2. Configure a **tela de consentimento OAuth** (no painel novo se chama **Google Auth Platform → Branding/Audience**):
   - Tipo **External**, nome do app “Agenda da Ala Ceilândia Sul”, seu e-mail de suporte.
   - Por enquanto o app fica em **Teste / Testing**. Para publicar, o Google exige os links de página inicial e política de privacidade, que só existirão depois da Vercel. Isso é feito no passo 8.3.
   - Enquanto estiver em Teste, só entra com Google quem estiver na lista **Público-alvo → Usuários de teste** (até 100 e-mails). O login por e-mail e senha funciona para todos.
3. Em **Clients / Credentials → Create client / OAuth client ID**:
   - Tipo: **Web application**.
   - **Authorized redirect URIs:** cole a URL que o Supabase mostra em **Authentication → Sign In / Providers → Google** (algo como `https://abcdxyz.supabase.co/auth/v1/callback`).
   - **Authorized JavaScript origins:** deixe para o passo 8 (você ainda não tem o endereço da Vercel).
4. Copie o **Client ID** e o **Client Secret**.
5. No Supabase, em **Authentication → Sign In / Providers → Google**, ligue o provedor, cole os dois valores e salve.

### 6. Colocar os arquivos no GitHub
1. Entre em **github.com** → **New repository** → nome `agenda-ala-ceilandia-sul` → **Create repository**. Pode ser privado.
2. Clique em **uploading an existing file** (ou **Add file → Upload files**).
3. Arraste `index.html`, `privacidade.html`, `config.js`, `README.md` e a pasta `supabase` → **Commit changes**.

### 7. Publicar na Vercel
1. Entre em **vercel.com** com a sua conta do GitHub (plano **Hobby**, gratuito, para uso pessoal e não comercial).
2. **Add New… → Project** → escolha o repositório `agenda-ala-ceilandia-sul` → **Import**.
3. **Framework Preset:** *Other*. Não precisa mudar mais nada → **Deploy**.
4. Em menos de 1 minuto você recebe o endereço, por exemplo `https://agenda-ala-ceilandia-sul.vercel.app`.

### 8. Avisar ao Supabase e ao Google o endereço do site
1. **Supabase → Authentication → URL Configuration**
   - **Site URL:** `https://agenda-ala-ceilandia-sul.vercel.app`
   - **Redirect URLs → Add URL:** `https://agenda-ala-ceilandia-sul.vercel.app/**`
2. **Google Cloud → o seu OAuth client → Authorized JavaScript origins:** adicione `https://agenda-ala-ceilandia-sul.vercel.app` e salve.

3. **Google Cloud → Google Auth Platform → Branding**
   - **Página inicial do aplicativo:** `https://agenda-ala-ceilandia-sul.vercel.app`
   - **Link da Política de Privacidade:** `https://agenda-ala-ceilandia-sul.vercel.app/privacidade.html`
   - **Domínios autorizados → Adicionar domínio:** `agenda-ala-ceilandia-sul.vercel.app` e `oawfulvhjuqybnqmeqmi.supabase.co` (o do seu projeto Supabase)
   - **Salvar**. Depois, em **Público-alvo**, clique em **Publicar app** → confirmar. O status deve virar **Em produção**.
   - Não faça upload de logotipo: com logotipo o Google exige uma verificação que leva dias.

(Troque pelos seus endereços reais, se forem diferentes.)

### 9. Tornar-se o dono
1. Abra o site e crie **sua** conta (Google ou e-mail).
2. No Supabase, **SQL Editor → New query**, cole `supabase/tornar-dono.sql`, troque `SEU-EMAIL@gmail.com` pelo e-mail que você usou e clique em **Run**.
3. Recarregue o site: na barra lateral deve aparecer **Administrador (dono)** e a tela **Membros**.

### 10. Convidar os líderes
1. Mande o link do site no grupo dos líderes.
2. Cada um cria a conta e preenche **Meu cadastro** (nome, organização e WhatsApp).
3. Você aprova em **Membros**. A partir daí, o líder marca atividades **só da organização dele**. Isso é garantido pelo banco de dados, não só pela tela.
4. Se quiser ajuda para definir os dias, use **Tornar administrador** ao lado do nome do líder. Só você aprova cadastros e vê os contatos.

---

## Como fazer mudanças depois
Edite o arquivo no GitHub (ícone de lápis) → **Commit changes**. A Vercel publica a nova versão sozinha em menos de um minuto.

## Cuidados com o plano gratuito
- **Supabase pausa projetos gratuitos parados por cerca de uma semana.** Os dados não se perdem: você recebe um e-mail de aviso e, se pausar, basta abrir o projeto no painel e clicar em **Resume project**.
- Para guardar uma cópia das atividades: **Table Editor → atividades → Export → CSV**.

## Recursos extras (novembro de 2026)
| Recurso | Onde fica | Observação |
|---|---|---|
| 📲 Agenda no celular | `api/agenda.js`, links `/agenda.ics` e `/agenda/<organização>.ics` | Botão na página pública e em **Link público**. Google Agenda e iPhone atualizam sozinhos a cada poucas horas. |
| 🖨️ Mural com QR code | Página pública → **Imprimir ou salvar PDF**; **Exportar** no site | O QR code leva ao calendário público. |
| 🎉 Feriados | Calendário, página pública e PDF | Nacionais e do DF, calculados para qualquer ano. O admin recebe um alerta ao agendar num feriado. |
| 📋 Planejamento | Dentro de cada atividade | Espaços do prédio, orçamento previsto e checklist por tipo de atividade. Avisa conflito de espaço no mesmo dia. |
| 📝 Relatório | Dentro da atividade, depois que ela acontece | Presença, gasto real e observações. O robô pede o relatório no dia seguinte. |
| 💰 Verbas e 📊 Números | Menu **Números** (só administradores) | Verba anual de cada organização, previsto, gasto real, saldo, responsáveis no prazo, pedidos de ajuda. |
| 🗓️ Resumo semanal | Robô de e-mails (`apps-script/Lembretes.gs`) | Domingo às 7h, para os administradores. Rode `instalar` de novo depois de atualizar o código do robô. |
| ✉️ Entrar sem senha | Tela de login | Link de acesso por e-mail. O e-mail gratuito do Supabase tem limite baixo por hora; para mais envios, configure um SMTP próprio em Authentication → Emails. |

Banco de dados: rode `supabase/planejamento.sql` uma vez (já incluído no fim do `schema.sql`).

## Problemas comuns
| O que aparece | O que fazer |
|---|---|
| “O arquivo config.js ainda não foi preenchido” | Confira o passo 3 e envie o `config.js` atualizado ao GitHub. |
| Google mostra `redirect_uri_mismatch` | A URI de redirecionamento do passo 5.3 precisa ser exatamente a do Supabase. |
| O link de confirmação do e-mail abre `localhost` | Ajuste a **Site URL** no passo 8. |
| “O login com Google ainda não foi ativado” | Ligue o provedor Google no Supabase (passo 5.5). |
| Líder não consegue adicionar atividade | O cadastro dele ainda não foi aprovado em **Membros**. |
| Não aparece “Administrador (dono)” | Rode de novo o `tornar-dono.sql` com o e-mail exato da sua conta. |

## Próxima etapa (opcional): confirmar o WhatsApp
O Supabase consegue enviar um código de confirmação pelo WhatsApp usando o **Twilio** (pago por mensagem e exige cadastrar um número no WhatsApp Business). Isso pode ser acrescentado depois sem mudar o resto do site.
