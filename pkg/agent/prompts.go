// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

package agent

import (
	"embed"
	"fmt"
	"strings"
)

//go:embed prompts/*.md
var promptFS embed.FS

var (
	sharedHeader = mustLoadPrompt("shared_header.md")
	askPrompt    = mustLoadPrompt("ask.md")
	planPrompt   = mustLoadPrompt("plan.md")
	doPrompt     = mustLoadPrompt("do.md")
	benchPrompt  = mustLoadPrompt("bench.md")
)

func mustLoadPrompt(name string) string {
	data, err := promptFS.ReadFile("prompts/" + name)
	if err != nil {
		panic(fmt.Sprintf("agent: failed to load prompt %s: %v", name, err))
	}
	return strings.TrimSpace(string(data))
}

// SystemPromptForMode returns the full system-prompt parts for the given mode:
// the shared header plus the mode-specific prompt. Terminal context is appended
// separately via BuildTerminalContext so it updates per request.
func SystemPromptForMode(mode *Mode) []string {
	if mode == nil {
		return []string{sharedHeader}
	}
	var modePrompt string
	switch mode.Name {
	case ModeAsk:
		modePrompt = askPrompt
	case ModePlan:
		modePrompt = planPrompt
	case ModeDo:
		modePrompt = doPrompt
	case ModeBench:
		modePrompt = benchPrompt
	default:
		modePrompt = doPrompt
	}
	return []string{sharedHeader, modePrompt}
}
