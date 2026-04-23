// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

package agent

import (
	"strings"
)

// BuildTerminalContext renders a <terminal_context> block that gets appended to the
// system prompt for the current turn. The block tells the model what terminal the
// user invoked the agent from — block id, connection, cwd, last command, and a
// short recent-commands list when available.
func BuildTerminalContext(sess *Session) string {
	if sess == nil {
		return ""
	}
	var b strings.Builder
	b.WriteString("<terminal_context>\n")
	if sess.BlockID != "" {
		b.WriteString("block_id: ")
		b.WriteString(sess.BlockID)
		b.WriteString("\n")
	}
	if sess.TabID != "" {
		b.WriteString("tab_id: ")
		b.WriteString(sess.TabID)
		b.WriteString("\n")
	}
	if sess.Connection != "" {
		b.WriteString("connection: ")
		b.WriteString(sess.Connection)
		b.WriteString("\n")
	}
	if sess.Cwd != "" {
		b.WriteString("cwd: ")
		b.WriteString(sess.Cwd)
		b.WriteString("\n")
	}
	if sess.LastCommand != "" {
		b.WriteString("last_command: ")
		b.WriteString(sess.LastCommand)
		b.WriteString("\n")
	}
	if len(sess.RecentCmds) > 0 {
		b.WriteString("recent_commands:\n")
		for _, cmd := range sess.RecentCmds {
			b.WriteString("  - ")
			b.WriteString(cmd)
			b.WriteString("\n")
		}
	}
	if sess.Mode != nil {
		b.WriteString("agent_mode: ")
		b.WriteString(sess.Mode.Name)
		b.WriteString("\n")
	}
	b.WriteString("</terminal_context>")
	return b.String()
}
