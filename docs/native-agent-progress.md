# Crest Native Go Coding Agent — Progress Tracker

Branch: `feat/native-agent`

## Phase 1 — MVP

### Week 1–2: Skeleton + Read-Only Tools ✅

- [x] `pkg/agent/` package skeleton
- [x] `modes.go` — `ask` / `plan` / `do` modes, `ApprovalPolicy`, `LookupMode`, `ResolveApproval`
- [x] `session.go` — `Session{ChatID, TabID, BlockID, Mode, Cwd, Connection, ...}`
- [x] `context.go` — `BuildTerminalContext(sess)` renders `<terminal_context>` for system prompt
- [x] `prompts/` — `shared_header.md`, `ask.md`, `plan.md`, `do.md`, `UPSTREAM.md` (Forge-attributed)
- [x] `prompts.go` — `//go:embed` loader, `SystemPromptForMode()`
- [x] `registry.go` — `ToolsForMode(sess)`, `buildTool()`, `approvalResolver()`
- [x] `agent.go` — `RunAgent()` → composes `WaveChatOpts`, calls `WaveAIPostMessageWrap`
- [x] `http.go` — `PostAgentMessageHandler` at `/api/post-agent-message`
- [x] `pkg/aiusechat/usechat.go` — exported `GetWaveAISettings()` helper
- [x] `pkg/web/web.go` — route registered
- [x] Read-only tool adapters: `read_text_file`, `read_dir`, `get_scrollback`, `cmd_history`
- [x] `tools/browser_stub.go` — reserves `browser.*` namespace for Phase 2
- [x] Frontend: `term-model.ts` — mode atom, prefix parsing, pending mode+context fields
- [x] Frontend: `term-agent.tsx` — new transport endpoint, mode chip, generalized `TermAgentModel` interface
- [x] `NOTICE` (root) + `pkg/agent/NOTICE` — Apache 2.0 ForgeCode attribution
- [x] `go vet ./...` clean, `tsc --noEmit` clean on modified files

### Week 3–4: Mutation Tools + Do Mode ✅

- [x] `tools/write_file.go` — `WriteTextFile` + `EditTextFile` adapters
- [x] `tools/shell_exec.go` — creates visible cmd-block, polls `BlockControllerRuntimeStatus`, SIGINT timeout, ANSI-strip tail
- [x] `tools/write_plan.go` — writes `.crest-plans/<slug>.md`, optional auto-open preview block
- [x] `tools/create_block.go` — term/preview/web block creation with split positioning
- [x] `tools/focus_block.go` — `setblockfocus` RPC to tab route
- [x] `registry.go` — all new tools wired into `buildTool()` switch

### Week 4: Polish ✅

- [x] Telemetry — `WaveChatOpts.Source = "crest-agent"` flows into `X-Wave-RequestType` header
- [x] Chatstore isolation — `AgentChatStorePrefix = "agent:"` prefix
- [x] Unit tests: 38 total (modes 8, context 3, http 6, tools 19) — all pass

### Integration: termblocks + AI Provider UI ✅

- [x] **Generalized `TermAgentModel` interface** — overlay decoupled from `TermViewModel`, works with any model
- [x] **Agent integrated into `termblocks/`** — atoms, methods, `:` key interception on empty input, overlay rendered
- [x] **Real `<input>` composer** — replaces virtual key capture, auto-focuses on open, Enter/Esc handling
- [x] **AI Provider settings UI** — visual editor in Settings sidebar (`waveaivisual.tsx`):
  - Provider dropdown (OpenAI, OpenRouter, Anthropic, Google, Custom)
  - API key stored securely in OS keychain via `secretstore`
  - Model + Advanced (base URL, max tokens)
- [x] **`ai:apitokensecretname`** added to `SettingsType` + `AiSettingsType` + merge logic
- [x] **Settings fallback** — `resolveAgentAIOpts()` tries waveai mode system first, falls back to `settings.json` fields
- [x] **Provider endpoints** — full URLs (e.g. `https://openrouter.ai/api/v1/chat/completions`)

### Manual E2E ⬜ (awaiting user test)

- [ ] `:ask hello` → AI response in overlay
- [ ] `:plan add retry to RunAIChat` → writes plan file, opens preview block
- [ ] `:do run the unit tests` → approval chip → cmd-block → exit code in chat
- [ ] Denied approval → structured rejection
- [ ] Bare `:` defaults to `do` mode

## Phase 2 — Browser + MCP (~4 weeks) ⬜

- [ ] Browser tool implementation — CDP via `webContents.debugger`, slotted into reserved `browser.*` registry
- [ ] External MCP client (stdio + SSE), tool enumeration + dynamic registration
- [ ] Skills integration: `.kilocode/skills/` as agent-invokable library
- [ ] Refined prompts + approval policies from dogfood signal
- [ ] Eval harness: golden transcript replay + terminal-bench tasks

## Phase 3 — Stretch ⬜

- [ ] Git worktree sandboxing for `:do`
- [ ] Conversation export/import (`.crest-agent.json`)
- [ ] Local embedding-based repo search
- [ ] Multi-block coordinated tasks, plan → execution handoff
- [ ] Endpoint convergence (`/api/post-chat-message` ↔ `/api/post-agent-message`)

## File Inventory

```
pkg/agent/
├── NOTICE
├── agent.go              — RunAgent entrypoint, chatstore prefix, source tag
├── context.go            — BuildTerminalContext
├── context_test.go
├── http.go               — PostAgentMessageHandler, resolveAgentAIOpts (mode + settings fallback)
├── http_test.go
├── modes.go              — ask/plan/do modes, ApprovalPolicy, ResolveApproval
├── modes_test.go
├── prompts.go            — //go:embed loader
├── registry.go           — ToolsForMode, buildTool, approvalResolver
├── session.go            — Session struct
├── prompts/
│   ├── UPSTREAM.md
│   ├── ask.md
│   ├── do.md
│   ├── plan.md
│   └── shared_header.md
└── tools/
    ├── browser_stub.go
    ├── cmd_history.go
    ├── create_block.go
    ├── focus_block.go
    ├── get_scrollback.go
    ├── list_dir.go
    ├── read_file.go
    ├── shell_exec.go
    ├── tools_test.go
    ├── write_file.go
    └── write_plan.go

Modified:
  frontend/app/view/term/term-agent.tsx   — generalized TermAgentModel, real <input> composer
  frontend/app/view/term/term-model.ts    — relaxed canOpenTermAgent for no shell integration
  frontend/app/view/termblocks/termblocks.tsx — agent atoms+methods, : key interception, overlay
  frontend/app/view/waveconfig/waveaivisual.tsx — AI Provider visual settings UI
  frontend/app/view/waveconfig/waveconfig-model.ts — wired visual component, renamed sidebar entry
  pkg/aiusechat/uctypes/uctypes.go        — WaveChatOpts.Source field
  pkg/aiusechat/usechat.go                — exported GetWaveAISettings
  pkg/wconfig/settingsconfig.go           — ai:apitokensecretname in SettingsType
  pkg/wconfig/metaconsts.go               — generated
  pkg/web/web.go                          — /api/post-agent-message route
  NOTICE (root)
```

## Architecture Decisions

- **`pkg/agent` = policy, `pkg/aiusechat` = mechanism.** One-way dependency.
- **Tool adapters** wrap `aiusechat.GetXxxToolDefinition()` + inject mode-aware approval closures.
- **`shell_exec`** creates user-visible cmd-blocks — the Crest differentiator.
- **`TermAgentModel` interface** — decouples overlay from any specific ViewModel.
- **Settings fallback** — agent first tries waveai mode system, then reads `settings.json` AI fields directly.
- **API keys via secretstore** — stored in OS keychain, referenced by `ai:apitokensecretname`.
- **ForgeCode attribution**: Apache 2.0 preserved in `NOTICE` files + `UPSTREAM.md`.

## Open Questions

- `write_plan` auto-opens preview block; revisit after dogfood if too intrusive
- `recent_cmds` cap at 20 entries (~4KB); watch token budget
- Phase 3 endpoint convergence behind feature flag
