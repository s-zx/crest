// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

package tools

import (
	"regexp"
	"strings"
)

type dangerousPattern struct {
	re     *regexp.Regexp
	reason string
}

var dangerousPatterns = []dangerousPattern{
	{regexp.MustCompile(`\brm\s.*-[a-z]*r[a-z]*f|\brm\s.*-[a-z]*f[a-z]*r`), "recursive force delete (rm -rf)"},
	{regexp.MustCompile(`\bgit\s+push\s.*(-f\b|--force\b|--force-with-lease\b)`), "force push"},
	{regexp.MustCompile(`\bgit\s+reset\s+--hard\b`), "hard reset (discards uncommitted changes)"},
	{regexp.MustCompile(`\bgit\s+clean\s.*-[a-z]*f`), "git clean -f (removes untracked files)"},
	{regexp.MustCompile(`\bgit\s+checkout\s+\.\s*$`), "git checkout . (discards all changes)"},
	{regexp.MustCompile(`\|\s*(sh|bash|zsh|dash)\b`), "pipe to shell"},
	{regexp.MustCompile(`\bcurl\b.*\|\s*sudo\b`), "curl piped to sudo"},
	{regexp.MustCompile(`\bdd\s+.*\bof=/dev/`), "dd write to device"},
	{regexp.MustCompile(`\bmkfs\b`), "format filesystem"},
	{regexp.MustCompile(`\b(shutdown|reboot|halt|poweroff)\b`), "system power command"},
	{regexp.MustCompile(`>\s*/dev/[a-z]`), "redirect to device file"},
	{regexp.MustCompile(`\bchmod\s+(-[a-z]+\s+)*777\b`), "chmod 777 (world-writable)"},
}

func IsDangerousCommand(cmd string) (bool, string) {
	normalized := strings.ToLower(strings.TrimSpace(cmd))
	for _, p := range dangerousPatterns {
		if p.re.MatchString(normalized) {
			return true, p.reason
		}
	}
	return false, ""
}
