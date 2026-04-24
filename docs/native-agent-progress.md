# Crest Native Go Coding Agent — Progress Tracker

Branch: `feat/native-agent`

## Phase 1 — MVP ✅

### Core Implementation
- [x] `pkg/agent/` — 3 modes (ask/plan/do), 10 tools, HTTP handler, prompts, registry, session, context
- [x] `tools/shell_exec.go` — visible cmd-block, poll completion, ANSI-strip tail, SIGINT timeout
- [x] `tools/create_block.go` — term/preview/web block with split positioning
- [x] `tools/write_plan.go` — `.crest-plans/<slug>.md` + auto-open preview
- [x] Chatstore isolation (`"agent:"` prefix), telemetry source tagging
- [x] 38 unit tests across `pkg/agent/` and `pkg/agent/tools/`

### Frontend Integration
- [x] Agent overlay integrated into `termblocks/` (the active terminal view)
- [x] `:` key opens composer on empty input, Esc closes overlay
- [x] Real `<input>` element with auto-focus, Enter/Esc handling
- [x] Mode chip (ask/plan/do) derived from input prefix
- [x] AI Provider settings UI in Settings sidebar

### AI Provider Configuration
- [x] Visual form: provider dropdown, API key (OS keychain), model, advanced (base URL, max tokens)
- [x] `ai:apitokensecretname` added to SettingsType
- [x] Settings fallback: `resolveAgentAIOpts()` tries waveai mode system, falls back to `settings.json`
- [x] Full endpoint URLs for all providers

### E2E Verified
- [x] `:ask hello` → AI response in overlay (OpenRouter)

## Wave Legacy Cleanup ✅

| Step | Removed | Lines |
|------|---------|-------|
| `pkg/wcloud/` | Cloud telemetry upload | -396 |
| Preset system | `AiSettingsType`, preset files, schema | -241 |
| WaveAI panel | `aipanel/` 18 files + 30 downstream refs | -4542 |
| Cloud provider | `AIProvider_Wave`, X-Wave headers, rate limit, premium fallback | -490 |
| Cloud modes | `waveai@quick/balanced/deep`, mode broadcaster | -85 |
| Remaining artifacts | wsh view type, meta constants, telemetry fields | -41 |
| **Total** | | **~5800 lines removed** |

## Phase 2 — Browser + MCP ⬜

- [ ] Browser tool implementation — CDP via `webContents.debugger`, fill `browser.*` stubs
- [ ] External MCP client (stdio + SSE), dynamic tool registration
- [ ] Skills integration: `.kilocode/skills/` as agent-invokable library
- [ ] Eval harness: golden transcript replay + terminal-bench tasks

## Phase 3 — Stretch ⬜

- [ ] Git worktree sandboxing for `:do`
- [ ] Conversation export/import (`.crest-agent.json`)
- [ ] Local embedding-based repo search
- [ ] Multi-block coordinated tasks, plan → execution handoff

## Architecture

- **`pkg/agent` = policy, `pkg/aiusechat` = mechanism.** One-way dependency.
- **Tool adapters** wrap `aiusechat.GetXxxToolDefinition()` + inject mode-aware approval closures.
- **`shell_exec`** creates user-visible cmd-blocks — the Crest differentiator.
- **`TermAgentModel` interface** — decouples overlay from any specific ViewModel.
- **Settings fallback** — agent tries waveai mode system first, then reads `settings.json` directly.
- **API keys via secretstore** — stored in OS keychain, referenced by `ai:apitokensecretname`.
- **ForgeCode attribution**: Apache 2.0 preserved in `NOTICE` files + `UPSTREAM.md`.
