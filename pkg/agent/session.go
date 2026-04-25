// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

package agent

import "github.com/s-zx/crest/pkg/aiusechat/uctypes"

// Session carries per-request context for a single agent turn.
// It is constructed in the HTTP handler from the request body plus workspace state
// and passed into tool factories that need terminal-aware data.
type Session struct {
	ChatID      string
	TabID       string
	BlockID     string
	Mode        *Mode
	AIOpts      uctypes.AIOptsType
	Cwd         string
	Connection  string
	LastCommand string
	RecentCmds  []string
}
