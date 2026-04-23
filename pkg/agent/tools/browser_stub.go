// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

package tools

// This file reserves browser-tool names for Phase 2 without wiring up any
// implementation. When the CDP-backed tool layer lands, the real tool
// constructors will replace these stubs and mode definitions can start
// referencing "browser.*" via glob expansion.
//
// Reserved names:
//   - browser.navigate   — go to a URL in an existing browser block
//   - browser.screenshot — capture a PNG/WebP of the visible viewport
//   - browser.click      — click an element by selector
//   - browser.read_text  — return a11y / DOM text snapshot for the LLM
//
// Approval category: ApprovalCategoryBrowser (defined in pkg/agent/registry.go).
//
// Do NOT add live implementations here without updating:
//   - ToolsForMode in pkg/agent/registry.go
//   - Mode.ToolNames in pkg/agent/modes.go
//   - approval UI grouping on the frontend
