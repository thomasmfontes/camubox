# Guia de Configuração: Mercado Pago para Camubox

Este guia detalha o passo a passo que o cliente titular da conta do **Mercado Pago** precisa seguir para criar a aplicação da API, ativar as credenciais de produção e obter as chaves necessárias para a integração do **Camubox**.

---

## 📌 Requisito Crítico Antes de Iniciar
> [!IMPORTANT]
> A conta do Mercado Pago **deve possuir pelo menos uma chave Pix cadastrada**.
> Se não houver uma chave Pix (CNPJ, E-mail, Telefone ou Chave Aleatória) ativa na conta do Mercado Pago, a API retornará erro ao tentar gerar cobranças Pix.
> 
> **Como cadastrar:** Acesse o app do Mercado Pago no celular -> Vá em **Pix** -> **Minhas Chaves** -> Cadastre uma chave de preferência.

---

## 🚀 Passo a Passo no Painel de Desenvolvedores

O cliente deve acessar o painel usando a conta oficial da empresa:
🔗 **[Mercado Pago Developers](https://www.mercadopago.com.br/developers/)**

---

### Passo 1: Criar a Aplicação
No painel principal, clique em **"Criar nova aplicação"** ou **"Crie uma aplicação"**:

1. **Nome da aplicação:** Digite `Camubox`.
2. Clique em avançar/prosseguir.

---

### Passo 2: Escolher o Tipo de Pagamento
Na tela **"Escolha o tipo de pagamento que quer integrar"**:

1. Selecione **"Pagamentos online"** (Receba pagamentos em uma loja online).
2. Em **"Como você criou a loja?"**, selecione: **"Com um desenvolvimento próprio"**.
3. Em **"URL da loja"**, preencha com: `https://camubox.com`.
4. Clique em prosseguir.

---

### Passo 3: Selecionar o Modelo de Checkout
Na tela **"Selecione como quer receber pagamentos na loja"** (Parte 1):

1. Vá na aba **"Checkouts"**.
2. Selecione a opção **"Checkout Transparente"** (Integração avançada).
3. Clique em prosseguir.

---

### Passo 4: Selecionar a API de Integração
Na tela **"Selecione como quer receber pagamentos na loja"** (Parte 2):

1. Em **"Com qual API você vai integrar?"**, selecione **"API de Pagamentos"** (Opção da direita - Versão anterior).
   *(Esta opção é necessária para podermos gerar o Pix transparente diretamente e o Checkout Pro em paralelo).*
2. Conclua a criação da aplicação.

---

### Passo 5: Ativar Credenciais de Produção
Com a aplicação criada, o cliente será levado para o painel de gerenciamento da aplicação `Camubox`.

1. No menu lateral esquerdo, sob a seção **PRODUÇÃO**, clique em **"Credenciais de produção"**.
2. Preencha o formulário de ativação com as informações do negócio:
   - **Setor:** Selecione o setor que melhor representa a empresa (ex: `Educação / Treinamento`).
   - **Site:** Preencha com `https://camubox.com`.
   - Marque a caixa de autorização de dados pessoais.
   - Marque o reCAPTCHA ("Não sou um robô").
3. Clique no botão azul **"Ativar credenciais de produção"**.

---

## 🔑 O que enviar ao desenvolvedor?

Após a ativação das credenciais de produção:

1. No mesmo menu **"Credenciais de produção"**, serão exibidas as chaves.
2. O cliente deve clicar no botão de copiar ao lado do **Access Token** (ele começa com `APP_USR-...`).
3. Enviar este **Access Token** de forma segura para o desenvolvedor cadastrar no servidor da aplicação.

> [!WARNING]
> Nunca compartilhe o **Access Token** indevidamente. Ele concede acesso total para criar e gerenciar transações financeiras na conta.

---

## 🔗 Passo Extra: Configuração de Webhooks (Notificações em Tempo Real)
Para que o sistema do **Camubox** seja avisado instantaneamente quando um pagamento for aprovado (liberando o armário de forma automática), é necessário configurar a URL de Webhook no Mercado Pago.

### Passo 1: Acessar a tela de Webhooks
1. No painel da aplicação do Mercado Pago, vá no menu lateral esquerdo sob a seção **NOTIFICAÇÕES**.
2. Clique em **"Webhooks"**.
3. Clique no botão azul **"Configurar notificações"** no canto superior direito.

### Passo 2: Configurar o Endpoint e Eventos
Na tela de configuração:
1. Clique na aba **"Modo de produção"**.
2. No campo **URL de produção**, cole o seguinte endereço:
   `https://camubox.com/api/payment/webhook`
3. Na lista de eventos recomendados, marque a caixinha:
   - **`[x] Pagamentos (legacy)`**
4. Role a página até o fim e clique no botão azul **"Salvar configurações"**.

> [!NOTE]
> Após clicar em salvar, o painel do Mercado Pago gerará uma **Assinatura secreta** (chave secreta). Caso seja necessária para fins de validação adicional de segurança, você também pode copiá-la e fornecê-la ao desenvolvedor.

