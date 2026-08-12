# Claude Studio

Chat di Claude Code e barra di contesto, in una sola estensione di VSCode.

La chat non ha un motore proprio: parla con la CLI `claude` gia' installata sul PC
attraverso l'Agent SDK ufficiale. Da li' arrivano gratis autenticazione, modelli,
permessi, `CLAUDE.md`, skill, plugin, MCP, hook, memoria e slash command — tutta roba
che vive nel motore, non nell'interfaccia.

## Stato

- **Fase 1 — fatta**: scheletro, motore, risposta in streaming parola per parola.
- Fase 2: parita' con l'estensione ufficiale (permessi, rendering dei tool, cronologia,
  ingressi, ponte con l'editor).
- Fase 3: la context bar assorbita.
- Fase 4: repertorio completo delle animazioni e rifinitura.

## Sviluppo

```
npm run build       # build di produzione
npm run watch       # ricompila a ogni salvataggio
npm run typecheck   # tsc --noEmit
npm run package     # produce claude-studio.vsix
```

L'estensione **non** impacchetta una copia di `claude`: usa quella installata
globalmente. Se sta in un posto insolito, il percorso di `cli.js` si indica in
Impostazioni → Claude Studio → Cli Path.
