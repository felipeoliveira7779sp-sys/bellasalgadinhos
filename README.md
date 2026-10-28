# Bellasalgadinhos

Criar o aplicativo de cardápio digital para Bella Salgadinhos com base nos arquivos anexados e conectar ao Supabase:
URL: https://wbxhlfosyhqgdbhvjhop.supabase.co
Anon key: sb_publishable_fE_JfJm9FQTOuN65_AI6zQ_vCyNWeOh

Manter o acesso ao painel protegido pela senha simples via ADMIN_PASSWORD no ambiente.
Implementar o projeto com os arquivos fornecidos e as seguintes melhorias:
1. Controle de abertura da loja pelo painel (status: 'auto' seguindo horário, 'open' para forçar aberta, 'closed' para forçar fechada) refletindo no cardápio.
2. Upload de imagens do cardápio utilizando URLs públicas do bucket de storage 'menu'.
3. Gravação dos dados do pedido no banco de dados antes do redirecionamento para o WhatsApp.
4. Cálculo de frete por CEP e rota/distância com suporte à taxa de retorno para pagamento em Cartão/Dinheiro.
5. Rodar o schema SQL e os dados iniciais fornecidos nos anexos.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://bellasalgadinhos.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/a05c5c5f-bf4b-4624-b58f-5b0c272e6571).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
