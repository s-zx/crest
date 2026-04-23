# Forge Native Agent Integration

## Goal

Make Crest run an agent natively from the terminal, Warp-style:

- users configure an AI mode / API key once
- typing `:help ...` at an empty prompt opens agent mode
- the agent runs as a first-class Crest capability, not as an external CLI wrapper

## What This Change Adds

This change implements the frontend-native entry point that the final Forge integration needs:

- terminal input now watches for `:` at an empty shell prompt
- `:` opens a local in-terminal agent overlay instead of sending input to the PTY
- the overlay keeps keyboard ownership in the terminal; it does not use a separate text input
- prompts are streamed through Crest's existing `/api/post-chat-message` transport
- tool approval requests are surfaced directly inside the overlay

This is intentional scaffolding. It proves the terminal UX and session model before swapping the runtime.

## Why This Is Not Yet Forge

The current transport still uses Crest's existing AI backend. That is a temporary runtime choice, not the target architecture.

ForgeCode should not be integrated as:

- an external `forge` CLI launched inside a shell block
- a thin wrapper around the old Wave AI panel
- a duplicate orchestration layer inside `pkg/aiusechat`

ForgeCode should be integrated as a native runtime boundary behind the same terminal overlay UX.

## Target Architecture

### 1. Keep the current `:` terminal entry

The frontend overlay added here is the right UX layer to keep:

- empty-prompt interception
- per-terminal agent session state
- inline streaming transcript
- inline approval controls

This UI should survive the runtime swap.

### 2. Add a backend `AgentRuntime` boundary

Crest should define a runtime interface roughly shaped like:

- `StartSession(blockId, tabId, prompt, context) -> sessionId`
- `StreamSession(sessionId) -> events`
- `ApproveTool(sessionId, toolCallId, decision)`
- `StopSession(sessionId)`

The frontend overlay should eventually talk to this runtime, not directly to `/api/post-chat-message`.

### 3. Bundle Forge as a first-party runtime component

ForgeCode is Rust and Crest is Go/TypeScript. The maintainable integration is:

- ship Forge runtime as a bundled sidecar/core component
- expose a stable IPC boundary
- keep Crest as the source of truth for tabs, terminals, approvals, and workspace metadata

Do not port Forge orchestration into Go by hand.

### 4. Map Crest context into Forge request types

The runtime bridge should map:

- current terminal block / tab / connection
- cwd and last command
- cmdblock history
- selected files / active widgets

into Forge request context such as `Event`, `TerminalContext`, attachments, and conversation/session metadata.

### 5. Replace Forge default shell execution with Crest-controlled execution

This is the critical part.

Forge's default shell tools execute commands through its own subprocess executor. For Crest, that is the wrong authority boundary.

The Forge integration needs a Crest-backed execution adapter so agent actions go through:

- Crest terminal/block controllers
- Crest connection model
- Crest approvals
- Crest file mutation policies
- Crest notifications / cmdblock history

In practice, this means a `CrestCommandInfra`-style adapter, not Forge's stock subprocess path.

## Migration Plan

### Phase 1

Done in this change:

- terminal-native `:` entry
- per-terminal overlay session UX
- inline tool approval path
- runtime currently backed by existing AI streaming endpoint

### Phase 2

Next:

- add backend session RPC + event stream
- move overlay transport off `/api/post-chat-message`
- keep the same frontend session UI

### Phase 3

Forge runtime integration:

- bundle Forge runtime
- translate Crest context into Forge requests
- stream Forge structured events back into the overlay
- route shell/file actions through Crest-owned execution and approval layers

## Practical Rule

If a future change would force the user to run `forge` as a shell command, that change is going in the wrong direction.
