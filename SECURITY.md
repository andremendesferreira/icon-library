# Security Policy

[English](#english) · [Português](#português)

## English

### Supported versions

Icon Library is a website, not a package: only what runs at **[iconlibrary.io](https://iconlibrary.io)** — the latest commit of `main` — is supported. Fixes go to `main` and are deployed from there.

### Reporting a vulnerability

**Please do not open a public issue or discussion for a security problem.**

Report it privately through GitHub: **[Report a vulnerability](https://github.com/andremendesferreira/icon-library/security/advisories/new)** (the *Security* tab → *Report a vulnerability*). Only the maintainer sees it.

Include what you can:

- what is affected (page, API route, file) and what an attacker could do;
- the steps to reproduce it, or a proof of concept;
- the browser or tool you used.

### What to expect

This is a project maintained by one person in their free time, so these are goals, not guarantees:

- an answer within **5 days**;
- a first assessment (accepted, needs more information, or not a vulnerability) within **14 days**;
- for an accepted report, a fix as soon as possible, with progress in the private advisory. Once it is deployed, the advisory is published and you are credited — unless you prefer not to be.

### Scope

In scope:

- the site at `iconlibrary.io` and the code in this repository;
- the server API (`/api/…`): the coffee and supporter codes, Iconlibrary submissions and edits, bug reports, the moderation API and `/admin`;
- the SVG handling: sanitization of submitted icons, the editor, `.ile` files and shared links.

Out of scope:

- third-party services: Stripe, Google AdSense, the CDNs that serve the icon packages, GitHub;
- denial of service, load or rate-limit testing;
- missing security headers or best practices with no demonstrated impact;
- social engineering and physical attacks.

### Testing safely

- Test against your own copy (`npm start` or Docker — see the README), not the live site, whenever possible.
- Do not make real payments to test the coffee, and do not use or share supporter codes that are not yours.
- Do not access, change or delete other people's data, such as icons, reports or codes. If you come across any, stop and say so in your report.

Research done in good faith within these rules is welcome, and will not lead to any complaint from this project.

## Português

### Versões atendidas

O Icon Library é um site, não um pacote: só o que está no ar em **[iconlibrary.io](https://iconlibrary.io)** — o último commit da `main` — é atendido. As correções vão para a `main` e são publicadas a partir dela.

### Como reportar uma vulnerabilidade

**Não abra uma issue ou discussão pública para um problema de segurança.**

Reporte em privado pelo GitHub: **[Report a vulnerability](https://github.com/andremendesferreira/icon-library/security/advisories/new)** (aba *Security* → *Report a vulnerability*). Só o mantenedor vê.

Inclua o que puder:

- o que é afetado (página, rota da API, arquivo) e o que um atacante conseguiria fazer;
- os passos para reproduzir, ou uma prova de conceito;
- o navegador ou a ferramenta usada.

### O que esperar

O projeto é mantido por uma pessoa no tempo livre, então estes prazos são metas, não garantias:

- uma resposta em até **5 dias**;
- uma primeira avaliação (aceita, precisa de mais informações, ou não é vulnerabilidade) em até **14 dias**;
- para um relato aceito, a correção assim que possível, com o andamento no aviso privado. Depois de publicada, o aviso é tornado público com o crédito para você — a menos que prefira não aparecer.

### Escopo

Dentro:

- o site em `iconlibrary.io` e o código deste repositório;
- a API do servidor (`/api/…`): o café e os códigos de apoiador, os envios e as edições da Iconlibrary, os relatos de bug, a API de moderação e o `/admin`;
- o tratamento de SVG: a limpeza dos ícones enviados, o editor, os arquivos `.ile` e os links compartilhados.

Fora:

- serviços de terceiros: Stripe, Google AdSense, as CDNs que servem os pacotes de ícones, o GitHub;
- negação de serviço e testes de carga ou de limite de requisições;
- cabeçalhos de segurança ou boas práticas ausentes, sem impacto demonstrado;
- engenharia social e ataques físicos.

### Testando com segurança

- Sempre que possível, teste na sua própria cópia (`npm start` ou Docker — veja o README), não no site no ar.
- Não faça pagamentos reais para testar o café, e não use nem divulgue códigos de apoiador que não sejam seus.
- Não acesse, altere ou apague dados de outras pessoas, como ícones, relatos ou códigos. Se encontrar algum, pare e conte no seu relato.

Pesquisas feitas de boa-fé dentro destas regras são bem-vindas, e não vão gerar nenhuma reclamação por parte do projeto.
