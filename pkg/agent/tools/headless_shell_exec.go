// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

package tools

import (
	"bytes"
	"context"
	"fmt"
	"os/exec"
	"strings"
	"syscall"
	"time"

	"github.com/s-zx/crest/pkg/aiusechat/uctypes"
)

const (
	headlessShellMaxOutput = 64 * 1024
)

type headlessShellOutput struct {
	ExitCode     int    `json:"exit_code"`
	DurationMs   int64  `json:"duration_ms"`
	Stdout       string `json:"stdout"`
	Stderr       string `json:"stderr"`
	Truncated    bool   `json:"truncated"`
	TimedOut     bool   `json:"timed_out"`
	SpilloverLog string `json:"spillover_log,omitempty"`
}

func HeadlessShellExec(defaultCwd string, approval func(any) string) uctypes.ToolDefinition {
	return uctypes.ToolDefinition{
		Name:        "shell_exec",
		DisplayName: "Shell Execute",
		Description: "Run a shell command and return stdout, stderr, and exit code. If output is truncated, a spillover log path is provided — use read_text_file to access the full output. For long-running processes, use background=true.",
		ToolLogName: "agent:shell_exec",
		InputSchema: map[string]any{
			"type": "object",
			"properties": map[string]any{
				"cmd": map[string]any{
					"type":        "string",
					"description": "Shell command to execute.",
				},
				"cwd": map[string]any{
					"type":        "string",
					"description": "Working directory. Defaults to the agent's cwd.",
				},
				"timeout_sec": map[string]any{
					"type":        "integer",
					"minimum":     1,
					"maximum":     shellExecMaxTimeout,
					"default":     shellExecDefaultTimeout,
					"description": "Maximum seconds to wait. Default 120, max 600.",
				},
				"background": map[string]any{
					"type":        "boolean",
					"default":     false,
					"description": "Run in the background. Returns immediately without waiting for completion.",
				},
			},
			"required":             []string{"cmd"},
			"additionalProperties": false,
		},
		ToolCallDesc: func(input any, output any, _ *uctypes.UIMessageDataToolUse) string {
			parsed, err := parseShellExecInput(input)
			if err != nil {
				return fmt.Sprintf("shell_exec (invalid: %v)", err)
			}
			if output != nil {
				if out, ok := output.(*headlessShellOutput); ok {
					if out.TimedOut {
						return fmt.Sprintf("ran %q — timed out", truncCmd(parsed.Cmd))
					}
					return fmt.Sprintf("ran %q — exit %d in %dms", truncCmd(parsed.Cmd), out.ExitCode, out.DurationMs)
				}
			}
			return fmt.Sprintf("running %q", truncCmd(parsed.Cmd))
		},
		ToolVerifyInput: func(input any, toolUseData *uctypes.UIMessageDataToolUse) error {
			parsed, err := parseShellExecInput(input)
			if err != nil {
				return err
			}
			if dangerous, reason := IsDangerousCommand(parsed.Cmd); dangerous {
				if toolUseData != nil {
					toolUseData.Approval = uctypes.ApprovalNeedsApproval
					toolUseData.ToolDesc = fmt.Sprintf("DANGEROUS: %s — %q", reason, truncCmd(parsed.Cmd))
				}
			}
			return nil
		},
		ToolAnyCallback: func(input any, toolUseData *uctypes.UIMessageDataToolUse) (any, error) {
			parsed, err := parseShellExecInput(input)
			if err != nil {
				return nil, err
			}
			return runHeadlessShell(parsed, defaultCwd)
		},
		ToolApproval: approval,
	}
}

func runHeadlessShell(params *shellExecInput, defaultCwd string) (*headlessShellOutput, error) {
	cwd := params.Cwd
	if cwd == "" {
		cwd = defaultCwd
	}

	ctx, cancel := context.WithTimeout(context.Background(), time.Duration(params.TimeoutSec)*time.Second)
	defer cancel()

	cmd := exec.CommandContext(ctx, "bash", "-c", params.Cmd)
	cmd.Dir = cwd
	cmd.SysProcAttr = &syscall.SysProcAttr{Setpgid: true}

	if params.Background {
		if err := cmd.Start(); err != nil {
			return nil, fmt.Errorf("start: %w", err)
		}
		return &headlessShellOutput{
			ExitCode: -1,
			Stdout:   fmt.Sprintf("started in background (pid %d)", cmd.Process.Pid),
		}, nil
	}

	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr
	startTime := time.Now()

	err := cmd.Run()
	durationMs := time.Since(startTime).Milliseconds()

	timedOut := ctx.Err() != nil
	exitCode := 0
	if err != nil {
		if exitErr, ok := err.(*exec.ExitError); ok {
			exitCode = exitErr.ExitCode()
		} else if timedOut {
			exitCode = -1
		} else {
			return nil, fmt.Errorf("exec: %w", err)
		}
	}

	stdoutStr := stdout.String()
	stderrStr := stderr.String()
	truncated := false

	if len(stdoutStr) > headlessShellMaxOutput {
		truncated = true
		stdoutStr = stdoutStr[:headlessShellMaxOutput/2] + "\n...[truncated]...\n" + stdoutStr[len(stdoutStr)-headlessShellMaxOutput/2:]
	}
	if len(stderrStr) > headlessShellMaxOutput {
		stderrStr = stderrStr[:headlessShellMaxOutput/2] + "\n...[truncated]...\n" + stderrStr[len(stderrStr)-headlessShellMaxOutput/2:]
	}

	stdoutStr = repairUTF8(stdoutStr)
	stderrStr = repairUTF8(stderrStr)

	var spilloverLog string
	if truncated {
		fullOutput := stdout.String()
		spillFile, spillErr := writeSpillover(fullOutput)
		if spillErr == nil {
			spilloverLog = spillFile
		}
	}

	return &headlessShellOutput{
		ExitCode:     exitCode,
		DurationMs:   durationMs,
		Stdout:       strings.TrimRight(stdoutStr, "\n"),
		Stderr:       strings.TrimRight(stderrStr, "\n"),
		Truncated:    truncated,
		TimedOut:     timedOut,
		SpilloverLog: spilloverLog,
	}, nil
}
